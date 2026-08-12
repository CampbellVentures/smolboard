#!/usr/bin/env node
// Post-deploy smoke check for the public surfaces.
//
//   node scripts/smoke.mjs                        # production
//   node scripts/smoke.mjs http://localhost:4321  # a local pylon dev
//
// What this covers: HTTP status, and the CONTENT of the public feeds — the
// calendar, the five embed surfaces, the CFP, the sitemap. What it does not
// cover: anything behind a login, and anything that needs a click. Those need
// a browser; this is the cheap check you run on every deploy.
//
// Exits non-zero if any check fails, so it can gate a deploy.

const BASE = (process.argv[2] ?? "https://www.smolboard.app").replace(/\/$/, "");
const ORG = process.env.SMOKE_ORG ?? "ai-engineer";
const EVENT = process.env.SMOKE_EVENT ?? "ai-engineer-sandbox";
const TIMEOUT_MS = 30_000;

let passed = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ""}`);
  }
}

async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, { signal: controller.signal });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a path and assert its status plus a set of required substrings. */
async function check(name, path, { status = 200, contains = [], absent = [], min = 0 } = {}) {
  const result = await get(path);
  if (result.status !== status) {
    record(name, false, `expected ${status}, got ${result.status}${result.error ? ` (${result.error})` : ""}`);
    return result;
  }
  if (result.body.length < min) {
    record(name, false, `body only ${result.body.length}b, wanted >= ${min}`);
    return result;
  }
  const missing = contains.filter((needle) => !result.body.includes(needle));
  if (missing.length > 0) {
    record(name, false, `missing ${JSON.stringify(missing)}`);
    return result;
  }
  const present = absent.filter((needle) => result.body.includes(needle));
  if (present.length > 0) {
    record(name, false, `should not contain ${JSON.stringify(present)}`);
    return result;
  }
  record(name, true, `${result.body.length}b`);
  return result;
}

console.log(`smoke: ${BASE}  (${ORG}/${EVENT})\n`);

console.log("marketing + auth");
await check("landing", "/", { contains: ["smolboard"], min: 2000 });
await check("login", "/login", { contains: ["mail"], min: 1000 });
await check("robots.txt", "/robots.txt", { contains: ["Sitemap"] });
// Only smolboard's own pages belong here: /<org>/<event> pages belong to the
// customer and are theirs to advertise. See app/sitemap.ts.
await check("sitemap.xml", "/sitemap.xml", { contains: ["<urlset", "/company/privacy"] });

console.log("\npublic event site");
const site = `/${ORG}/${EVENT}`;
await check("event page", site, { min: 5000 });
await check("call for speakers", `${site}/cfp`, { min: 1000 });
// A missing event must 404, not render an empty shell at 200.
await check("unknown event 404s", `/${ORG}/no-such-event-xyz`, { status: 404 });

console.log("\nembed surfaces");
for (const widget of ["schedule", "sessions", "itinerary", "speakers", "gallery"]) {
  await check(`embed=${widget}`, `${site}?embed=${widget}`, {
    min: 3000,
    // The chrome-less render must not carry the site header/footer.
    absent: ["<nav"],
  });
}

console.log("\ncalendar feed");
const full = await check("calendar.ics", `${site}/calendar.ics`, {
  contains: ["BEGIN:VCALENDAR", "METHOD:PUBLISH", "END:VCALENDAR"],
});
const uids = [...full.body.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim().replace(/@smolboard$/, ""));
const eventCount = (full.body.match(/BEGIN:VEVENT/g) ?? []).length;
record("calendar has events", eventCount > 0, `${eventCount} VEVENT`);
record("calendar uses CRLF", full.body.includes("\r\n") && !/[^\r]\n/.test(full.body), "");

if (uids.length >= 2) {
  const picked = uids.slice(0, 2).join(",");
  const subset = await get(`${site}/calendar.ics?sessions=${picked}`);
  const subsetCount = (subset.body.match(/BEGIN:VEVENT/g) ?? []).length;
  record("calendar filters to a starred selection", subset.status === 200 && subsetCount === 2, `${subsetCount} of ${eventCount}`);
  record(
    "filtered calendar is named as a personal schedule",
    subset.body.includes("my schedule"),
    "",
  );
  const bogus = await get(`${site}/calendar.ics?sessions=deadbeef`);
  record(
    "unknown session id matches nothing rather than leaking",
    bogus.status === 200 && !bogus.body.includes("BEGIN:VEVENT"),
    "",
  );
}

console.log("\npublic JSON feeds");
for (const fn of ["getPublicSchedule", "getPublicSpeakers"]) {
  // Functions are POST-only; a GET is a 404 by design.
  const result = await post(`/api/fn/${fn}`, { orgSlug: ORG, eventSlug: EVENT });
  let ok = result.status === 200;
  let detail = `${result.status}`;
  if (ok) {
    try {
      const parsed = JSON.parse(result.body);
      ok = parsed && typeof parsed === "object";
      detail = Array.isArray(parsed?.sessions)
        ? `${parsed.sessions.length} sessions`
        : Array.isArray(parsed?.speakers)
          ? `${parsed.speakers.length} speakers`
          : "object";
    } catch {
      ok = false;
      detail = "not JSON";
    }
  }
  record(`fn ${fn}`, ok, detail);
}

console.log("\ntenant isolation (anonymous)");
// Anonymous entity reads must not expose org-internal columns.
const orgs = await get("/api/entities/Org");
let leak = "";
try {
  const rows = JSON.parse(orgs.body)?.data ?? [];
  const forbidden = ["createdBy", "stripeCustomerId"];
  leak = forbidden.filter((field) => rows.some((row) => field in row)).join(", ");
} catch {
  leak = "unparseable";
}
record("anonymous Org read exposes no internal fields", leak === "", leak);

for (const entity of ["Submission", "Review", "SpeakerProfile", "Contact"]) {
  const result = await get(`/api/entities/${entity}`);
  let count = null;
  try {
    count = JSON.parse(result.body)?.count;
  } catch {
    count = "unparseable";
  }
  record(`anonymous ${entity} read returns nothing`, count === 0, `count=${count}`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
