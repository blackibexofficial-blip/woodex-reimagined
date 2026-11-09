// Actual Edge handler, synthetic service role/Turnstile, no network permission.
import assert from 'node:assert/strict';
Deno.test('lead capture v2 preserves bounded details and company; legacy remains unchanged',async()=>{
  const oldServe=Object.getOwnPropertyDescriptor(Deno,'serve'), oldFetch=globalThis.fetch;
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TURNSTILE_SECRET','INTAKE_ABUSE_MODE'];
  const old=Object.fromEntries(names.map(k=>[k,Deno.env.get(k)]));
  let handler,paths=[],inserts=[],alterStored=false;
  Object.defineProperty(Deno,'serve',{configurable:true,value:h=>{handler=h;return {};}});
  Deno.env.set('SUPABASE_URL','https://lead-content-test.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-key');Deno.env.set('TURNSTILE_SECRET','synthetic-secret');Deno.env.set('INTAKE_ABUSE_MODE','strict');
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  globalThis.fetch=async(input,init)=>{
    const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);paths.push(url.pathname);
    if(url.hostname==='challenges.cloudflare.com')return reply({success:true,action:'lead'});
    if(url.hostname!=='lead-content-test.invalid')throw new Error('unexpected host');
    if(url.pathname==='/rest/v1/rpc/lead_rate_limit_hit')return reply(1);
    if(url.pathname==='/rest/v1/leads'){const row=await request.clone().json();inserts.push(row);return reply({id:42,interest:alterStored?'changed':row.interest,company:row.company??null},201);}
    throw new Error('unexpected path');
  };
  try{
    await import('../lead-capture/index.ts');assert.equal(typeof handler,'function');
    const base={name:'Synthetic Person',email:'test@example.test',phone:'03000000000',consent:true,consent_version:'lead-privacy-v1',cfTurnstileToken:'synthetic-token'};
    const call=async data=>{paths=[];inserts=[];const response=await handler(new Request('https://lead-content-test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base,...data})}));return {status:response.status,body:await response.json(),paths:[...paths],inserts:[...inserts]};};
    const long='Start '+ 'x'.repeat(250)+' End marker';
    let r=await call({capture_version:2,company:'  Synthetic Company  ',interest:long});
    assert.equal(r.status,202);assert.equal(r.body.capture_version,2);assert.equal(r.inserts[0].interest,long);assert.equal(r.inserts[0].company,'Synthetic Company');assert.ok(!JSON.stringify(r.body).includes('Synthetic Company'));
    r=await call({capture_version:2,interest:'😀'.repeat(2000),company:'c'.repeat(160)});assert.equal(r.status,202);assert.equal(r.inserts[0].interest.length,4000);assert.equal(r.inserts[0].company.length,160);
    for(const invalid of [{capture_version:2,interest:'😀'.repeat(2000)+'x'},{capture_version:2,interest:'  '},{capture_version:2,interest:['bad']},{capture_version:2,interest:'valid',company:'c'.repeat(161)},{capture_version:2,interest:'valid',company:{}},{capture_version:'2',interest:'valid'},{capture_version:3,interest:'valid'}]){
      r=await call(invalid);assert.equal(r.status,400);assert.deepEqual(r.inserts,[]);assert.ok(!r.paths.includes('/rest/v1/rpc/lead_rate_limit_hit'));
    }
    alterStored=true;r=await call({capture_version:2,interest:long});assert.equal(r.status,500);assert.equal(r.inserts.length,1);assert.ok(!JSON.stringify(r.body).includes(long));alterStored=false;
    r=await call({interest:long,company:'Ignored for legacy'});assert.equal(r.status,202);assert.equal(r.body.capture_version,undefined);assert.equal(r.inserts[0].interest,long.slice(0,120));assert.equal(Object.hasOwn(r.inserts[0],'company'),false);
  }finally{globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',oldServe);for(const n of names)old[n]===undefined?Deno.env.delete(n):Deno.env.set(n,old[n]);}
});
