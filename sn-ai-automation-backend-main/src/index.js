import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeDatabase } from "./db/database.js";
import apiRouter from "./routes/api.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
};

app.use(express.json());
app.use(cors(corsOptions));
app.use("/api", apiRouter);

app.get("/", (req, res) => {
  res.json({
    name: "AI-Powered ServiceNow Development Automation Platform",
    version: "0.1.0",
    endpoints: {
      requirements: "POST /api/requirements",
      artifacts: "GET /api/artifacts",
      report: "GET /api/report/:requirementId",
      deploy: "POST /api/deploy/:requirementId",
      health: "GET /api/instance-health",
      logs: "GET /api/audit-logs",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    name: "AI-Powered ServiceNow Development Automation Platform",
    version: "0.1.0",
    status: "running",
    db: "in-memory",
  });
});

// ─── Start: in-memory data layer (no Mongo dependency) ──────────────────────

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await initializeDatabase();
    console.log("🧠 Using in-memory data store");
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Backend startup failed:", err.message);
    process.exit(1);
  }
}

startServer();
