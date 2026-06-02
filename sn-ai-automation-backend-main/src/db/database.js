import bcrypt from "bcryptjs";

const artifacts = new Map();
const auditLogs = [];
const deployments = [];
const users = [];

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function initializeDatabase() {
  const exists = users.find((u) => u.username === "admin");
  if (!exists) {
    const hash = await bcrypt.hash("admin123", 10);
    users.push({
      id: makeId("usr"),
      username: "admin",
      password_hash: hash,
      role: "admin",
      email: "admin@company.com",
      active: true,
      last_login: null,
      created_at: nowIso(),
    });
    console.log("✅ Default admin user seeded (password: admin123)");
  }
}

export async function saveArtifact(requirementId, data) {
  const { catalogItem, artifacts: artifactData, status } = data;
  const existing = artifacts.get(requirementId);
  const record = {
    id: existing?.id || makeId("art"),
    requirement_id: requirementId,
    catalog_item_id: catalogItem?.sys_id || "",
    name: catalogItem?.name || "",
    type: "catalog_item",
    status: status || existing?.status || "created",
    artifacts: artifactData || existing?.artifacts || {},
    created_at: existing?.created_at || nowIso(),
    updated_at: nowIso(),
  };
  artifacts.set(requirementId, record);
}

export async function updateArtifactFlow(requirementId, flowSysId, automated, flowDesignerUrl, flowRecordUrl) {
  const doc = artifacts.get(requirementId);
  if (!doc) return null;

  const updated = clone(doc);
  if (updated.artifacts?.flow) {
    updated.artifacts.flow.sys_id = flowSysId;
    updated.artifacts.flow.status = "created_in_sn";
    updated.artifacts.flow.automated = automated;
    updated.artifacts.flow.flow_designer_url = flowDesignerUrl || null;
    updated.artifacts.flow.flow_record_url = flowRecordUrl || null;
  }
  updated.updated_at = nowIso();
  artifacts.set(requirementId, updated);
  return true;
}

export async function getArtifacts(requirementId) {
  const record = artifacts.get(requirementId);
  return record ? clone(record) : null;
}

export async function getAllArtifacts() {
  return Array.from(artifacts.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((item) => clone(item));
}

export async function logAudit(requirementId, action, details, status = "success", userId = null) {
  const entry = {
    id: makeId("log"),
    requirement_id: requirementId,
    action,
    details: details || {},
    status,
    user_id: userId,
    created_at: nowIso(),
  };
  auditLogs.push(entry);
  return entry.id;
}

export async function getAuditLogs(requirementId = null, limit = 200) {
  const filtered = requirementId
    ? auditLogs.filter((log) => log.requirement_id === requirementId)
    : auditLogs;

  return filtered
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map((item) => clone(item));
}

export async function getUserByUsername(username) {
  const user = users.find((u) => u.username === username && u.active);
  return user ? clone(user) : null;
}

export async function getUserById(id) {
  const user = users.find((u) => u.id === id && u.active);
  if (!user) return null;
  const safe = clone(user);
  delete safe.password_hash;
  return safe;
}

export async function createUser(username, passwordHash, role, email) {
  const newUser = {
    id: makeId("usr"),
    username,
    password_hash: passwordHash,
    role,
    email,
    active: true,
    last_login: null,
    created_at: nowIso(),
  };
  users.push(newUser);
  return newUser.id;
}

export async function updateUserLastLogin(userId) {
  const idx = users.findIndex((u) => u.id === userId);
  if (idx !== -1) {
    users[idx].last_login = nowIso();
  }
}

export async function getAllUsers() {
  return users
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((user) => {
      const safe = clone(user);
      delete safe.password_hash;
      return safe;
    });
}

export async function saveDeployment(updateSetId, targetInstance, status, result) {
  const entry = {
    id: makeId("dep"),
    update_set_id: updateSetId,
    target_instance: targetInstance,
    status,
    result: result || {},
    created_at: nowIso(),
  };
  deployments.push(entry);
  return entry.id;
}
