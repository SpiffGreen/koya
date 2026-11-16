import { Hono } from "hono";

import { fail } from "./lib/format.js";
import { authMiddleware } from "./middleware/auth.js";
import { page } from "./page.js";
import bookingsRouter from "./routes/bookings.js";
import resetRouter from "./routes/reset.js";
import slotsRouter from "./routes/slots.js";

const app = new Hono();

// Public: the booking web page and a health probe. Everything else needs X-API-Key.
app.get("/", (c) => c.html(page));
app.get("/health", (c) => c.json({ status: "ok" }));

app.use("*", authMiddleware);

app.route("/reset", resetRouter);
app.route("/slots", slotsRouter);
app.route("/bookings", bookingsRouter);

app.notFound((c) => fail(c, 404, "not found"));
app.onError((e, c) => {
  console.error(e);
  return fail(c, 500, "internal server error");
});

export default app;
