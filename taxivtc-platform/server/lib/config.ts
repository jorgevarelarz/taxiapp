function parseOrigins(value?: string) {
  if (!value) return ["http://localhost:3000"];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const appConfig = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  trustProxy: process.env.TRUST_PROXY === "true",
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "1mb",
};
