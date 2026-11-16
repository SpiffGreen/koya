import { Hono } from "hono";

import { fail } from "./lib/format.js";
import { authMiddleware } from "./middleware/auth.js";
import { page } from "./page.js";
import bookingsRouter from "./routes/bookings.js";
import resetRouter from "./routes/reset.js";
import slotsRouter from "./routes/slots.js";

// Every API route lives under /api. Its base URL is https://<host>/api.
const api = new Hono();

// Public health probe. Everything else under /api needs X-API-Key.
api.get("/health", (c) => c.json({ status: "ok" }));
api.use("*", authMiddleware);

api.route("/reset", resetRouter);
api.route("/slots", slotsRouter);
api.route("/bookings", bookingsRouter);

const app = new Hono();

// The booking web page is public and stays at the root.
app.get("/", (c) => c.html(page));
app.route("/api", api);

app.notFound((c) => fail(c, 404, "not found"));
app.onError((e, c) => {
  console.error(e);
  return fail(c, 500, "internal server error");
});

export default app;
