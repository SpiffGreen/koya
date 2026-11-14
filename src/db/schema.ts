import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const bookingStatus = pgEnum("booking_status", [
  "confirmed",
  "cancelled",
]);

export const slots = pgTable("slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slotId: uuid("slot_id")
      .references(() => slots.id)
      .notNull(),
    patientName: varchar("patient_name", { length: 150 }).notNull(),
    patientEmail: varchar("patient_email", { length: 255 }).notNull(),
    status: bookingStatus("status").default("confirmed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("one_active_booking_per_slot")
      .on(table.slotId)
      .where(sql`${table.status} = 'confirmed'`),
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  requestHash: text("request_hash").notNull(),
  response: text("response"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
