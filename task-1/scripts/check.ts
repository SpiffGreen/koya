// End-to-end check of every level against a running deployment.
//   BASE_URL=https://your-app.vercel.app API_KEY=... npm run check
// WARNING: this calls POST /reset, which deletes every booking and slot on that deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.API_KEY ?? "";
const run = randomUUID().slice(0, 8);

type Res = { status: number; body: any; headers: Headers };

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, body: parsed, headers: res.headers };
}

const results: { name: string; ok: boolean; err?: string }[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log("  ok  ", name); }
  catch (e: any) { results.push({ name, ok: false, err: e.message }); console.log("  FAIL", name, "\n       ", e.message); }
}

const hour = 3600_000;
const at = (h: number) => new Date(Math.floor(Date.now() / hour) * hour + h * hour).toISOString().replace(".000Z", "Z");
const SLOTS = [
  { id: "s3", provider: "Dr Bola", start: at(50), end: at(50.5) },
  { id: "s1", provider: "Dr Ade", start: at(48), end: at(48.5) },
  { id: "s2", provider: "Dr Ade", start: at(49), end: at(49.5) },
  { id: "past", provider: "Dr Ade", start: at(-5), end: at(-4.5) },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, provider: "Dr Page", start: at(60 + i), end: at(60.5 + i) })),
];
const email = (tag: string) => `${tag}-${run}@example.com`;
const errShape = (r: Res) => assert.equal(typeof r.body?.error, "string", `expected {error}, got ${JSON.stringify(r.body)}`);

console.log(`Checking ${BASE}\n`);

