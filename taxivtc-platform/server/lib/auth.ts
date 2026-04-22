import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

type AuthTokenPayload = {
  id: string;
  role: string;
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}

function parseCookieHeader(cookieHeader?: string) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, part) => {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join("="));
    return cookies;
  }, {});
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1] || null;
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies.session_token || null;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie("session_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie("session_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function sanitizeUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash">;
export function sanitizeUser<T extends { passwordHash?: string }>(user: T | null): Omit<T, "passwordHash"> | null;
export function sanitizeUser<T extends { passwordHash?: string }>(user: T | null) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
