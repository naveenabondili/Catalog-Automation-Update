import OpenAI from "openai";

const API_KEY = process.env.api_key || process.env.OPENAI_API_KEY;
const BASE_URL =
  process.env.OPENAI_BASE_URL ||
  "https://llm.ntk.ibis.head-p2.puma.corp.telstra.com/";
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini-preprod";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_PROCESS_TIMEOUT_MS || 30000);

// Keep TLS verification enabled by default; only disable for local/corporate test setups.
if (process.env.DISABLE_TLS_VERIFY === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const openai = API_KEY
  ? new OpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL
    })
  : null;

export async function interpretWithAI(text) {
  if (!openai) {
    console.warn("AI API key not configured, using rule-based interpreter");
    return null;
  }

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`AI request timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
    });

    const response = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are a ServiceNow automation expert. Parse user requirements and extract:
          1. Catalog item name
          2. Description
          3. Variables (name, type, label, mandatory)
          4. Approval flow (list of approvers)
          5. Workflow steps
          6. SLA in minutes

          Return JSON only.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3
      }),
      timeoutPromise,
    ]);

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (err) {
    console.error("AI interpretation failed, falling back to rule-based:", err.message);
    return null;
  }
}

export default interpretWithAI;