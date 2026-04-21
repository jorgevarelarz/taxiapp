import express from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-taxi-key";
const generateLicenseNumber = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 9);

router.post("/register", async (req, res) => {
  const { email, password, name, phone, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        phone,
        role,
        ...(role === "passenger" ? { passenger: { create: {} } } : {}),
        ...(role === "driver" ? { driver: { create: { licenseNumber: `LIC-${generateLicenseNumber()}` } } } : {}),
      },
      include: { passenger: true, driver: true },
    });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
    res.json({ user, token });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { passenger: true, driver: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
    res.json({ user, token });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/me", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });
  
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { passenger: true, driver: true },
    });
    res.json(user);
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
