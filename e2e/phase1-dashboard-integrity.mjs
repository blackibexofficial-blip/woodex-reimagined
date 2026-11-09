/* Synthetic dashboard/analytics checks; no real provider calls or customer data. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8083';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test',user_metadata:{full_name:'Synthetic Staff'}};
 await page.setRequestInterception(true);page.on('request',req=>{const u=new URL(req.url());if(u.origin!==base)return void req.abort();const json=(body,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(body)});if(u.pathname==='/auth/v1/token'){const token=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');return void json({access_token:`e30.${token}.sig`,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user});}if(u.pathname==='/auth/v1/user')return void json(user);if(u.pathname.startsWith('/rest/v1/'))return void json([]);return void req.continue();});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const unit=await page.evaluate(async()=>{
  const {summarizeOrderSample}=await import('/src/lib/order-analytics.ts');
  const o=(id,placedAt,total,status='delivered',items=[])=>({id,placedAt,total,status,items,paymentMethod:'cod'});
  const orders=[o('start','2026-01-02T00:00:00.000Z',100),o('before','2026-01-01T23:59:59.999Z',900),o('end','2026-01-31T23:59:59.999Z',200),o('after','2026-02-01T00:00:00.000Z',900),o('cancelled','2026-01-31T01:00:00.000Z',500,'cancelled'),o('invalid','not-a-date',99)];
  const result=summarizeOrderSample(orders,30,new Date('2026-01-31T12:00:00Z'));
  let invalidTotal=false,invalidLine=false;try{summarizeOrderSample([o('bad','2026-01-31T01:00:00Z',NaN)],30,new Date('2026-01-31'));}catch{invalidTotal=true;}
  try{summarizeOrderSample([o('bad','2026-01-31T01:00:00Z',1,'delivered',[{id:'x',name:'x',price:NaN,quantity:1}])],30,new Date('2026-01-31'));}catch{invalidLine=true;}
  return {result,invalidTotal,invalidLine};
 });
 check('UTC calendar boundaries include both endpoint days only',unit.result.start==='2026-01-02' && unit.result.endInclusive==='2026-01-31' && unit.result.selectedCount===3 && unit.result.orderValue===300 && unit.result.series.length===30);
 check('cancelled orders are excluded from order value but included in cancellation rate',unit.result.orders===2 && unit.result.cancelRate===33 && unit.result.series.reduce((s,p)=>s+p.orders,0)===2);
 check('invalid dates are explicitly counted and excluded',unit.result.invalidDates===1);
 check('invalid numeric values fail closed',unit.invalidTotal && unit.invalidLine);
 const mode=await page.evaluate(async()=>{
   const {config}=await import('/src/config/env.ts');const m=config.apiMode;
   if(m==='supabase')await (await import('/src/integrations/supabase/client.ts')).supabase.auth.signInWithPassword({email:'staff@example.test',password:'synthetic'});
   else localStorage.setItem('woodex.admin.session',JSON.stringify({email:'staff@example.test',name:'Synthetic',signedInAt:new Date().toISOString()}));
   const api=m==='supabase'?(await import('/src/api/supabase.ts')).supabaseAdminApi:m==='bagisto'?(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi:(await import('/src/api/demo/db.ts')).demoAdminApi;
   const now=Date.now(), iso=(delta)=>new Date(now-delta*86400000).toISOString();
   const make=(id,date,total,status='delivered')=>({id,customerName:'Synthetic',city:'Lahore',placedAt:date,status,total,items:[],paymentMethod:'cod'});
   window.fixtureOrders=[make('old','2020-01-01T12:00:00Z',987654),make('today',iso(0),1000),make('fortnight',iso(15),2000),make('cancelled',iso(0),500,'cancelled'),make('invalid','bad-date',99)];
   window.sampleFail=false;window.dashboardFail=false;window.seriesCalls=0;window.lastPage=null;
   api.listOrders=async params=>{if(window.sampleFail)throw Error('synthetic list failure');window.lastPage=params;return {items:params?.perPage===6?[]:window.fixtureOrders,total:1000,page:1,perPage:params?.perPage};};
   api.getDashboardStats=async()=>{if(window.dashboardFail)throw Error('synthetic dashboard failure');return {revenueToday:10,revenueMtd:100,ordersToday:1,ordersMtd:2,averageOrderValue:50,pendingOrders:1,newLeads:0,lowStockProducts:0,outstandingInvoices:0,openQuotes:0,pipelineValue:0,overdueReturns:0,publishedPages:0};};
   api.getRevenueSeries=async()=>{window.seriesCalls++;return [{label:'synthetic',revenue:100,orders:1}];};api.listProducts=async()=>({items:[],total:0,page:1,perPage:50});
   history.pushState({},'', '/admin/analytics');window.dispatchEvent(new PopStateEvent('popstate'));return m;
 });
 await page.waitForFunction(()=>document.body.textContent.includes('5 loaded, 3 in range'),{timeout:20000});
 const metric=label=>page.evaluate(label=>[...document.querySelectorAll('p')].find(p=>p.textContent===label)?.parentElement?.textContent??'',label);
 check(`${mode}: analytics explicitly identifies a bounded incomplete sample`,await page.evaluate(()=>document.body.textContent.includes('not a complete business report') && window.lastPage.perPage===100 && document.body.textContent.includes('invalid dates excluded')));
 check(`${mode}: old order is excluded, current non-cancelled value is shown`,(await metric('Order value in sample')).includes('3,000') && !(await metric('Order value in sample')).includes('987,654'));
 check(`${mode}: default 30-day sample counts exclude cancelled`,(await metric('Orders in sample')).includes('2') && (await metric('Cancellation rate')).includes('33%'));
 await page.select('#analytics-days','7');await page.waitForFunction(()=>document.body.textContent.includes('5 loaded, 2 in range'));
 check(`${mode}: date filter changes sample consistently`,(await metric('Order value in sample')).includes('1,000') && (await metric('Cancellation rate')).includes('50%'));
 await page.evaluate(()=>{window.sampleFail=true;});await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refresh sample')).click());await page.waitForFunction(()=>document.body.textContent.includes('Analytics unavailable'));
 check(`${mode}: failed order fetch shows unavailable instead of zeros`,await page.evaluate(()=>document.querySelector('[role=alert]')?.textContent.includes('Could not load')));
 await page.evaluate(()=>{window.sampleFail=false;});await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Try again').click());await page.waitForSelector('#analytics-days');
 check(`${mode}: analytics error can be retried`,await page.evaluate(()=>!!document.querySelector('#analytics-days')));
 await page.evaluate(()=>{const template=window.fixtureOrders[1];window.fixtureOrders=Array.from({length:101},(_,i)=>({...template,id:`row-${i}`,total:i===100?987654:1}));[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refresh sample')).click();});
 await page.waitForFunction(()=>document.body.textContent.includes('100 loaded, 100 in range'));
 check(`${mode}: even an oversized adapter response is capped at 100`,(await metric('Order value in sample')).includes('100') && !(await metric('Order value in sample')).includes('987,654'));
 await page.evaluate(()=>{history.pushState({},'','/admin/dashboard');window.dispatchEvent(new PopStateEvent('popstate'));});await page.waitForFunction(()=>document.body.textContent.includes('No orders returned.'));
 check(`${mode}: dashboard distinguishes empty results from loading and never says all stock is safe`,await page.evaluate(()=>document.body.textContent.includes('No matching low-stock items in the first 50') && !document.body.textContent.includes('Everything is comfortably stocked')));
 check(`${mode}: dashboard warns order value is not received revenue`,await page.evaluate(()=>document.body.textContent.includes('not revenue or payments received')));
 if(mode==='bagisto')check('bagisto: unavailable metrics/trend are not presented as real zeros',await page.evaluate(()=>document.body.textContent.includes('not supplied by this adapter') && document.body.textContent.includes('Trend unavailable') && window.seriesCalls===0));
 if(mode==='supabase')check('supabase: dashboard explains MTD cancellation difference and lead period',await page.evaluate(()=>document.body.textContent.includes('include cancelled orders') && document.body.textContent.includes('Leads created (7d)')));
 await page.evaluate(()=>{window.dashboardFail=true;history.pushState({},'','/admin/analytics');window.dispatchEvent(new PopStateEvent('popstate'));});await page.waitForSelector('#analytics-days');await page.evaluate(()=>{history.pushState({},'','/admin/dashboard');window.dispatchEvent(new PopStateEvent('popstate'));});await page.waitForFunction(()=>document.body.textContent.includes('Dashboard data is unavailable'));
 check(`${mode}: dashboard data failure shows error and retry`,await page.evaluate(()=>document.querySelector('[role=alert]')?.textContent.includes('No totals have been confirmed') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Try again')));
 await page.evaluate(()=>{window.dashboardFail=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='Try again').click();});await page.waitForFunction(()=>document.body.textContent.includes('No orders returned.'));
 check(`${mode}: dashboard can retry after failure`,await page.evaluate(()=>document.body.textContent.includes('Pipeline control center')));
 check(`${mode}: no uncaught browser errors`,errors.length===0);if(errors.length)console.error(errors);
}catch(e){failed++;console.error('FAIL unexpected test error',e);}finally{await browser.close();}
console.log(`Dashboard integrity: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
