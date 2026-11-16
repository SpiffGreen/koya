import { sql } from "drizzle-orm";
import { bigserial, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const slots = pgTable(
  "slots",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("slots_start_idx").on(t.startAt)],
);

export const bookings = pgTable(
  "bookings",
  {
    // Monotonic insert order: gives "oldest first" and a stable pagination cursor.
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    id: text("id").primaryKey(),
    slotId: text("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: text("status", { enum: ["confirmed", "cancelled"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Backstop for level 3: a slot can never hold two confirmed bookings.
    uniqueIndex("bookings_one_confirmed_per_slot").on(t.slotId).where(sql`${t.status} = 'confirmed'`),
    index("bookings_email_seq_idx").on(t.email, t.seq),
    check("bookings_status_check", sql`${t.status} in ('confirmed', 'cancelled')`),
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingAttempts = pgTable(
  "booking_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_attempts_email_idx").on(t.email, t.attemptedAt)],
);

export type BookingRow = typeof bookings.$inferSelect;
