// Clean reject-second-start test. Checks destroy_ts (the real delete signal),
// NOT sleep_ts (which an explicit sleep would set). Single wake, long poll.
import { encode } from "cbor-x";
const NS=process.env.NS, TOK=process.env.TOK, origin="https://api.rivet.dev";
const H={authorization:`Bearer ${TOK}`,"content-type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString().slice(11,19);
const KEY="rj-"+Date.now();
const input=Buffer.from(encode({port:7770})).toString("base64");
let r=await fetch(`${origin}/actors?namespace=${NS}`,{method:"POST",headers:H,body:JSON.stringify({name:"game",key:KEY,input,runner_name_selector:"default",crash_policy:"destroy"})});
const id=(await r.json()).actor?.actor_id; console.log(now(),"created",id);
async function gw(){try{const x=await fetch(`${origin}/gateway/${id}@${TOK}/`);return x.status;}catch(e){return 0;}}
async function st(){const s=await fetch(`${origin}/actors?actor_ids=${id}&namespace=${NS}`,{headers:H});const a=(await s.json()).actors?.[0];return a?{sleep_ts:a.sleep_ts,destroy_ts:a.destroy_ts}:{missing:true};}
for(let i=0;i<15;i++){if(await gw()===200)break;await sleep(700);}
console.log(now(),"started; wait 4s so started_once persists (grace=3s)"); await sleep(4000);
console.log(now(),"explicit sleep to force the second-start scenario"); await fetch(`${origin}/actors/${id}/sleep?namespace=${NS}`,{method:"POST",headers:H,body:"{}"});
await sleep(8000);
console.log(now(),"single wake -> second start -> reject -> ctx.destroy(); polling destroy_ts 60s...");
await gw();
for(let i=0;i<30;i++){await sleep(2000);const s=await st();console.log(now(),JSON.stringify(s));if(s.destroy_ts){console.log(now(),"=> DELETED (reject ctx.destroy works)");break;}if(s.missing){console.log(now(),"=> GONE");break;}}
console.log(now(),"DONE id="+id);
