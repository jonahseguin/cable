// Container load test: RAMP up N actors at a controlled rate, HOLD a persistent WebSocket
// to each and ping-pong them round-robin for a sustained window, then SHUT them all down.
// The workload child is the lightweight `test-server` (echoes "echo: <msg>"), NOT a Unity
// server — so thousands cold-start cheaply; this stresses the Rivet serverless +
// container-runner path. Engine-agnostic: point it at a local host engine or Rivet Cloud.
//
// Env knobs:
//   LOAD_COUNT             actors/containers to ramp to                 (default 1000)
//   LOAD_RAMP_RATE         actors created per second during ramp        (default 10)
//   LOAD_DURATION_MS       sustain window after ramp completes          (default 20000)
//   LOAD_PING_INTERVAL_MS  gap between a connection's pings             (default 1000)
//   LOAD_PING_TIMEOUT_MS   per-ping round-trip timeout                  (default 15000)
//   LOAD_CONNECT_TIMEOUT_MS  time to establish WS + first echo          (default 60000)
//   LOAD_CONCURRENCY       in-flight ops for the shutdown/destroy phase (default 100)
//   LOAD_FAIL_THRESHOLD    fail if connect/drop/ping fail-rate exceeds  (default 0.02)
//   LOAD_CLEANUP           destroy actors when done (1/0)               (default 1)
//   LOAD_CHILD_TTL_MS      child self-exit backstop for cleanup, ms     (default 0 = off)
//   LOAD_POOL_PREFIX       per-actor pool `<prefix>-<i>` (local)        (default: RUNNER_NAME)
//   LOAD_DATACENTER        pin actors to a datacenter                   (default: engine picks)
//   LOAD_GATEWAY_PATH      path after /gateway/<id>/                    (default "/"; RivetKit: "/websocket/")
//   LOAD_GATEWAY_TOKEN     gateway path auth `<id>@<token>`             (default: none / local)
//   RIVET_TOKEN            Bearer for the engine API (cloud)            (default: none / local)
//   ENGINE_URL, ENGINE_PUBLIC_URL, RIVET_NAMESPACE, RIVET_ACTOR_NAME, RIVET_RUNNER_NAME — see common.mjs
import WebSocket from "ws";
import { encode as cborEncode } from "cbor-x";
import { ENGINE, ENGINE_PUBLIC, NAMESPACE, ACTOR_NAME, RUNNER_NAME } from "./common.mjs";

// ---- helpers ----
const int = (v, d) => { const n = Number.parseInt(v ?? "", 10); return Number.isFinite(n) ? n : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (ms) => (ms / 1000).toFixed(0);
const pctStr = (n) => `${(n * 100).toFixed(2)}%`;

// ---- config ----
const COUNT = int(process.env.LOAD_COUNT, 1000);
const RAMP_RATE = int(process.env.LOAD_RAMP_RATE, 10);
const DURATION_MS = int(process.env.LOAD_DURATION_MS, 20000);
const PING_INTERVAL_MS = int(process.env.LOAD_PING_INTERVAL_MS, 1000);
const PING_TIMEOUT_MS = int(process.env.LOAD_PING_TIMEOUT_MS, 15000);
const CONNECT_TIMEOUT_MS = int(process.env.LOAD_CONNECT_TIMEOUT_MS, 60000);
const CONCURRENCY = int(process.env.LOAD_CONCURRENCY, 100);
const FAIL_THRESHOLD = Number.parseFloat(process.env.LOAD_FAIL_THRESHOLD ?? "0.02");
const CLEANUP = process.env.LOAD_CLEANUP !== "0";
const CHILD_TTL_MS = int(process.env.LOAD_CHILD_TTL_MS, 0);
const POOL_PREFIX = process.env.LOAD_POOL_PREFIX || null;
const DATACENTER = process.env.LOAD_DATACENTER || null;
const GATEWAY_PATH = process.env.LOAD_GATEWAY_PATH || "/";
const GATEWAY_TOKEN = process.env.LOAD_GATEWAY_TOKEN || null;
const API_TOKEN = process.env.RIVET_TOKEN || null;
const RUN_ID = process.env.LOAD_RUN_ID || Date.now().toString(36);
const RTT_SAMPLE_CAP = 500_000;

// ---- engine API + gateway ----
const apiHeaders = () => ({
  "content-type": "application/json",
  ...(API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {}),
});

// Rivet Cloud carries gateway auth in the path as `<id>@<token>`; a local engine needs none.
function gatewayWsUrl(actorId) {
  const id = GATEWAY_TOKEN ? `${actorId}@${GATEWAY_TOKEN}` : actorId;
  return `${ENGINE_PUBLIC.replace(/\/$/, "")}/gateway/${id}${GATEWAY_PATH}`.replace(/^http/i, "ws");
}

// ---- metrics ----
const m = { createFail: 0, connOpen: 0, connFail: 0, connDropped: 0, pingSent: 0, pingOk: 0, pingFail: 0 };
const rtts = [];
const recordRtt = (v) => { if (rtts.length < RTT_SAMPLE_CAP) rtts.push(v); };
function latency() {
  const s = [...rtts].sort((a, b) => a - b);
  const at = (p) => (s.length ? s[Math.max(0, Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1))] : 0);
  return { p50: at(50), p95: at(95), p99: at(99), max: s[s.length - 1] ?? 0 };
}

