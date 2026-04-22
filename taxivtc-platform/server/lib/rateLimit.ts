type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function createRateLimiter({
  windowMs,
  maxRequests,
}: {
  windowMs: number;
  maxRequests: number;
}) {
  return (req: any, res: any, next: any) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    bucket.count += 1;
    next();
  };
}
