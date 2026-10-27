import {test} from 'node:test';
import assert from 'node:assert/strict';
import endpoint from '../netlify/functions/marketing-agent.mts';
import readBriefing from '../netlify/functions/marketing-briefing.mts';
import {createSession} from '../netlify/functions/_lib/security.mts';
process.env.HWBT_SESSION_SECRET='test-only-secret-at-least-32-characters';
const url='https://hwbt.example/api/marketing-agent';
const request=(cookie,csrf,origin='https://hwbt.example')=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),origin},body:JSON.stringify({mode:'brief'})});
test('agent refuses anonymous and player requests',async()=>{
 assert.equal((await endpoint(request(),{})).status,401);
 const p=createSession({role:'player',playerId:1});
 assert.equal((await endpoint(request(p.cookie,p.session.csrf),{})).status,403);
});
test('agent requires same origin and CSRF for coach',async()=>{
 const c=createSession({role:'coach'});
 assert.equal((await endpoint(request(c.cookie,'invalid'),{})).status,403);
 assert.equal((await endpoint(request(c.cookie,c.session.csrf,'https://evil.example'),{})).status,403);
});
test('agent reports missing configuration without writing to production',async()=>{
 const c=createSession({role:'coach'});delete process.env.OPENAI_API_KEY;delete process.env.HWBT_MARKETING_MODEL;
 assert.equal((await endpoint(request(c.cookie,c.session.csrf),{})).status,503);
});
test('briefing cannot be read by a player or anonymous visitor',async()=>{
 const p=createSession({role:'player',playerId:1});
 const u='https://hwbt.example/api/marketing-briefing';
 assert.equal((await readBriefing(new Request(u),{})).status,401);
 assert.equal((await readBriefing(new Request(u,{headers:{cookie:p.cookie}}),{})).status,403);
});
