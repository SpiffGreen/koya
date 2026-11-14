import { Hono } from "hono";

import bookingsRouter from "./routes/bookings";
import slotsRouter from "./routes/slots";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.use("/api/*", authMiddleware);
app.use("/api/*", rateLimitMiddleware);

app.route("/api/bookings", bookingsRouter);
app.route("/api/slots", slotsRouter);

export default app;