// Deno integration rehearsal of the actual Edge entry points, with synthetic env
// and all fetch mocked. Does not start a server or reach Supabase/Cloudflare.
import assert from 'node:assert/strict';

Deno.test('actual intake handlers require the correct Turnstile action before any database call', async () => {
  const oldServe = Object.getOwnPropertyDescriptor(Deno, 'serve');
  const oldFetch = globalThis.fetch;
  const envNames = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TURNSTILE_SECRET', 'INTAKE_ABUSE_MODE'];
  const oldEnv = Object.fromEntries(envNames.map(k => [k, Deno.env.get(k)]));
  const handlers=[];
  Object.defineProperty(Deno, 'serve', {configurable:true, value:(handler) => {handlers.push(handler); return {};}});
  Deno.env.set('SUPABASE_URL','https://intake-test.invalid');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-key');
  Deno.env.set('TURNSTILE_SECRET','synthetic-test-secret');
  Deno.env.delete('INTAKE_ABUSE_MODE');
  let verification, paths=[];
  const reply = (value, status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    paths.push(url.pathname);
    if (url.hostname === 'challenges.cloudflare.com' && url.pathname.endsWith('/siteverify')) return reply(verification);
    if (url.hostname !== 'intake-test.invalid') throw new Error('Unexpected external host in synthetic test');
    if (url.pathname === '/rest/v1/rpc/order_submit') return reply({id:'synthetic-order',total:123,customerEmail:'private@example.test'});
    if (url.pathname === '/rest/v1/rpc/lead_rate_limit_hit') return reply(1);
    if (url.pathname === '/rest/v1/leads') return reply({id:42},201);
    throw new Error(`Unexpected mocked path: ${url.pathname}`);
  };
  try {
    await import('../order-submit/index.ts');
    await import('../lead-capture/index.ts');
    assert.equal(handlers.length, 2);
    const request = (body) => new Request('https://intake-test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const order={items:[{productId:'synthetic',quantity:1}],name:'Synthetic Person',phone:'03000000000',paymentMethod:'cod',clientRef:'synthetic-ref',cfTurnstileToken:'token'};
    const lead={name:'Synthetic Person',phone:'03000000000',consent:true,consent_version:'lead-privacy-v1',cfTurnstileToken:'token'};
    for (const [handler, body, expected, wrong] of [[handlers[0],order,'order','lead'],[handlers[1],lead,'lead','order']]) {
      paths=[];
      const oversized = request({...body,padding:'x'.repeat(65_536)});
      assert.equal((await handler(oversized)).status,413,`${expected} rejects oversized JSON`);
      assert.deepEqual(paths,[],`${expected} rejects large input before any outbound call`);
      paths=[];
      assert.equal((await handler(request(null))).status,400,`${expected} rejects non-object JSON`);
      assert.deepEqual(paths,[],`${expected} rejects malformed input before any outbound call`);
      for (const action of [undefined,null,'',7,wrong]) {
        verification={success:true,action}; paths=[];
        const response=await handler(request(body));
        assert.equal(response.status,403,`${expected} must reject ${String(action)}`);
        assert.deepEqual(paths,['/turnstile/v0/siteverify'],`${expected} must not call the database`);
      }
      verification={success:false,action:expected};paths=[];
      assert.equal((await handler(request(body))).status,403);
      assert.deepEqual(paths,['/turnstile/v0/siteverify']);
      verification={success:true,action:expected};paths=[];
      const response=await handler(request(body));
      assert.equal(response.status,expected==='order'?200:202);
      if(expected==='order') {
        assert.ok(paths.includes('/rest/v1/rpc/order_submit'));
        assert.ok(!(JSON.stringify(await response.json()).includes('private@example.test')));
      } else {
        assert.ok(paths.includes('/rest/v1/rpc/lead_rate_limit_hit'));
        assert.ok(paths.includes('/rest/v1/leads'));
      }
    }
  } finally {
    globalThis.fetch=oldFetch;
    Object.defineProperty(Deno,'serve',oldServe);
    for (const name of envNames) oldEnv[name] === undefined ? Deno.env.delete(name) : Deno.env.set(name, oldEnv[name]);
  }
});
