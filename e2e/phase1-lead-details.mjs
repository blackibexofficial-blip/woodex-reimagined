/* Real browser-local demo lead + staff details view; blocks all external requests. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===base?r.continue():r.abort());
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const chatMessage='Synthetic callback content '+ 'z'.repeat(300)+' CHAT END';
 const chat=await page.evaluate(async message=>{const api=(await import('/src/api/demo/db.ts')).demoAdminApi;const result=await api.captureChatOffline({name:'Synthetic Callback',phone:'03000000000',message,consent:true});const leads=await api.listLeads({query:'Synthetic Callback'});const thread=await api.getChatConversation(result.conversation.id);return {lead:leads.items.find(l=>l.id===result.leadId),thread};},chatMessage);
 check('demo offline chat stores complete message and lead summary',chat.lead?.summary.endsWith('CHAT END') && chat.thread?.messages.some(m=>m.body===chatMessage));
 const summary='Start\n'+'Long enquiry '.repeat(30)+'<script>not executable</script> END OF ENQUIRY';
 await page.evaluate(async summary=>{localStorage.setItem('woodex.admin.session',JSON.stringify({email:'test@example.test',name:'Test',signedInAt:new Date().toISOString()}));await (await import('/src/api/demo/db.ts')).demoAdminApi.createLead({type:'quote',name:'Synthetic Detail Customer',phone:'03000000000',summary,consent:true});},summary);
 await page.goto(`${base}/admin/leads`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[aria-label="Details for Synthetic Detail Customer"]',{timeout:20000});
 await page.click('[aria-label="Details for Synthetic Detail Customer"]');await page.waitForSelector('[data-testid="lead-enquiry-details"]');
 check('staff details shows complete enquiry including ending and line breaks',await page.$eval('[data-testid="lead-enquiry-details"]',(e,s)=>e.textContent===s,summary));
 check('enquiry remains plain text, not executable HTML',await page.$eval('[data-testid="lead-enquiry-details"]',e=>e.textContent.includes('<script>not executable</script>') && !e.querySelector('script')));
 check('details dialog is scrollable',await page.$eval('[role=dialog]',e=>getComputedStyle(e).overflowY==='auto'));
 check('no uncaught browser errors',errors.length===0);
}catch(e){failed++;console.error('FAIL unexpected test error',e);}finally{await browser.close();}
console.log(`Lead details: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
