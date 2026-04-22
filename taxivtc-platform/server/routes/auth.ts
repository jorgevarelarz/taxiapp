import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import {
  clearSessionCookie,
  extractAuthToken,
  sanitizeUser,
  setSessionCookie,
  signAuthToken,
  verifyAuthToken,
} from "../lib/auth";
import { createRateLimiter } from "../lib/rateLimit";
import { formatValidationError, loginSchema, registerSchema } from "../lib/validation";
import { ZodError } from "zod";

const router = express.Router();
const prisma = new PrismaClient();
const generateLicenseNumber = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 9);
const authRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Email or phone already registered";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Authentication request failed";
}

router.post("/register", authRateLimiter, async (req, res) => {
  try {
    const { email, password, name, phone, role } = registerSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedPhone = phone.trim();

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashedPassword,
        name: normalizedName,
        phone: normalizedPhone,
        role,
        ...(role === "passenger" ? { passenger: { create: {} } } : {}),
        ...(role === "driver" ? { driver: { create: { licenseNumber: `LIC-${generateLicenseNumber()}` } } } : {}),
      },
      include: { passenger: true, driver: true },
    });

    const token = signAuthToken({ id: user.id, role: user.role });
    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(user), token });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    res.status(400).json({ error: getAuthErrorMessage(error) });
  }
});

router.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { passenger: true, driver: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is inactive" });
    }

    const token = signAuthToken({ id: user.id, role: user.role });
    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(user), token });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    res.status(400).json({ error: getAuthErrorMessage(error) });
  }
});

router.get("/me", async (req: any, res) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ error: "No token" });
  
  try {
    const decoded = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { passenger: true, driver: true },
    });
    if (!user?.isActive) {
      return res.status(403).json({ error: "Account is inactive" });
    }
    res.json(sanitizeUser(user));
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

router.post("/logout", async (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

export default router;
