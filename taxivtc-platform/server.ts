import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { extractAuthToken, getJwtSecret, verifyAuthToken } from "./server/lib/auth";
import { appConfig } from "./server/lib/config";

// Route imports
import authRoutes from "./server/routes/auth";
import passengerRoutes from "./server/routes/passenger";
import driverRoutes from "./server/routes/driver";
import adminRoutes from "./server/routes/admin";

import { subscribeToTrips, subscribeToDriverLocations } from "./server/sse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const startedAt = Date.now();

  app.disable("x-powered-by");
  if (appConfig.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || appConfig.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: appConfig.requestBodyLimit }));

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = extractAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const decoded = verifyAuthToken(token);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // --- API Routes ---
  app.get("/api/events/trips", authenticate, subscribeToTrips);
  app.get("/api/events/drivers", authenticate, subscribeToDriverLocations);
  app.use("/api/auth", authRoutes);
  app.use("/api/passenger", authenticate, passengerRoutes);
  app.use("/api/driver", authenticate, driverRoutes);
  app.use("/api/admin", authenticate, adminRoutes);

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      environment: appConfig.nodeEnv,
      version: "0.1.0",
    });
  });

  // --- Vite Setup ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/pasajeros", (req, res) => {
      res.sendFile(path.join(distPath, "pasajeros.html"));
    });
    app.get("/conductores", (req, res) => {
      res.sendFile(path.join(distPath, "conductores.html"));
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  getJwtSecret();

  app.listen(appConfig.port, "0.0.0.0", () => {
    console.log(`TaxiVTC Platform running on http://localhost:${appConfig.port}`);
  });
}

startServer();