// ---- actor lifecycle (engine API) ----
const actorIds = []; // created actor ids, for shutdown
let stopped = false;
let startedAt = Date.now();
const tstamp = () => `t+${secs(Date.now() - startedAt)}s`;
// Per-drop forensics: every dropped connection is logged and tallied by close
// code so a nonzero drop count is attributable, never a shrug.
const dropCauses = new Map();

async function createActor(i) {
  const input = CHILD_TTL_MS > 0 ? { env: { CRASH_AFTER_MS: String(CHILD_TTL_MS) } } : {};
  const body = {
    name: ACTOR_NAME,
    key: `load-${RUN_ID}-${i}`,
    input: Buffer.from(cborEncode(input)).toString("base64"),
    runner_name_selector: POOL_PREFIX ? `${POOL_PREFIX}-${i}` : RUNNER_NAME,
    crash_policy: "destroy",
    ...(DATACENTER ? { datacenter: DATACENTER } : {}),
  };
  try {
    const res = await fetch(`${ENGINE}/actors?namespace=${encodeURIComponent(NAMESPACE)}`, {
      method: "POST", headers: apiHeaders(), body: JSON.stringify(body),
    });
    const actorId = res.ok ? (await res.json()).actor?.actor_id : null;
    if (!actorId) { m.createFail++; return null; }
    actorIds.push(actorId);
    return actorId;
  } catch { m.createFail++; return null; }
}

// Run `fn` over `items` with at most `limit` in flight.
async function runPool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function destroyAll() {
  let done = 0;
  await runPool(actorIds, CONCURRENCY, async (id) => {
    try {
      const res = await fetch(`${ENGINE}/actors/${id}?namespace=${encodeURIComponent(NAMESPACE)}`,
        { method: "DELETE", headers: apiHeaders() });
      if (res.ok) done++;
    } catch { /* best effort */ }
  });
  return done;
}

