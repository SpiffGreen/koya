import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const connection = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
});

export const db = drizzle(connection);