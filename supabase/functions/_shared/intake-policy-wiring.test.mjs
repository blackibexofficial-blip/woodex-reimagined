// Synthetic Deno integration rehearsal of the real Edge entry points. All fetch
// is mocked and no network permission is needed. Never target a real project.
import assert from 'node:assert/strict';

Deno.test('strict and legacy intake policies behave as configured without hosted services', async () => {
  const oldServe = Object.getOwnPropertyDescriptor(Deno,'serve');
  const oldFetch = globalThis.fetch;
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TURNSTILE_SECRET','INTAKE_ABUSE_MODE'];
  const previous=Object.fromEntries(names.map(k=>[k,Deno.env.get(k)]));
  const handlers=[];
  Object.defineProperty(Deno,'serve',{configurable:true,value:handler=>{handlers.push(handler);return {};}});
  Deno.env.set('SUPABASE_URL','https://intake-test.invalid');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-key');
  let paths=[], verification={success:true,action:'lead'}, rate=1, rateError=false, rateTransport=false, providerError=false, orderError=false;
  const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
  globalThis.fetch=async input=>{
    const u=new URL(typeof input==='string'?input:input.url); paths.push(u.pathname);
    if(u.hostname==='challenges.cloudflare.com' && u.pathname.endsWith('/siteverify')) return providerError ? json({error:'unavailable'},503) : json(verification);
    if(u.hostname!=='intake-test.invalid') throw new Error('Unexpected network destination');
    if(u.pathname==='/rest/v1/rpc/lead_rate_limit_hit') {
      if (rateTransport) throw new Error('synthetic network failure');
      return rateError ? json({message:'synthetic limiter error'},400) : json(rate);
    }
    if(u.pathname==='/rest/v1/leads') return json({id:42},201);
    if(u.pathname==='/rest/v1/rpc/order_submit') return orderError ? json({message:'database unavailable'},400) : json({id:'order-test',total:100,customerEmail:'private@example.test'});
    throw new Error(`Unexpected mocked path ${u.pathname}`);
  };
  let unique=0;
  const load = async (mode,secret) => {
    mode===undefined?Deno.env.delete('INTAKE_ABUSE_MODE'):Deno.env.set('INTAKE_ABUSE_MODE',mode);
    secret===undefined?Deno.env.delete('TURNSTILE_SECRET'):Deno.env.set('TURNSTILE_SECRET',secret);
    const id=++unique; const count=handlers.length;
    await import(`../order-submit/index.ts?case=${id}`);
    await import(`../lead-capture/index.ts?case=${id}`);
    assert.equal(handlers.length,count+2);
    return [handlers[count],handlers[count+1]];
  };
  const order={items:[{productId:'synthetic',quantity:1}],name:'Synthetic Person',phone:'03000000000',paymentMethod:'cod',clientRef:'synthetic-ref',cfTurnstileToken:'token'};
  const lead={name:'Synthetic Person',phone:'03000000000',consent:true,consent_version:'lead-privacy-v1',cfTurnstileToken:'token'};
  const request=body=>new Request('https://intake-test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const call=async (h,b)=>{paths=[];const response=await h(request(b));return {response,paths:[...paths]};};
  try {
    for(const [mode,secret] of [['strict',undefined],['strict',''],['strict','   '],['bogus','secret'],['','secret'],['Strict','secret'],['strict ','secret']]) {
      const [o,l]=await load(mode,secret);
      for(const [fn,body] of [[o,order],[l,lead]]) {
        const r=await call(fn,body);
        assert.equal(r.response.status,503,`${JSON.stringify(mode)}/${JSON.stringify(secret)}`);
        assert.deepEqual(r.paths,[], 'invalid security configuration must not verify or write');
      }
    }
    for(const mode of [undefined,'legacy']) {
      const [o,l]=await load(mode,undefined);
      rate=1;rateError=false;
      const a=await call(o,order), b=await call(l,lead);
      assert.equal(a.response.status,200);assert.ok(a.paths.includes('/rest/v1/rpc/order_submit'));
      assert.equal(b.response.status,202);assert.ok(b.paths.includes('/rest/v1/leads'));
      rateError=true;
      const c=await call(l,lead);
      assert.equal(c.response.status,202,'legacy keeps limiter error fail-open');
      assert.ok(c.paths.includes('/rest/v1/leads'));
      rateError=false;rate='invalid';
      assert.equal((await call(l,lead)).response.status,202,'legacy keeps malformed limiter fail-open');
      rate=21;
      const d=await call(l,lead);assert.equal(d.response.status,429);assert.ok(!d.paths.includes('/rest/v1/leads'));
    }
    const [strictOrder,strictLead]=await load('strict','synthetic-secret');
    verification={success:true,action:'order'};rate=1;
    let r=await call(strictOrder,order);
    assert.equal(r.response.status,200);assert.ok(r.paths.includes('/rest/v1/rpc/order_submit'));
    assert.ok(!JSON.stringify(await r.response.json()).includes('private@example.test'));
    verification={success:true,action:'lead'};
    for(const hits of [1,20]) {
      rate=hits;r=await call(strictLead,lead);
      assert.equal(r.response.status,202);assert.ok(r.paths.includes('/rest/v1/leads'));
    }
    rate=21;r=await call(strictLead,lead);assert.equal(r.response.status,429);assert.ok(!r.paths.includes('/rest/v1/leads'));
    for(const bad of [null,'1',0,-1,1.5,{},[]]) {
      rate=bad;r=await call(strictLead,lead);
      assert.equal(r.response.status,503,`invalid limiter response ${JSON.stringify(bad)}`);assert.ok(!r.paths.includes('/rest/v1/leads'));
    }
    rateError=true;r=await call(strictLead,lead);assert.equal(r.response.status,503);assert.ok(!r.paths.includes('/rest/v1/leads'));rateError=false;
    rateTransport=true;r=await call(strictLead,lead);assert.equal(r.response.status,503);assert.ok(!r.paths.includes('/rest/v1/leads'));rateTransport=false;
    verification={success:true,action:'order'};
    r=await call(strictLead,lead);assert.equal(r.response.status,403);assert.ok(!r.paths.includes('/rest/v1/rpc/lead_rate_limit_hit'));
    verification={success:true,action:'lead'};providerError=true;
    r=await call(strictLead,lead);assert.equal(r.response.status,503);assert.ok(!r.paths.includes('/rest/v1/rpc/lead_rate_limit_hit'));providerError=false;
    verification={success:true,action:'order'};orderError=true;
    r=await call(strictOrder,order);assert.equal(r.response.status,500,'order RPC failure must not create a receipt');orderError=false;
    r=await call(strictOrder,{...order,cfTurnstileToken:undefined});assert.equal(r.response.status,403);assert.deepEqual(r.paths,[]);
  } finally {
    globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',oldServe);
    for(const name of names) previous[name]===undefined?Deno.env.delete(name):Deno.env.set(name,previous[name]);
  }
});
