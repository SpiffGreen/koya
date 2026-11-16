// The patient-facing page. Served at "/" and talks to the API on the same origin.
// The API key is typed in once and kept in this browser only; it is never embedded in the page.
export const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clinic Booking</title>
<style>
  :root {
    --bg: #f6f7f9; --surface: #ffffff; --text: #14171c; --muted: #5d6673; --line: #e2e5ea;
    --accent: #0f766e; --accent-ink: #ffffff; --accent-soft: #e6f4f2; --danger: #b42318; --danger-soft: #fdecea;
    --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --surface: #171a20; --text: #e8eaee; --muted: #9aa3af; --line: #2a2f38;
      --accent: #2dd4bf; --accent-ink: #062925; --accent-soft: #12322f; --danger: #f97066; --danger-soft: #3a1714;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 17px; margin: 0 0 12px; }
  p.lead { color: var(--muted); margin: 0 0 24px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  input, select { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); color: var(--text); font: inherit; }
  input:focus, select:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  button { font: inherit; border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer;
    background: var(--accent); color: var(--accent-ink); font-weight: 600; }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); }
  button.danger { background: var(--danger-soft); color: var(--danger); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .row { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
  .row > .grow { flex: 1 1 200px; }
  .day { font-size: 13px; font-weight: 600; color: var(--muted); margin: 18px 0 8px; text-transform: uppercase; letter-spacing: .04em; }
  .day:first-child { margin-top: 0; }
  .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .slot { text-align: left; background: var(--bg); color: var(--text); border: 1px solid var(--line); padding: 10px 12px; font-weight: 500; }
  .slot small { display: block; color: var(--muted); font-weight: 400; }
  .slot[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
  .slot:disabled { text-decoration: line-through; }
  .msg { padding: 10px 12px; border-radius: 8px; margin-top: 12px; font-size: 14px; }
  .msg.error { background: var(--danger-soft); color: var(--danger); }
  .msg.ok { background: var(--accent-soft); color: var(--text); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0 0 16px; }
  dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--accent-soft); color: var(--accent); }
  .badge.cancelled { background: var(--danger-soft); color: var(--danger); }
  ul.list { list-style: none; padding: 0; margin: 12px 0 0; }
  ul.list li { padding: 10px 0; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .muted { color: var(--muted); }
  details summary { cursor: pointer; color: var(--muted); font-size: 14px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1>Book an appointment</h1>
  <p class="lead">Pick an open time, enter your details, and you'll get a confirmation straight away.</p>

  <details class="card" id="keyBox">
    <summary>Clinic API key <span id="keyState" class="muted"></span></summary>
    <div class="row" style="margin-top:12px">
      <div class="grow"><label for="apiKey">Key (saved in this browser only)</label><input id="apiKey" type="password" autocomplete="off"></div>
      <button id="saveKey" type="button">Save</button>
    </div>
  </details>

  <section class="card">
    <div class="row" style="margin-bottom:16px">
      <h2 class="grow" style="margin:0">Available times</h2>
      <div style="min-width:180px"><label for="provider">Provider</label><select id="provider"><option value="">All providers</option></select></div>
    </div>
    <div id="slotList" class="muted">Loading…</div>
  </section>

  <section class="card" id="bookCard" hidden>
    <h2>Your details</h2>
    <p class="muted" id="chosen" style="margin-top:-6px"></p>
    <form id="bookForm" novalidate>
      <div class="row">
        <div class="grow"><label for="name">Full name</label><input id="name" required autocomplete="name"></div>
        <div class="grow"><label for="email">Email</label><input id="email" type="email" required autocomplete="email"></div>
      </div>
      <div class="row" style="margin-top:14px"><button type="submit" id="bookBtn">Confirm booking</button></div>
      <div id="bookMsg"></div>
    </form>
  </section>

  <section class="card" id="confirmCard" hidden>
    <h2>Booking confirmed</h2>
    <div id="confirmBody"></div>
  </section>

  <section class="card">
    <h2>Find a booking</h2>
    <div class="row">
      <div class="grow"><label for="lookupId">Booking ID</label><input id="lookupId" autocomplete="off"></div>
      <button class="ghost" id="lookupBtn" type="button">Look up</button>
    </div>
    <div id="lookupOut"></div>
    <div class="row" style="margin-top:18px">
      <div class="grow"><label for="mineEmail">Or list every booking for an email</label><input id="mineEmail" type="email"></div>
      <button class="ghost" id="mineBtn" type="button">Show bookings</button>
    </div>
    <ul class="list" id="mineList"></ul>
    <button class="ghost" id="moreBtn" type="button" hidden style="margin-top:8px">Load more</button>
  </section>
</main>

<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get() { try { return localStorage.getItem("clinicApiKey") || ""; } catch { return ""; } },
    set(v) { try { localStorage.setItem("clinicApiKey", v); } catch {} },
  };
  let apiKey = store.get();
  let slots = [];
  let chosen = null;
  let idemKey = null;
  let mineCursor = null;

  const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const msg = (el, kind, text) => { el.innerHTML = text ? '<div class="msg ' + kind + '">' + esc(text) + "</div>" : ""; };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey, ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(res.status === 401 ? "The API key is missing or wrong. Open “Clinic API key” above." : data.error || "Request failed (" + res.status + ")");
      e.status = res.status;
      e.retryAfter = res.headers.get("Retry-After");
      throw e;
    }
    return data;
  }

  function showKeyState() {
    $("keyState").textContent = apiKey ? "· saved" : "· required";
    $("keyBox").open = !apiKey;
    $("apiKey").value = apiKey;
  }

  async function loadSlots() {
    const list = $("slotList");
    if (!apiKey) { list.textContent = "Enter the clinic API key above to see times."; return; }
    try {
      const all = (await api("/api/slots")).slots;
      const providers = [...new Set(all.map((s) => s.provider))].sort();
      const sel = $("provider"), current = sel.value;
      sel.innerHTML = '<option value="">All providers</option>' + providers.map((p) => '<option>' + esc(p) + "</option>").join("");
      sel.value = providers.includes(current) ? current : "";
      slots = all;
      renderSlots();
    } catch (e) { list.innerHTML = ""; msg(list, "error", e.message); }
  }

  function renderSlots() {
    const list = $("slotList");
    const provider = $("provider").value;
    const now = Date.now();
    const shown = slots.filter((s) => (!provider || s.provider === provider) && new Date(s.start).getTime() > now);
    if (!shown.length) { list.innerHTML = '<span class="muted">No upcoming times.</span>'; return; }
    let html = "", day = "";
    for (const s of shown) {
      const d = fmtDay(s.start);
      if (d !== day) { html += (day ? "</div>" : "") + '<div class="day">' + esc(d) + '</div><div class="slots">'; day = d; }
      const label = esc(fmtTime(s.start) + "–" + fmtTime(s.end));
      html += '<button type="button" class="slot" data-id="' + esc(s.id) + '" aria-pressed="' + (chosen && chosen.id === s.id) + '"' +
        (s.available ? "" : ' disabled title="Already booked"') + ">" + label + "<small>" + esc(s.provider) + (s.available ? "" : " · booked") + "</small></button>";
    }
    list.innerHTML = html + "</div>";
  }

  $("slotList").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".slot");
    if (!btn || btn.disabled) return;
    chosen = slots.find((s) => s.id === btn.dataset.id);
    idemKey = crypto.randomUUID(); // one key per attempt, so a retry after a network error can't double-book
    $("chosen").textContent = fmtDay(chosen.start) + ", " + fmtTime(chosen.start) + " with " + chosen.provider;
    $("bookCard").hidden = false;
    msg($("bookMsg"), "", "");
    renderSlots();
    $("name").focus();
  });

  $("bookForm").addEventListener("input", () => { idemKey = crypto.randomUUID(); });

  $("bookForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!chosen) return;
    const btn = $("bookBtn");
    btn.disabled = true;
    try {
      const booking = await api("/api/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey },
        body: JSON.stringify({ slot_id: chosen.id, name: $("name").value, email: $("email").value }),
      });
      showConfirmation(booking);
      $("bookCard").hidden = true;
      chosen = null;
      loadSlots();
    } catch (e) {
      const text = e.status === 429 && e.retryAfter ? e.message + " (wait " + e.retryAfter + "s)" : e.message;
      msg($("bookMsg"), "error", text);
      if (e.status === 409) loadSlots();
    } finally { btn.disabled = false; }
  });

  function bookingHtml(b) {
    const slot = slots.find((s) => s.id === b.slot_id);
    const when = slot ? fmtDay(slot.start) + ", " + fmtTime(slot.start) + " with " + slot.provider : b.slot_id;
    return "<dl>" +
      "<dt>Status</dt><dd><span class=\\"badge " + esc(b.status) + "\\">" + esc(b.status) + "</span></dd>" +
      "<dt>When</dt><dd>" + esc(when) + "</dd>" +
      "<dt>Name</dt><dd>" + esc(b.name) + "</dd>" +
      "<dt>Email</dt><dd>" + esc(b.email) + "</dd>" +
      "<dt>Booking ID</dt><dd><code>" + esc(b.id) + "</code></dd>" +
      "</dl>" + (b.status === "confirmed" ? '<button type="button" class="danger" data-cancel="' + esc(b.id) + '">Cancel booking</button>' : "") +
      '<div class="cancelMsg"></div>';
  }

  function showConfirmation(b) {
    $("confirmCard").hidden = false;
    $("confirmBody").innerHTML = bookingHtml(b);
    $("confirmCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-cancel]");
    if (!btn) return;
    const box = btn.parentElement;
    btn.disabled = true;
    try {
      const b = await api("/api/bookings/" + encodeURIComponent(btn.dataset.cancel), { method: "DELETE" });
      box.innerHTML = bookingHtml(b);
      msg(box.querySelector(".cancelMsg"), "ok", "Booking cancelled. The time is open again.");
      loadSlots();
    } catch (e) { btn.disabled = false; msg(box.querySelector(".cancelMsg"), "error", e.message); }
  });

  $("lookupBtn").addEventListener("click", async () => {
    const id = $("lookupId").value.trim();
    const out = $("lookupOut");
    if (!id) return;
    try { out.innerHTML = '<div style="margin-top:14px">' + bookingHtml(await api("/api/bookings/" + encodeURIComponent(id))) + "</div>"; }
    catch (e) { msg(out, "error", e.status === 404 ? "No booking with that ID." : e.message); }
  });

  async function loadMine(reset) {
    const email = $("mineEmail").value.trim();
    if (!email) return;
    if (reset) { mineCursor = null; $("mineList").innerHTML = ""; }
    const q = new URLSearchParams({ email, limit: "5" });
    if (mineCursor) q.set("cursor", mineCursor);
    try {
      const page = await api("/api/bookings?" + q);
      if (reset && !page.bookings.length) $("mineList").innerHTML = '<li class="muted">No bookings for that email.</li>';
      for (const b of page.bookings) {
        const slot = slots.find((s) => s.id === b.slot_id);
        const li = document.createElement("li");
        li.innerHTML = "<span>" + esc(slot ? fmtDay(slot.start) + ", " + fmtTime(slot.start) : b.slot_id) +
          ' <span class="badge ' + esc(b.status) + '">' + esc(b.status) + '</span></span><code class="muted">' + esc(b.id) + "</code>";
        $("mineList").appendChild(li);
      }
      mineCursor = page.next_cursor;
      $("moreBtn").hidden = !mineCursor;
    } catch (e) { $("mineList").innerHTML = '<li class="msg error">' + esc(e.message) + "</li>"; }
  }
  $("mineBtn").addEventListener("click", () => loadMine(true));
  $("moreBtn").addEventListener("click", () => loadMine(false));

  $("saveKey").addEventListener("click", () => { apiKey = $("apiKey").value.trim(); store.set(apiKey); showKeyState(); loadSlots(); });
  $("provider").addEventListener("change", renderSlots);

  showKeyState();
  loadSlots();
})();
</script>
</body>
</html>`;
