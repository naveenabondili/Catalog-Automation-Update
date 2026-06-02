export function generateAST(interpretedResult) {
  if (!interpretedResult) {
    console.error("❌ No interpreted result provided to generateAST");
    return null;
  }

  console.log("🔧 Generating AST from:", interpretedResult.type);

  const ast = {
    type: interpretedResult.type || "catalog_item",
    name: interpretedResult.name || "Service Request",
    description: interpretedResult.description || "",
    variables: interpretedResult.variables || [],
    approvals: interpretedResult.approvals || ["manager"],
    workflow: interpretedResult.workflow || ["submit", "fulfillment", "complete"],
    sla_minutes: interpretedResult.sla_minutes || 480,
    metadata: {
      created_at: new Date().toISOString(),
      version: "1.0"
    }
  };

  console.log("✅ AST created:", {
    type: ast.type,
    name: ast.name,
    variables_count: ast.variables.length,
    approvals: ast.approvals
  });

  return ast;
}

export function validateAST(ast) {
  if (!ast || !ast.type) {
    console.error("❌ Invalid AST: missing type");
    return false;
  }

  if (ast.type !== "catalog_item") {
    console.error("❌ Unsupported AST type:", ast.type);
    return false;
  }

  if (!ast.name) {
    console.error("❌ Invalid AST: missing name");
    return false;
  }

  return true;
}

// Example: routes/requirements.js
router.post("/interpret", async (req, res) => {
  try {
    const { requirement } = req.body;
    const interpretedResult = await interpretRequirement(requirement);
    console.log("🔍 Interpreted result:", interpretedResult);

    const ast = generateAST(interpretedResult);
    console.log("📋 AST generated:", ast);

    if (!ast || !validateAST(ast)) {
      console.error("❌ AST generation or validation failed");
      return res.status(400).json({
        error: "Unsupported AST type",
        details: ast
      });
    }

    res.json({ ast }); // <-- Make sure you return the real AST here!
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});