// ---- one persistent, self-pinging connection through the gateway ----
const conns = [];
class Connection {
  constructor(actorId) {
    this.actorId = actorId;
    this.seq = 0; this.sentAt = 0; this.timer = null; this.alive = false; this.dead = false;
    conns.push(this);
    try { this.ws = new WebSocket(gatewayWsUrl(actorId), ["rivet"]); }
    catch { this.dead = true; m.connFail++; return; }

    const connectTimer = setTimeout(() => {
      if (!this.alive && !this.dead) { this.dead = true; m.connFail++; this.close(); }
    }, CONNECT_TIMEOUT_MS);

    this.ws.on("open", () => { this.alive = true; m.connOpen++; clearTimeout(connectTimer); this.#ping(); });
    this.ws.on("message", (data) => {
      if (data.toString() === `echo: ping-${this.seq}`) {
        m.pingOk++; recordRtt(Date.now() - this.sentAt); clearTimeout(this.timer); this.#scheduleNext();
      }
    });
    this.ws.on("error", (err) => this.#die("error", null, err?.message));
    this.ws.on("close", (code, reason) => this.#die("close", code, reason?.toString()));
  }

  get live() { return this.alive && !this.dead; }
  close() { try { this.ws?.close(); } catch { /* already closed */ } }

  #ping() {
    if (stopped || this.dead || !this.alive) return;
    this.seq++; this.sentAt = Date.now(); m.pingSent++;
    try { this.ws.send(`ping-${this.seq}`); } catch (err) { this.#die("send", null, err?.message); return; }
    this.timer = setTimeout(() => {
      m.pingFail++;
      console.log(`  [ping-timeout] ${tstamp()} actor=${this.actorId} seq=${this.seq}`);
      this.#scheduleNext();
    }, PING_TIMEOUT_MS);
  }
  #scheduleNext() { if (!stopped && !this.dead) setTimeout(() => this.#ping(), PING_INTERVAL_MS); }
  #die(source, code, reason) {
    if (this.dead) return;
    this.dead = true; clearTimeout(this.timer);
    if (this.alive && !stopped) {
      m.connDropped++;
      const cause = `${source}:${code ?? "-"}`;
      dropCauses.set(cause, (dropCauses.get(cause) ?? 0) + 1);
      console.log(`  [drop] ${tstamp()} actor=${this.actorId} source=${source} code=${code ?? "-"} reason=${reason || "-"}`);
    }
  }
}

// ---- run: ramp -> sustain -> shutdown -> report ----
async function main() {
  const poolLabel = POOL_PREFIX ? `${POOL_PREFIX}-<i>` : RUNNER_NAME;
  console.log(`== Rivet container load test ==`);
  console.log(`engine=${ENGINE}  namespace=${NAMESPACE}  pool=${poolLabel}  dc=${DATACENTER ?? "(engine picks)"}`);
  console.log(`profile: ramp ${COUNT} @ ${RAMP_RATE}/s -> sustain ${secs(DURATION_MS)}s (ping every ${PING_INTERVAL_MS}ms) -> shut down`);

  const started = Date.now();
  startedAt = started;
  const ticker = setInterval(() => {
    const l = latency();
    const live = conns.filter((c) => c.live).length;
    console.log(`  [t+${secs(Date.now() - started)}s] live=${live} created=${actorIds.length} pings=${m.pingSent} ok=${m.pingOk} fail=${m.pingFail} rtt p50=${l.p50} p95=${l.p95}`);
  }, 15000);

  // RAMP — create at RAMP_RATE/s, opening a persistent connection per actor.
  console.log(`\n[ramp] creating ${COUNT} actors at ${RAMP_RATE}/s ...`);
  const gap = Math.max(1, Math.floor(1000 / RAMP_RATE));
  for (let i = 0; i < COUNT; i++) {
    createActor(i).then((id) => { if (id) new Connection(id); });
    await sleep(gap);
  }
  console.log(`[ramp] done in ${secs(Date.now() - started)}s — created=${actorIds.length}/${COUNT} createFail=${m.createFail}`);

  // SUSTAIN — hold the round-robin ping load.
  console.log(`[sustain] holding ${secs(DURATION_MS)}s of ping-pong load ...`);
  await sleep(DURATION_MS);

  // SHUTDOWN — stop pinging, close connections, destroy actors.
  stopped = true;
  clearInterval(ticker);
  for (const c of conns) c.close();
  let destroyed = 0;
  if (CLEANUP && actorIds.length) {
    process.stdout.write(`\n[shutdown] destroying ${actorIds.length} actors ... `);
    destroyed = await destroyAll();
    console.log(`${destroyed}/${actorIds.length} destroyed`);
  }

  // REPORT
  const l = latency();
  const connFailRate = m.connFail / (COUNT || 1);
  const dropRate = m.connDropped / (m.connOpen || 1); // live connections lost mid-run
  const pingFailRate = m.pingFail / (m.pingSent || 1);
  const stragglers = conns.filter((c) => !c.alive && !c.dead);
  if (stragglers.length) {
    console.log(`\n[stragglers] ${stragglers.length} connection(s) never finished connecting:`);
    for (const c of stragglers) console.log(`  actor=${c.actorId}`);
  }
  if (dropCauses.size) {
    console.log(`\n[drop causes] ${[...dropCauses.entries()].map(([k, v]) => `${k}=${v}`).join("  ")}`);
  }
  console.log(`\n== summary ==`);
  console.log(`created:    ${actorIds.length}/${COUNT}  (createFail ${m.createFail})`);
  console.log(`connected:  ${m.connOpen}  (connectFail ${m.connFail}, dropped mid-run ${m.connDropped})`);
  console.log(`pings:      ${m.pingSent} sent, ${m.pingOk} ok, ${m.pingFail} timed out  (${pctStr(pingFailRate)} fail)`);
  console.log(`round-trip: p50=${l.p50} p95=${l.p95} p99=${l.p99} max=${l.max} ms`);
  console.log(`throughput: ${(m.pingOk / (DURATION_MS / 1000)).toFixed(0)} ok pings/s over sustain`);
  if (CLEANUP) console.log(`shutdown:   ${destroyed}/${actorIds.length} destroyed`);
  console.log(`wall:       ${secs(Date.now() - started)}s`);

  const pass = connFailRate <= FAIL_THRESHOLD && dropRate <= FAIL_THRESHOLD && pingFailRate <= FAIL_THRESHOLD;
  console.log(pass
    ? `\nPASS: held ${m.connOpen}/${COUNT} containers for the full sustain (fail rates within ${pctStr(FAIL_THRESHOLD)})`
    : `\nFAIL: connectFail=${pctStr(connFailRate)} dropped=${pctStr(dropRate)} pingFail=${pctStr(pingFailRate)} — platform did not sustain the load`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => { console.error(`load test crashed: ${err?.stack ?? err}`); process.exit(1); });
