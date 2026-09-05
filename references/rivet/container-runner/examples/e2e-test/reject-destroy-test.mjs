// Test the "wait until running, then destroy" reject path.
// RIVET_URL=https://<ns>:<sk_token>@api.rivet.dev node reject-destroy-test.mjs
import { encode as cborEncode } from "cbor-x";

const url = new URL(process.env.RIVET_URL);
const namespace = decodeURIComponent(url.username);
const token = decodeURIComponent(url.password);
const origin = `${url.protocol}//${url.host}`;
const KEY = process.env.ACTOR_KEY || `rd-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 23);

async function api(path, opts = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${origin}${path}${sep}namespace=${encodeURIComponent(namespace)}`, {
    ...opts,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const t = await res.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: res.status, body: b };
}
async function ping(id) {
  try { const r = await fetch(`${origin}/gateway/${encodeURIComponent(id)}@${encodeURIComponent(token)}/`, { method: "GET" });
    return { status: r.status, text: (await r.text()).slice(0, 30) }; } catch (e) { return { status: 0, text: String(e).slice(0, 50) }; }
}
async function status(id) {
  const { body } = await api(`/actors?actor_ids=${id}`, { method: "GET" });
  const a = body?.actors?.[0];
  return a ? { sleep_ts: a.sleep_ts, destroy_ts: a.destroy_ts } : { missing: true };
}

const input = Buffer.from(cborEncode({ port: 7770 })).toString("base64");
let { body } = await api(`/actors`, { method: "POST", body: JSON.stringify({ name: "game", key: KEY, input, runner_name_selector: "default", crash_policy: "destroy" }) });
const id = body?.actor?.actor_id || body?.metadata?.existing_actor_id;
console.log(`${now()} created ${id} key=${KEY}`);

for (let i = 0; i < 20; i++) { const p = await ping(id); if (p.status === 200) { console.log(`${now()} up: ${p.status}`); break; } await sleep(750); }
console.log(`${now()} waiting 7s past grace so started_once persists`);
await sleep(7000);
await api(`/actors/${id}/sleep`, { method: "POST", body: "{}" });
console.log(`${now()} slept; waiting 8s for container exit`);
await sleep(8000);
console.log(`${now()} single wake ping (expect reject -> wait -> destroy, NO loop)`);
await ping(id);
// poll status for ~20s to see if it destroys (destroy_ts set) or keeps looping/sleeping
for (let i = 0; i < 10; i++) {
  await sleep(2000);
  const s = await status(id);
  console.log(`${now()} status: ${JSON.stringify(s)}`);
  if (s.destroy_ts) { console.log(`${now()} DESTROYED (destroy_ts set) -- clean`); break; }
}
console.log(`${now()} DONE key=${KEY} id=${id}`);
