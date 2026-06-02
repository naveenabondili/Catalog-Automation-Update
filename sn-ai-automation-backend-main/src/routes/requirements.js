import express from "express";
import { interpretRequirement } from "../nlp/interpreter.js";
import { generateAST } from "../ast/generator.js";

const router = express.Router();

router.post("/interpret", async (req, res) => {
  try {
    const { requirement } = req.body;

    if (!requirement || requirement.trim().length === 0) {
      return res.status(400).json({ error: "Requirement text is required" });
    }

    console.log("📥 Received requirement:", requirement);

    // Step 1: Interpret requirement using Gemini
    const interpretedResult = await interpretRequirement(requirement);
    console.log("🔍 Interpreted result:", JSON.stringify(interpretedResult, null, 2));

    // Step 2: Validate interpreted result
    if (!interpretedResult || interpretedResult.type !== "catalog_item") {
      console.error("❌ Invalid interpretation result:", interpretedResult);
      return res.status(400).json({ 
        error: "Failed to interpret requirement",
        details: interpretedResult 
      });
    }

    // Step 3: Generate AST from interpreted result
    const ast = generateAST(interpretedResult);
    console.log("📋 AST generated:", JSON.stringify(ast, null, 2));

    if (!ast || !ast.type) {
      console.error("❌ AST generation failed");
      return res.status(400).json({ 
        error: "Failed to generate AST",
        details: "AST is empty or invalid" 
      });
    }

    // Step 4: Return AST
    res.json({
      success: true,
      ast,
      interpretation: interpretedResult
    });
  } catch (err) {
    console.error("❌ Interpretation error:", err.message);
    res.status(500).json({ 
      error: err.message,
      details: err.stack 
    });
  }
});

export default router;