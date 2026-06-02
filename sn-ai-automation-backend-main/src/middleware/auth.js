// BR-13: Authentication & Authorization middleware
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getUserByUsername, getUserById } from "../db/database.js";

const JWT_SECRET = process.env.JWT_SECRET || "sn-ai-platform-secret-2026";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

// Role hierarchy
export const ROLES = {
  ADMIN: "admin",
  DEVELOPER: "developer",
  ANALYST: "analyst",
  VIEWER: "viewer",
};

const ROLE_PERMISSIONS = {
  admin: ["read", "write", "deploy", "manage_users", "audit"],
  developer: ["read", "write", "deploy", "audit"],
  analyst: ["read", "write", "audit"],
  viewer: ["read"],
};

// BR-13.1: Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// BR-13.1: Verify JWT token middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}

// BR-13.2: Role-based access control middleware
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        error: `Forbidden. Requires '${permission}' permission. Your role: ${req.user.role}`,
      });
    }

    next();
  };
}

// BR-13.2: Require specific role
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Requires one of: ${roles.join(", ")}. Your role: ${req.user.role}`,
      });
    }

    next();
  };
}

// Hash password utility
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}

// Verify password utility
export async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// Optional auth — allows unauthenticated access but attaches user if token present
export function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Invalid token — continue as anonymous
    }
  }

  next();
}
