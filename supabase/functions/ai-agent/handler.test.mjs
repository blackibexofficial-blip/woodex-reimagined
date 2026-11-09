import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { authorizeAiStaff } from '../_shared/ai-authorization.mjs';
import { createAiAuthDependencies } from './supabase-auth.mjs';
import { createAiAgentHandler } from './handler.mjs';

const request = (token = 'valid', body = {messages:[{role:'user', content:'Hello'}], grounding:['A fact']}) => new Request('http://local/ai-agent', {
  method:'POST', headers: { ...(token === null ? {} : {authorization:token.includes(' ') ? token : `Bearer ${token}`}), 'content-type':'application/json' }, body: JSON.stringify(body),
});
const auth = ({user = {id:'staff'}, getError = null, cap = true, capError = null} = {}) => ({
  getUser: async () => ({data:{user}, error:getError}),
  hasCapability: async () => ({data:cap, error:capError}),
  reserveUsage: async () => ({data:true, error:null}),
  userLimit:'2', globalLimit:'10',
});

for (const header of [null, 'Basic x', 'Bearer', 'Bearer a b']) {
  test(`rejects malformed or missing auth ${header}`, async () => {
    const rawRequest = new Request('http://local/', { headers: header === null ? {} : { authorization: header } });
    assert.equal((await authorizeAiStaff(rawRequest, auth())).status, 401);
  });
}
test('valid user plus crm.manage permitted and same token passed to capability lookup', async () => {
  const calls = [];
  const result = await authorizeAiStaff(request('token-123'), {
    getUser: async token => { calls.push(['auth',token]); return {data:{user:{id:'id-1'}},error:null}; },
    hasCapability: async (token, need) => { calls.push(['cap',token,need]); return {data:true,error:null}; },
  });
  assert.deepEqual(result, {ok:true,userId:'id-1'});
  assert.deepEqual(calls, [['auth','token-123'],['cap','token-123','crm.manage']]);
});
for (const [name, opts, status] of [
  ['nonstaff', {cap:false}, 403],
  ['missing user', {user:null}, 401],
  ['deleted user', {user:{id:'x',deleted_at:'2026-01-01'}}, 401],
  ['banned user', {user:{id:'x',banned_until:'2999-01-01T00:00:00Z'}}, 401],
  ['malformed ban date', {user:{id:'x',banned_until:'nonsense'}}, 401],
  ['invalid auth token', {getError:{status:401}}, 401],
  ['auth outage', {getError:{status:503}}, 503],
  ['auth unknown failure', {getError:{}}, 503],
  ['permission rpc failure', {capError:{message:'error'}}, 503],
  ['unexpected capability response', {cap:null}, 503],
]) {
  test(`${name} fails closed`, async () => assert.equal((await authorizeAiStaff(request(), auth(opts))).status, status));
}
test('expired ban does not itself deny an otherwise valid staff user', async () => {
  assert.equal((await authorizeAiStaff(request(), auth({user:{id:'x',banned_until:'2000-01-01T00:00:00Z'}}))).ok, true);
});
test('thrown network errors fail closed', async () => {
  assert.equal((await authorizeAiStaff(request(), {getUser:async()=>{throw Error('network')},hasCapability:async()=>({data:true})})).status,503);
  assert.equal((await authorizeAiStaff(request(), {getUser:async()=>({data:{user:{id:'x'}}}),hasCapability:async()=>{throw Error('network')}})).status,503);
});
test('real Supabase client uses caller bearer and anon key for capability, service key for Auth', async () => {
  const seen = [];
  const dependencies = createAiAuthDependencies({ createClient, url:'https://isolated.invalid', serviceRoleKey:'service-key', anonKey:'anon-key', fetchImpl:async (url, init) => {
    const h = new Headers(init.headers);
    seen.push({url:String(url), auth:h.get('authorization'), key:h.get('apikey'), body:init.body});
    return new Response(JSON.stringify(String(url).includes('/auth/v1/user') ? {id:'user-123',aud:'authenticated',role:'authenticated'} : true), {status:200,headers:{'content-type':'application/json'}});
  }});
  const result = await authorizeAiStaff(request('caller-token'), dependencies);
  assert.equal(result.ok, true);
  assert.equal(seen.length, 2);
  assert.match(seen[0].url, /\/auth\/v1\/user/);
  assert.equal(seen[0].auth, 'Bearer caller-token');
  assert.equal(seen[0].key, 'service-key');
  assert.match(seen[1].url, /\/rest\/v1\/rpc\/has_cap/);
  assert.equal(seen[1].auth, 'Bearer caller-token');
  assert.equal(seen[1].key, 'anon-key');
  assert.deepEqual(JSON.parse(seen[1].body), {need:'crm.manage'});
});
test('missing Supabase configuration is not accepted', () => {
  assert.equal(createAiAuthDependencies({createClient,url:'https://isolated.invalid',serviceRoleKey:'x'}), null);
});
test('handler blocks missing auth, nonstaff and capability outages before provider invocation', async () => {
  let upstream = 0;
  const fetchImpl = async () => { upstream++; throw Error('should not reach'); };
  for (const [token, opts, status] of [[null,{},401],['valid',{cap:false},403],['valid',{capError:{}},503],['valid',{getError:{status:500}},503]]) {
    const handler = createAiAgentHandler({apiKey:'secret',baseUrl:'http://provider.invalid',model:'test',...auth(opts),fetchImpl});
    const res = await handler(request(token));
    assert.equal(res.status,status);
  }
  assert.equal(upstream,0);
});
test('handler stays off with no key; missing auth dependencies fail closed', async () => {
  const base = {baseUrl:'http://provider.invalid',model:'test',fetchImpl:async()=>{throw Error('never')}};
  assert.equal((await createAiAgentHandler({...base,...auth()})(request())).status,501);
  assert.equal((await createAiAgentHandler({...base,apiKey:'key'})(request())).status,503);
});
test('authorized request reaches provider and returns draft', async () => {
  let providerBody;
  const handler = createAiAgentHandler({apiKey:'secret',baseUrl:'http://provider.invalid',model:'test',...auth(), fetchImpl:async (_, init) => {
    providerBody = JSON.parse(init.body);
    return new Response(JSON.stringify({choices:[{message:{content:' Draft reply '}}]}), {status:200});
  }});
  const res = await handler(request());
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(), {reply:'Draft reply',model:'test'});
  assert.match(providerBody.messages[0].content,/A fact/);
});
test('bad payload, missing grounding and provider failures return safe errors', async () => {
  const handler = createAiAgentHandler({apiKey:'secret',baseUrl:'http://provider.invalid',model:'test',...auth(),fetchImpl:async()=>{throw Error('secret must not leak')}});
  assert.equal((await handler(request('valid', null))).status,400);
  assert.equal((await handler(request('valid', {messages:[],grounding:['fact']}))).status,400);
  assert.equal((await handler(request('valid', {messages:[{role:'user',content:'x'}],grounding:[]}))).status,400);
  const res = await handler(request());
  assert.equal(res.status,502);
  assert.doesNotMatch(await res.text(), /secret/);
});

