// Warm a freshly deployed instance.
//
// `pylon deploy` starts a new process, and the first requests to it pay for a
// cold sync engine: measured 11s after a deploy, the entity cursor fetches a
// dashboard page makes came back 503 and the page rendered without its live
// data. It recovers on its own within a few seconds, but the person who clicks
// during that window sees a slow, half-populated app.
//
// Run this straight after `pylon deploy` so the first real visitor is never
// the one who warms it up.
//
//   node scripts/warm.mjs [baseUrl]
//
// Public surfaces only, so it needs no credentials. Warming those loads the
// shared JS bundle, the SSR renderer, and the sync engine, which is what the
// dashboard pays for too.

const BASE = (process.argv[2] ?? "https://www.smolboard.app").replace(/\/$/, "");
const ORG = process.env.SMOKE_ORG ?? "ai-engineer";
const EVENT = process.env.SMOKE_EVENT ?? "ai-engineer-sandbox";

const PATHS = [
  "/",
  "/login",
  `/${ORG}/${EVENT}`,
  `/${ORG}/${EVENT}/cfp`,
  `/${ORG}/${EVENT}?embed=schedule`,
  `/${ORG}/${EVENT}?embed=sessions`,
  `/${ORG}/${EVENT}/calendar.ics`,
  "/api/openapi.json",
];

const FNS = [
  ["getPublicSchedule", { orgSlug: ORG, eventSlug: EVENT }],
  ["getPublicSpeakers", { orgSlug: ORG, eventSlug: EVENT }],
];

async function hit(label, run) {
  const started = Date.now();
  try {
    const status = await run();
    const ms = Date.now() - started;
    const slow = ms > 1500 ? "  SLOW" : "";
    console.log(`  ${String(status).padStart(3)}  ${String(ms).padStart(5)}ms  ${label}${slow}`);
    return status < 400;
  } catch (error) {
    console.log(`  ERR  ${String(Date.now() - started).padStart(5)}ms  ${label}  ${error.message}`);
    return false;
  }
}

console.log(`warming ${BASE}\n`);
let ok = true;
// Two passes: the first pays the cold cost, the second proves it is gone.
for (const pass of [1, 2]) {
  console.log(`pass ${pass}`);
  for (const path of PATHS) {
    ok = (await hit(path, async () => (await fetch(`${BASE}${path}`)).status)) && ok;
  }
  for (const [fn, body] of FNS) {
    ok = (await hit(`fn ${fn}`, async () =>
      (await fetch(`${BASE}/api/fn/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).status)) && ok;
  }
  console.log("");
}
console.log(ok ? "warm" : "warmed with errors above");
process.exit(ok ? 0 : 1);
