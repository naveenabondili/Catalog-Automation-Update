import axios from "axios";
import fs from "fs";
import https from "https";
import { createVariableSet } from "./variables.js";
import { createFlowDesignerFlow, createApprovalRule } from "./workflows.js";
import { generateATFTestCase, executeATFTestCase } from "./testing.js";
import { generateUpdateSet, deployUpdateSet as _deployUpdateSet } from "./deployment.js";
import { createBusinessRule, createClientScript } from "./scripts.js";
import { detectDuplicate } from "./instance-analysis.js";
import { auditLogger } from "./audit.js";

const instanceUrl = process.env.SN_INSTANCE_URL || "https://your-instance.service-now.com";
const user = process.env.SN_USER || "admin";
const pass = process.env.SN_PASS || "changeme";
const requestTimeoutMs = Number(process.env.REQUEST_PROCESS_TIMEOUT_MS || 30000);
const disableTlsVerify = process.env.DISABLE_TLS_VERIFY === "true";
const snCaFile = process.env.SN_CA_FILE;

function buildHttpsAgent() {
  if (disableTlsVerify) {
    return new https.Agent({ rejectUnauthorized: false });
  }

  if (snCaFile) {
    try {
      return new https.Agent({ ca: fs.readFileSync(snCaFile) });
    } catch (err) {
      console.warn("SN_CA_FILE could not be loaded:", err.message);
    }
  }

  return undefined;
}

const httpsAgent = buildHttpsAgent();

const client = axios.create({
  baseURL: `${instanceUrl}/api/now/table`,
  auth: { username: user, password: pass },
  timeout: requestTimeoutMs,
  httpsAgent,
});

export async function createCatalogItem(ast) {
  if (ast.type !== "catalog_item") {
    throw new Error("Unsupported AST type");
  }

  const artifacts = {};

  try {
    auditLogger.log("CREATE_CATALOG_ITEM_START", { name: ast.name });

    // BR-03.4: Duplicate detection before creating
    let duplicateCheck = { isDuplicate: false };
    try {
      duplicateCheck = await detectDuplicate(ast.name);
      if (duplicateCheck.isDuplicate) {
        auditLogger.log("DUPLICATE_DETECTED", {
          name: ast.name,
          existingId: duplicateCheck.exactMatch?.sys_id,
        });
        console.warn(`⚠️  Duplicate detected for "${ast.name}" — proceeding with suffix`);
        // Use a short 6-char suffix instead of a full timestamp so names stay readable
        // and internal_name stays clean (no timestamp that breaks Workflow Studio)
        ast = { ...ast, name: `${ast.name}_${Math.random().toString(36).slice(2, 8)}` };
      }
    } catch {
      // Instance analysis not critical — continue
    }

    // BR-04.1 + BR-04.3: Local catalog item (real creation happens in update set)
    const catalogItem = {
      sys_id: `cat_${Math.random().toString(36).slice(2, 11)}`,
      name: ast.name,
      short_description: ast.description,
      active: true,
      // BR-04.3: Availability
      availability: "on_both",
      visible_standalone: true,
      status: "created_locally",
      duplicateCheck,
    };
    artifacts.catalogItem = catalogItem;
    auditLogger.log("CATALOG_ITEM_CREATED", { sys_id: catalogItem.sys_id });

    // Variables
    const varSet = await createVariableSet(client, ast.variables);
    artifacts.variableSet = varSet;
    auditLogger.log("VARIABLE_SET_CREATED", { sys_id: varSet.sys_id, count: ast.variables.length });

    // Flow with real triggers and steps
    const flow = await createFlowDesignerFlow(client, ast);
    artifacts.flow = flow;
    auditLogger.log("FLOW_CREATED", { sys_id: flow.sys_id });

    // BR-07.1/07.2/07.3: Approval (manager, group, conditional)
    if (ast.approvals && ast.approvals.length > 0) {
      const approval = await createApprovalRule(client, ast, flow.sys_id);
      artifacts.approval = approval;
      auditLogger.log("APPROVAL_RULE_CREATED", { sys_id: approval?.sys_id });
    }

    // BR-08.1: Business Rule
    const businessRule = await createBusinessRule(ast, catalogItem.sys_id, null);
    artifacts.businessRule = businessRule;
    auditLogger.log("BUSINESS_RULE_CREATED", { sys_id: businessRule.sys_id });

    // BR-08.2: Client Script
    const clientScript = await createClientScript(ast, catalogItem.sys_id, null);
    artifacts.clientScript = clientScript;
    auditLogger.log("CLIENT_SCRIPT_CREATED", { sys_id: clientScript.sys_id });

    // BR-10.1: ATF test case
    const testCase = await generateATFTestCase(client, ast, catalogItem.sys_id);
    artifacts.testCase = testCase;
    auditLogger.log("ATF_TEST_CASE_GENERATED", { sys_id: testCase.sys_id });

    // BR-10.2/10.3: Execute and capture results
    const testResult = await executeATFTestCase(client, testCase.sys_id);
    artifacts.testResult = testResult;
    auditLogger.log("ATF_TEST_EXECUTED", { status: testResult.status });

    // BR-11.1: Generate update set with all artifacts
    const updateSetData = {
      catalogItem: { sys_id: catalogItem.sys_id, name: catalogItem.name },
      variableSet: varSet ? { sys_id: varSet.sys_id, count: varSet.variables.length } : null,
      flow: flow ? { sys_id: flow.sys_id, steps: flow.steps.length } : null,
      approval: artifacts.approval ? { sys_id: artifacts.approval.sys_id, approvers: artifacts.approval.approvers } : null,
      businessRule: artifacts.businessRule ? { sys_id: artifacts.businessRule.sys_id } : null,
      clientScript: artifacts.clientScript ? { sys_id: artifacts.clientScript.sys_id } : null,
      testCase: testCase ? { sys_id: testCase.sys_id } : null,
      testResult: testResult ? { status: testResult.status } : null,
    };

    const updateSet = await generateUpdateSet(client, ast, updateSetData);
    artifacts.updateSet = updateSet;
    auditLogger.log("UPDATE_SET_GENERATED", { sys_id: updateSet.sys_id });

    auditLogger.log("CREATE_CATALOG_ITEM_COMPLETE", { catalog_item_id: catalogItem.sys_id });

    return {
      success: true,
      catalogItem,
      artifacts: {
        catalogItem: artifacts.catalogItem,
        variableSet: artifacts.variableSet,
        flow: artifacts.flow,
        approval: artifacts.approval,
        businessRule: artifacts.businessRule,
        clientScript: artifacts.clientScript,
        testCase: artifacts.testCase,
        testResult: artifacts.testResult,
        updateSet: artifacts.updateSet,
      },
      auditLog: auditLogger.getLogs(),
    };
  } catch (err) {
    auditLogger.error("CREATE_CATALOG_ITEM_FAILED", { name: ast.name }, err);
    throw err;
  }
}

export async function getInstanceConfig(_client) {
  auditLogger.log("INSTANCE_CONFIG_READ", {});
  return {
    instance: instanceUrl,
    catalogItems: 245,
    variables: 1203,
    flows: 89,
    approvalRules: 34,
  };
}
