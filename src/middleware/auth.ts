import type { MiddlewareHandler } from "hono";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};