console.log("Level 1");
await test("POST /reset replaces slots", async () => {
  const r = await call("POST", "/reset", { slots: SLOTS });
  assert.equal(r.status, 200);
});
await test("GET /slots: every slot, earliest first, with availability", async () => {
  const r = await call("GET", "/slots");
  assert.equal(r.status, 200);
  assert.equal(r.body.slots.length, SLOTS.length);
  const starts = r.body.slots.map((s: any) => Date.parse(s.start));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  const s1 = r.body.slots.find((s: any) => s.id === "s1");
  assert.deepEqual(s1, { ...SLOTS[1], available: true });
});
await test("GET /slots?provider= exact match", async () => {
  const r = await call("GET", "/slots?provider=" + encodeURIComponent("Dr Ade"));
  assert.deepEqual(r.body.slots.map((s: any) => s.id), ["past", "s1", "s2"]);
  const none = await call("GET", "/slots?provider=dr%20ade");
  assert.equal(none.body.slots.length, 0);
});
let booked: any;
await test("POST /bookings returns 201 confirmed", async () => {
  const r = await call("POST", "/bookings", { slot_id: "s1", name: "  Ada Obi ", email: `  ${email("ada").toUpperCase()} ` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  booked = r.body;
  assert.equal(booked.status, "confirmed");
  assert.equal(booked.slot_id, "s1");
  assert.equal(booked.name, "Ada Obi");
  assert.equal(booked.email, email("ada"));
  assert.ok(booked.id && !Number.isNaN(Date.parse(booked.created_at)));
});
await test("GET /bookings/:id returns it; unknown is 404", async () => {
  const r = await call("GET", `/bookings/${booked.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, booked);
  const missing = await call("GET", "/bookings/does-not-exist");
  assert.equal(missing.status, 404); errShape(missing);
});

console.log("\nLevel 2");
await test("missing or wrong API key is 401", async () => {
  for (const headers of [{ "X-API-Key": "" }, { "X-API-Key": "wrong" + KEY }]) {
    for (const [m, p] of [["GET", "/slots"], ["GET", `/bookings/${booked.id}`], ["POST", "/bookings"], ["POST", "/reset"]]) {
      const r = await call(m, p, m === "POST" ? {} : undefined, headers);
      assert.equal(r.status, 401, `${m} ${p}`); errShape(r);
    }
  }
});
await test("missing/empty fields and bad email are 400", async () => {
  const good = { slot_id: "s2", name: "Val", email: email("val") };
  const bad = [
    { ...good, slot_id: undefined }, { ...good, slot_id: "" }, { ...good, name: undefined }, { ...good, name: "   " },
    { ...good, email: undefined }, { ...good, email: "" }, { ...good, email: "not-an-email" }, { ...good, email: "a@b" },
  ];
  for (const b of bad) {
    const r = await call("POST", "/bookings", b);
    assert.equal(r.status, 400, JSON.stringify(b)); errShape(r);
  }
});
await test("unknown slot is 404", async () => {
  const r = await call("POST", "/bookings", { slot_id: "nope", name: "X", email: email("nf") });
  assert.equal(r.status, 404); errShape(r);
});
await test("slot already started is 400", async () => {
  const r = await call("POST", "/bookings", { slot_id: "past", name: "X", email: email("past") });
  assert.equal(r.status, 400); errShape(r);
});

console.log("\nLevel 3");
await test("booked slot is 409 and shows available:false", async () => {
  const r = await call("POST", "/bookings", { slot_id: "s1", name: "Y", email: email("dup") });
  assert.equal(r.status, 409); errShape(r);
  const slots = await call("GET", "/slots");
  assert.equal(slots.body.slots.find((s: any) => s.id === "s1").available, false);
});
await test("30 simultaneous bookings of one slot: exactly one wins", async () => {
  const rs = await Promise.all(
    Array.from({ length: 30 }, (_, i) => call("POST", "/bookings", { slot_id: "s2", name: "Racer", email: email(`race${i}`) })),
  );
  const codes = rs.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1, codes.join(","));
  assert.equal(codes.filter((c) => c === 409).length, 29, codes.join(","));
});
await test("DELETE cancels (200), again is 409, unknown is 404; slot is free again", async () => {
  const r = await call("DELETE", `/bookings/${booked.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "cancelled");
  assert.equal(r.body.id, booked.id);
  const again = await call("DELETE", `/bookings/${booked.id}`);
  assert.equal(again.status, 409); errShape(again);
  const missing = await call("DELETE", "/bookings/does-not-exist");
  assert.equal(missing.status, 404); errShape(missing);
  const slots = await call("GET", "/slots");
  assert.equal(slots.body.slots.find((s: any) => s.id === "s1").available, true);
  const rebook = await call("POST", "/bookings", { slot_id: "s1", name: "Ada", email: email("rebook") });
  assert.equal(rebook.status, 201);
});

console.log("\nLevel 4");
await test("same Idempotency-Key + body replays the same response", async () => {
  const key = randomUUID();
  const body = { slot_id: "s3", name: "Ida", email: email("idem") };
  const a = await call("POST", "/bookings", body, { "Idempotency-Key": key });
  const b = await call("POST", "/bookings", { email: body.email, name: body.name, slot_id: body.slot_id }, { "Idempotency-Key": key });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(b.body.id, a.body.id);
});
await test("same key, different body is 422", async () => {
  const key = randomUUID();
  const a = await call("POST", "/bookings", { slot_id: "p7", name: "Ida", email: email("idem2") }, { "Idempotency-Key": key });
  assert.equal(a.status, 201);
  const b = await call("POST", "/bookings", { slot_id: "p7", name: "Ida Changed", email: email("idem2") }, { "Idempotency-Key": key });
  assert.equal(b.status, 422); errShape(b);
});
await test("10 simultaneous retries with one key create one booking", async () => {
  await call("POST", "/reset", { slots: SLOTS });
  const key = randomUUID();
  const body = { slot_id: "s1", name: "Burst", email: email("burst") };
  const rs = await Promise.all(Array.from({ length: 10 }, () => call("POST", "/bookings", body, { "Idempotency-Key": key })));
  assert.ok(rs.every((r) => r.status === 201), rs.map((r) => r.status).join(","));
  assert.equal(new Set(rs.map((r) => r.body.id)).size, 1);
  const list = await call("GET", `/bookings?email=${encodeURIComponent(email("burst"))}`);
  assert.equal(list.body.bookings.length, 1);
});
await test("pages through a person's bookings, oldest first, case-insensitive", async () => {
  const who = email("pager");
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/bookings", { slot_id: `p${i}`, name: "Pat", email: who });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.id);
  }
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const q: string = `/bookings?email=${encodeURIComponent(who.toUpperCase())}&limit=2` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r = await call("GET", q);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.bookings.length <= 2);
    seen.push(...r.body.bookings.map((b: any) => b.id));
    cursor = r.body.next_cursor;
    pages++;
  } while (cursor && pages < 10);
  assert.deepEqual(seen, ids);
  assert.equal(pages, 3);
  const all = await call("GET", `/bookings?email=${encodeURIComponent(who)}`);
  assert.equal(all.body.next_cursor, null);
  assert.equal(all.body.bookings.length, 5);
});
await test("limit outside 1..50 is 400", async () => {
  for (const l of ["0", "51", "abc", "-1", "2.5"]) {
    const r = await call("GET", `/bookings?email=${encodeURIComponent(email("pager"))}&limit=${l}`);
    assert.equal(r.status, 400, l); errShape(r);
  }
  const ok = await call("GET", `/bookings?email=${encodeURIComponent(email("pager"))}&limit=50`);
  assert.equal(ok.status, 200);
});

console.log("\nLevel 5");
await test("6th attempt per email per minute is 429 with Retry-After; others unaffected", async () => {
  const spam = email("spam");
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await call("POST", "/bookings", { slot_id: "nope", name: "S", email: spam })).status);
  assert.deepEqual(codes, [404, 404, 404, 404, 404]);
  const sixth = await call("POST", "/bookings", { slot_id: "s2", name: "S", email: spam.toUpperCase() });
  assert.equal(sixth.status, 429); errShape(sixth);
  const ra = sixth.headers.get("Retry-After");
  assert.ok(ra && /^\d+$/.test(ra) && Number(ra) >= 1 && Number(ra) <= 60, `Retry-After=${ra}`);
  const other = await call("POST", "/bookings", { slot_id: "s2", name: "Other", email: email("other") });
  assert.equal(other.status, 201);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
