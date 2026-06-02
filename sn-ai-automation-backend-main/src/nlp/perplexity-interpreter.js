import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const perplexityKey = process.env.PERPLEXITY_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

const perplexityClient = perplexityKey ? axios.create({
  baseURL: "https://api.perplexity.ai",
  headers: { "Authorization": `Bearer ${perplexityKey}` }
}) : null;

export async function interpretWithPerplexity(text) {
  if (!perplexityClient) {
    console.warn("⚠️  Perplexity API key not configured, using fallback interpreter");
    return interpretWithFallback(text);
  }

  try {
    console.log("🧠 Using Perplexity AI for interpretation...");

    const prompt = `Analyze this ServiceNow requirement and extract:
1. Catalog Item Name
2. Variables needed (with type: string/choice/number/boolean)
3. Approval workflow (manager/security/it/director)
4. Business description

Requirement: "${text}"

Return as JSON:
{
  "name": "Item Name",
  "description": "Description",
  "variables": [{"name": "var1", "type": "string", "label": "Label", "mandatory": true, "choices": []}],
  "approvals": ["manager"],
  "workflow": ["submit", "manager_approval", "fulfillment", "complete"]
}`;

    const response = await perplexityClient.post("/chat/completions", {
      model: "pplx-7b-chat",
      messages: [
        { role: "system", content: "You are a ServiceNow expert. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const content = response.data.choices[0].message.content;
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ No JSON found in Perplexity response:", content);
      return interpretWithFallback(text);
    }

    const result = JSON.parse(jsonMatch[0]);
    
    console.log("✅ Perplexity interpretation successful");
    return {
      type: "catalog_item",
      name: result.name || "Service Request",
      description: result.description || text,
      variables: result.variables || [],
      approvals: result.approvals || ["manager"],
      workflow: result.workflow || ["submit", "manager_approval", "fulfillment", "complete"],
      sla_minutes: 480
    };
  } catch (err) {
    console.error("❌ Perplexity interpretation failed:", err.message);
    console.log("Falling back to rule-based interpreter...");
    return interpretWithFallback(text);
  }
}

function interpretWithFallback(text) {
  console.log("📋 Using fallback rule-based interpreter");
  
  const lowerText = text.toLowerCase();
  let name = "Service Request";
  
  if (lowerText.includes("laptop")) name = "Laptop Request";
  else if (lowerText.includes("password")) name = "Password Reset";
  else if (lowerText.includes("access")) name = "Access Request";
  else if (lowerText.includes("phone")) name = "Phone Request";
  else if (lowerText.includes("software")) name = "Software License";
  
  let approvals = [];
  if (lowerText.includes("manager")) approvals.push("manager");
  if (lowerText.includes("security")) approvals.push("security");
  if (lowerText.includes("it")) approvals.push("it");
  if (approvals.length === 0) approvals = ["manager"];

  let variables = [];
  if (name.includes("Laptop")) {
    variables = [
      { name: "model", type: "choice", label: "Laptop Model", mandatory: true, choices: ["Dell", "HP", "Lenovo", "MacBook"] },
      { name: "justification", type: "string", label: "Business Justification", mandatory: true, choices: [] },
      { name: "os_preference", type: "choice", label: "OS Preference", mandatory: false, choices: ["Windows", "Mac", "Linux"] },
      { name: "urgency", type: "choice", label: "Urgency", mandatory: true, choices: ["Low", "Medium", "High"] }
    ];
  }

  return {
    type: "catalog_item",
    name,
    description: text,
    variables,
    approvals,
    workflow: ["submit", ...approvals.map(a => `${a}_approval`), "fulfillment", "complete"],
    sla_minutes: 480
  };
}