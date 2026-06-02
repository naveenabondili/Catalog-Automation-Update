import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { interpretRequirement } from "../nlp/interpreter.js";
import { interpretWithAI } from "../nlp/advanced-interpreter.js";
import { createCatalogItem, getInstanceConfig } from "../services/servicenow.js";
import { auditLogger } from "../services/audit.js";
import { analyzeInstance } from "../services/instance-analysis.js";
import { createScopedApplication, deployUpdateSet } from "../services/deployment.js";
import {
  saveArtifact,
  getArtifacts,
  getAllArtifacts,
  logAudit,
  getAuditLogs,
  getAllUsers,
  createUser,
  getUserByUsername,
  updateUserLastLogin,
  saveDeployment,
  updateArtifactFlow,
} from "../db/database.js";
import { generateArtifactReport } from "../services/pdf-export.js";
import { sendWebhook } from "../services/webhook.js";
import { deployToServiceNow, checkInstanceHealth } from "../services/servicenow-real-api.js";
import {
  authenticateToken,
  requirePermission,
  requireRole,
  generateToken,
  hashPassword,
  verifyPassword,
  optionalAuth,
  ROLES,
} from "../middleware/auth.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// BR-01.2: File upload configuration (PDF, Excel, TXT)
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, TXT, Excel, CSV`));
    }
  },
});

// Helper: extract text from uploaded file
async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".txt" || ext === ".csv") {
    return fs.readFileSync(file.path, "utf8");
  }

  if (ext === ".pdf") {
    // Basic PDF text extraction — reads raw buffer and finds text streams
    const buffer = fs.readFileSync(file.path);
    const text = buffer.toString("latin1");
    // Extract text between BT and ET markers (PDF text objects)
    const matches = text.match(/BT[\s\S]*?ET/g) || [];
    const extracted = matches
      .join(" ")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return extracted.length > 20 ? extracted : "PDF uploaded — please describe your requirement in text";
  }

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.default.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.default.utils.sheet_to_csv(sheet);
      return data;
    } catch {
      return "Excel uploaded — please describe your requirement in text";
    }
  }

  return "File uploaded — please describe your requirement in text";
}

function applyTargetCatalogItem(result, targetCatalogItemSysId, targetCatalogItemName) {
  const sysId = typeof targetCatalogItemSysId === "string" ? targetCatalogItemSysId.trim() : "";
  const name = typeof targetCatalogItemName === "string" ? targetCatalogItemName.trim() : "";

  if (!sysId && !name) return null;

  const targetPatch = {
    ...(sysId ? { sys_id: sysId } : {}),
    ...(sysId ? { target_lookup_sys_id: sysId } : {}),
    ...(name ? { target_lookup_name: name } : {}),
    status: "target_in_instance",
  };

  result.catalogItem = {
    ...(result.catalogItem || {}),
    ...targetPatch,
  };

  result.artifacts = {
    ...(result.artifacts || {}),
    catalogItem: {
      ...(result.artifacts?.catalogItem || {}),
      ...targetPatch,
    },
  };

  return {
    sys_id: sysId || null,
    name: name || null,
  };
}

function normalizeMandatoryFields(ast, sourceText) {
  if (!ast || !Array.isArray(ast.variables)) return;

  const text = String(sourceText || "").toLowerCase();
  const allRequired = /all\s+variables?\s+(are\s+)?(mandatory|required)|all\s+fields?\s+(are\s+)?(mandatory|required)/i.test(text);

  ast.variables = ast.variables.map((variable) => {
    const normalized = { ...variable };

    if (allRequired) {
      normalized.mandatory = true;
      return normalized;
    }

    if (normalized.mandatory === true) return normalized;

    const varName = String(normalized.name || "").toLowerCase();
    const varLabel = String(normalized.label || "").toLowerCase();
    const hasRequiredHint =
      (varName && new RegExp(`${varName}[^.\n]{0,30}(mandatory|required)`, "i").test(text)) ||
      (varLabel && new RegExp(`${varLabel}[^.\n]{0,30}(mandatory|required)`, "i").test(text));

    normalized.mandatory = hasRequiredHint ? true : normalized.mandatory === true;
    return normalized;
  });
}

function carryForwardVariableIdentity(result, existingArtifact) {
  const existingVars = existingArtifact?.artifacts?.variableSet?.variables || [];
  const nextVars = result?.artifacts?.variableSet?.variables || [];
  if (!Array.isArray(existingVars) || !Array.isArray(nextVars) || nextVars.length === 0) return;

  const byName = new Map();
  const byLabel = new Map();
  existingVars.forEach((v) => {
    if (v?.sys_id && v?.name) byName.set(String(v.name).toLowerCase(), v.sys_id);
    if (v?.sys_id && v?.label) byLabel.set(String(v.label).toLowerCase(), v.sys_id);
  });

  const merged = nextVars.map((v, i) => {
    if (v?.sys_id) return v;

    const nameKey = String(v?.name || "").toLowerCase();
    const labelKey = String(v?.label || "").toLowerCase();
    const matchedSysId =
      (nameKey && byName.get(nameKey)) ||
      (labelKey && byLabel.get(labelKey)) ||
      (existingVars[i]?.sys_id || null);

    return matchedSysId ? { ...v, sys_id: matchedSysId } : v;
  });

  if (result.variableSet) result.variableSet.variables = merged;
  if (result.artifacts?.variableSet) result.artifacts.variableSet.variables = merged;
}

// ─── AUTH ROUTES (BR-13) ──────────────────────────────────────────────────────

// BR-13.1: Login — returns JWT token
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await updateUserLastLogin(user.id);
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BR-13.2: Register new user (admin only)
router.post("/auth/register", authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { username, password, role, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const validRoles = Object.values(ROLES);
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(", ")}` });
    }

    const existing = await getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const hash = await hashPassword(password);
    const userId = await createUser(username, hash, role || ROLES.VIEWER, email || "");

    res.status(201).json({ success: true, userId, username, role: role || ROLES.VIEWER });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user profile
