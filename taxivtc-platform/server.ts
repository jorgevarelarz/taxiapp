import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";

// Route imports
import authRoutes from "./server/routes/auth";
import passengerRoutes from "./server/routes/passenger";
import driverRoutes from "./server/routes/driver";
import adminRoutes from "./server/routes/admin";

import { subscribeToTrips, subscribeToDriverLocations } from "./server/sse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-taxi-key";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      if (req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token}`;
      } else {
        return res.status(401).json({ error: "No token provided" });
      }
    }

    const token = req.headers.authorization.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
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
    res.json({ status: "ok", timestamp: new Date() });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TaxiVTC Platform running on http://localhost:${PORT}`);
  });
}

startServer();