const handlerWith = (overrides = {}) => createAiAgentHandler({
  apiKey:'secret', baseUrl:'http://provider.invalid', model:'test', ...auth(),
  fetchImpl:async () => new Response(JSON.stringify({choices:[{message:{content:'ok'}}]})),
  ...overrides,
});

test('successful usage reservation uses verified identity and server-configured limits, not request fields', async () => {
  let reservation;
  const handler = handlerWith({reserveUsage:async (...args) => {reservation = args; return {data:true,error:null}}});
  const result = await handler(request('valid', {messages:[{role:'user',content:'test'}],grounding:['fact'], userId:'attacker-chosen',userLimit:9999,globalLimit:99999}));
  assert.equal(result.status, 200);
  assert.deepEqual(reservation, ['staff',2,10]);
});
for (const [name, overrides, status] of [
  ['missing limiter', {reserveUsage:null},503],
  ['missing limit', {userLimit:undefined},503],
  ['zero limit', {userLimit:'0'},503],
  ['negative limit', {globalLimit:'-1'},503],
  ['fractional limit', {userLimit:'1.5'},503],
  ['too large user limit', {userLimit:'1001'},503],
  ['too large global limit', {globalLimit:'100001'},503],
  ['noncanonical integer', {userLimit:'01'},503],
  ['quota exhausted', {reserveUsage:async()=>({data:false,error:null})},429],
  ['database failure', {reserveUsage:async()=>({data:null,error:{}})},503],
  ['malformed database result', {reserveUsage:async()=>({data:'true',error:null})},503],
  ['limiter network exception', {reserveUsage:async()=>{throw Error('offline')}},503],
]) {
  test(`${name} prevents provider invocation`, async () => {
    let calls = 0;
    const response = await handlerWith({...overrides,fetchImpl:async()=>{calls++; throw Error('unexpected');}})(request());
    assert.equal(response.status,status);
    assert.equal(calls,0);
  });
}
test('unauthorized, malformed and oversized requests do not consume quota', async () => {
  let count = 0;
  const reserveUsage = async () => { count++; return {data:true,error:null}; };
  assert.equal((await handlerWith({reserveUsage})(request(null))).status,401);
  assert.equal((await handlerWith({reserveUsage})(request('valid', {messages:[],grounding:['fact']}))).status,400);
  assert.equal((await handlerWith({reserveUsage})(request('valid', {messages:Array(11).fill({role:'user',content:'x'}),grounding:['fact']}))).status,400);
  const large = JSON.stringify({messages:[{role:'user',content:'a'.repeat(33000)}],grounding:['fact']});
  const oversized = new Request('http://local/', {method:'POST',headers:{authorization:'Bearer valid','content-length':'1'},body:large});
  assert.equal((await handlerWith({reserveUsage})(oversized)).status,413);
  assert.equal(count,0);
});
test('provider failure still consumes a reservation', async () => {
  let reserved = 0;
  const h = handlerWith({reserveUsage:async()=>{reserved++;return {data:true,error:null}},fetchImpl:async()=>{throw Error('offline')}});
  assert.equal((await h(request())).status,502);
  assert.equal(reserved,1);
});
test('real Supabase client reserves capacity with service credentials', async () => {
  let seen;
  const dependencies = createAiAuthDependencies({createClient,url:'https://isolated.invalid',serviceRoleKey:'service-key',anonKey:'anon-key',fetchImpl:async (url,init)=>{
    const headers = new Headers(init.headers);
    seen = {url:String(url), auth:headers.get('authorization'), key:headers.get('apikey'), body:JSON.parse(init.body)};
    return new Response('true', {status:200,headers:{'content-type':'application/json'}});
  }});
  const result = await dependencies.reserveUsage('11111111-1111-1111-1111-111111111111',2,10);
  assert.equal(result.data,true);
  assert.match(seen.url,/\/rest\/v1\/rpc\/ai_usage_reserve/);
  assert.equal(seen.auth,'Bearer service-key');
  assert.equal(seen.key,'service-key');
  assert.deepEqual(seen.body,{p_user_id:'11111111-1111-1111-1111-111111111111',p_user_limit:2,p_global_limit:10});
});
test('streamed multi-chunk body is bounded without trusting Content-Length', async () => {
  let reserved = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('a'.repeat(17000)));
    controller.enqueue(encoder.encode('b'.repeat(17000)));
    controller.close();
  }});
  const streamed = new Request('http://local/', {method:'POST',headers:{authorization:'Bearer valid'},body:stream,duplex:'half'});
  const response = await handlerWith({reserveUsage:async()=>{reserved++; return {data:true,error:null}}})(streamed);
  assert.equal(response.status,413);
  assert.equal(reserved,0);
});