router.get("/auth/me", authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// BR-13.2: List users (admin only)
router.get("/auth/users", authenticateToken, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REQUIREMENTS (BR-01, BR-02, BR-09) ──────────────────────────────────────

// BR-01.1: Text-based requirement submission
router.post("/requirements", optionalAuth, async (req, res) => {
  let requirementId = uuidv4();
  try {
    const {
      text,
      useAI,
      requirementId: requestedRequirementId,
      targetCatalogItemName,
      targetCatalogItemSysId,
    } = req.body;

    if (requestedRequirementId && typeof requestedRequirementId === "string" && requestedRequirementId.trim()) {
      requirementId = requestedRequirementId.trim();
      const existing = await getArtifacts(requirementId);
      if (!existing) {
        return res.status(404).json({ error: "Requirement not found for update" });
      }
    }

    // BR-01.3: Input validation
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      return res.status(400).json({ error: "Requirement text too short (minimum 10 characters)" });
    }
    if (trimmed.length > 5000) {
      return res.status(400).json({ error: "Requirement text too long (maximum 5000 characters)" });
    }

    let ast;
    if (useAI) {
      ast = await interpretWithAI(trimmed);
      if (!ast) ast = await interpretRequirement(trimmed);
    } else {
      ast = await interpretRequirement(trimmed);
    }

    normalizeMandatoryFields(ast, trimmed);

    console.log("AST generated:", JSON.stringify(ast, null, 2));

    if (ast.type === "unknown") {
      return res.status(400).json({ error: ast.error });
    }

    await logAudit(requirementId, "AST_GENERATED", { text: trimmed, ast }, "success", req.user?.id);

    const result = await createCatalogItem(ast);

    // If this request targets an existing requirement, preserve deployed catalog and variable identity.
    if (requestedRequirementId) {
      const existing = await getArtifacts(requirementId);
      const existingCatalog = existing?.artifacts?.catalogItem;
      if (existingCatalog?.sys_id) {
        result.catalogItem = {
          ...result.catalogItem,
          sys_id: existingCatalog.sys_id,
          status: existingCatalog.status || result.catalogItem?.status || "updated_locally",
        };
      }
      carryForwardVariableIdentity(result, existing);
    }

    const targetCatalogItem = applyTargetCatalogItem(result, targetCatalogItemSysId, targetCatalogItemName);

    await saveArtifact(requirementId, result);
    await logAudit(
      requirementId,
      requestedRequirementId ? "ARTIFACT_UPDATED_FROM_REQUIREMENT" : "ARTIFACT_SAVED",
      { requirement_id: requirementId, target_catalog_item: targetCatalogItem },
      "success",
      req.user?.id
    );

    await sendWebhook("requirement_processed", { requirementId, ast, result });

    res.json({
      success: true,
      updated: !!requestedRequirementId,
      requirementId,
      ast,
      targetCatalogItem,
      ...result,
    });
  } catch (err) {
    await logAudit(requirementId, "ERROR", { error: err.message }, "error");
    console.error("Error details:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// BR-01.2: Document upload — extract text and process
router.post("/requirements/upload", optionalAuth, upload.single("file"), async (req, res) => {
  const requirementId = uuidv4();
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const extractedText = await extractTextFromFile(req.file);

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch {}

    // BR-01.3: Validate extracted content
    if (!extractedText || extractedText.trim().length < 10) {
      return res.status(400).json({ error: "Could not extract meaningful text from file. Please check the file content." });
    }

    await logAudit(requirementId, "FILE_UPLOADED", {
      filename: req.file.originalname,
      size: req.file.size,
      extractedLength: extractedText.length,
    }, "success", req.user?.id);

    const ast = await interpretRequirement(extractedText.slice(0, 5000));

    normalizeMandatoryFields(ast, extractedText);

    if (ast.type === "unknown") {
      return res.status(400).json({ error: ast.error });
    }

    const { targetCatalogItemName, targetCatalogItemSysId } = req.body || {};

    const result = await createCatalogItem(ast);
    const targetCatalogItem = applyTargetCatalogItem(result, targetCatalogItemSysId, targetCatalogItemName);
    await saveArtifact(requirementId, result);
    await logAudit(
      requirementId,
      "ARTIFACT_SAVED_FROM_FILE",
      { requirement_id: requirementId, target_catalog_item: targetCatalogItem },
      "success",
      req.user?.id
    );

    res.json({
      success: true,
      requirementId,
      ast,
      targetCatalogItem,
      extractedText: extractedText.slice(0, 500) + (extractedText.length > 500 ? "..." : ""),
      ...result,
    });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    await logAudit(requirementId, "ERROR", { error: err.message }, "error");
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ARTIFACTS ────────────────────────────────────────────────────────────────

router.get("/artifacts", async (req, res) => {
  try {
    const artifacts = await getAllArtifacts();
    res.json({ success: true, count: artifacts.length, artifacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/artifacts/:requirementId", async (req, res) => {
  try {
    const artifact = await getArtifacts(req.params.requirementId);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    res.json({ success: true, artifact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BR-04/05 edit: Update artifact fields before deployment
router.put("/artifacts/:requirementId", optionalAuth, async (req, res) => {
  try {
    const existing = await getArtifacts(req.params.requirementId);
    if (!existing) return res.status(404).json({ error: "Artifact not found" });

    const updates = req.body; // { catalogItem, variableSet, flow, approval, ... }

    // Deep-merge into existing artifacts — only overwrite provided keys
    const merged = { ...existing.artifacts };
    for (const key of Object.keys(updates)) {
      if (updates[key] !== undefined) {
        merged[key] = { ...(merged[key] || {}), ...updates[key] };
      }
    }

    // Persist
    await saveArtifact(req.params.requirementId, {
      catalogItem: merged.catalogItem,
      artifacts: merged,
      status: existing.status,
    });

    await logAudit(req.params.requirementId, "ARTIFACT_UPDATED", { fields: Object.keys(updates) }, "success", req.user?.id);

    res.json({ success: true, artifacts: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clone artifact — deep-copies an artifact under a new requirementId
router.post("/artifacts/:requirementId/clone", optionalAuth, async (req, res) => {
  try {
    const source = await getArtifacts(req.params.requirementId);
    if (!source) return res.status(404).json({ error: "Artifact not found" });

    const newId = uuidv4();
    const arts = typeof source.artifacts === "string"
      ? JSON.parse(source.artifacts)
      : source.artifacts;

    // Give the clone a distinct name
    const cloned = {
      ...arts,
      catalogItem: {
        ...arts.catalogItem,
        sys_id: `cat_${Math.random().toString(36).slice(2, 11)}`,
        name: `${arts.catalogItem?.name || "Item"} (Copy)`,
        status: "created_locally",
      },
    };

    await saveArtifact(newId, {
      catalogItem: cloned.catalogItem,
      artifacts: cloned,
      status: "generated",
    });

    await logAudit(newId, "ARTIFACT_CLONED", { source_id: req.params.requirementId }, "success", req.user?.id);
    res.status(201).json({ success: true, requirementId: newId, name: cloned.catalogItem.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────

router.get("/report/:requirementId", async (req, res) => {
  try {
    const artifact = await getArtifacts(req.params.requirementId);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    const filePath = generateArtifactReport(req.params.requirementId, artifact.artifacts, artifact);
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DEPLOYMENT (BR-11) ───────────────────────────────────────────────────────

router.post("/deploy/:requirementId", optionalAuth, async (req, res) => {
  try {
    const artifact = await getArtifacts(req.params.requirementId);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    await logAudit(req.params.requirementId, "DEPLOYMENT_START", {}, "success", req.user?.id);

    const result = await deployToServiceNow(artifact.artifacts);

    if (result.success) {
      await logAudit(req.params.requirementId, "DEPLOYMENT_SUCCESS", result, "success", req.user?.id);
      await sendWebhook("deployment_success", { requirementId: req.params.requirementId, result });
      if (artifact.artifacts?.updateSet?.sys_id) {
        await saveDeployment(artifact.artifacts.updateSet.sys_id, process.env.SN_INSTANCE_URL, "deployed", result);
      }

      const mergedArtifacts = {
        ...artifact.artifacts,
        catalogItem: {
          ...(artifact.artifacts?.catalogItem || {}),
          ...(result.catalog_item_id ? { sys_id: result.catalog_item_id } : {}),
          ...(result.deployment_mode === "updated" ? { status: "updated_in_sn" } : { status: "created_in_sn" }),
        },
        variableSet: {
          ...(artifact.artifacts?.variableSet || {}),
          ...(Array.isArray(result.variable_details) ? { variables: result.variable_details } : {}),
          status: "created_in_sn",
        },
        updateSet: {
          ...(artifact.artifacts?.updateSet || {}),
          ...(result.update_set_id ? { sys_id: result.update_set_id } : {}),
          status: "deployed",
        },
      };

      await saveArtifact(req.params.requirementId, {
        catalogItem: mergedArtifacts.catalogItem,
        artifacts: mergedArtifacts,
        status: "deployed",
      });

      // Update stored artifact with the real deployed flow sys_id and full URL
      const fs = result.flow_setup;
      if (fs?.flow_sys_id) {
        await updateArtifactFlow(req.params.requirementId, fs.flow_sys_id, fs.automated || false, fs.flow_designer_url, fs.flow_record_url);
      }
    } else {
      await logAudit(req.params.requirementId, "DEPLOYMENT_FAILED", result, "error");
    }

    res.json({ success: result.success, result });
  } catch (err) {
    await logAudit(req.params.requirementId, "DEPLOYMENT_ERROR", { error: err.message }, "error");
    res.status(500).json({ error: err.message });
  }
});

// BR-11.2: Deploy as scoped application
router.post("/deploy/:requirementId/scoped", authenticateToken, requirePermission("deploy"), async (req, res) => {
  try {
    const artifact = await getArtifacts(req.params.requirementId);
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    const ast = artifact.artifacts?.catalogItem || {};
    const scopedApp = await createScopedApplication({ name: artifact.name, description: ast.short_description });

    await logAudit(req.params.requirementId, "SCOPED_APP_CREATED", scopedApp, "success", req.user?.id);

    res.json({ success: true, scopedApp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INSTANCE ANALYSIS (BR-03) ───────────────────────────────────────────────

router.get("/instance-health", async (req, res) => {
  try {
    const health = await checkInstanceHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BR-03: Full instance analysis
router.get("/instance-analysis", authenticateToken, async (req, res) => {
  try {
    const { name } = req.query;
    const analysis = await analyzeInstance(name || "");
    res.json({ success: true, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BR-03.4: Standalone duplicate check
router.get("/duplicate-check", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "name query param required" });

    const { detectDuplicate } = await import("../services/instance-analysis.js");
    const result = await detectDuplicate(name);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUDIT LOGS (BR-12) ──────────────────────────────────────────────────────

router.get("/audit-logs", async (req, res) => {
  try {
    const { requirementId } = req.query;
    const logs = await getAuditLogs(requirementId || null, 200);
    // Also include in-memory logs
    const memLogs = auditLogger.getLogs();
    const combined = [...logs, ...memLogs].sort(
      (a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp)
    );
    res.json({ success: true, logs: combined, count: combined.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
