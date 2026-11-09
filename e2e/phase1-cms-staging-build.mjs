/* Requires a demo VITE_CMS_STOREFRONT_PREVIEW=1 build served locally on 4189. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4189';
const browser=await launchBrowser(); let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage();
  await page.goto(`${base}/lab/home`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.textContent.includes('PUBLISHED — from the Pages workspace'),{timeout:20000});
  const valid=await page.evaluate(()=>{
    const key='woodex.admin.db.v1'; const db=JSON.parse(localStorage.getItem(key)); const p=db.pages.find(x=>x.slug==='home');
    if(!p)return false;
    const now=new Date().toISOString();
    p.slug='build-test'; p.title='Private changed title'; p.status='published'; p.version=999; p.publishedAt=now;
    p.doc={root:{props:{}},content:[{type:'Heading',props:{id:'draft',title:'BUILD DRAFT SECRET'}}]};
    p.history=[{version:999,publishedAt:now,slug:'build-test',title:'Published build title',seo:{title:'Published build SEO'},doc:{root:{props:{}},content:[{type:'Heading',props:{id:'public',title:'BUILD PUBLISHED CONTENT',level:'h1'}}]}}];
    localStorage.setItem(key,JSON.stringify(db)); return true;
  });
  check('synthetic local fixture created',valid);
  await page.goto(`${base}/p/build-test`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('BUILD PUBLISHED CONTENT'),{timeout:20000});
  check('opt-in production-format build renders published snapshot only',await page.evaluate(()=>!document.body.textContent.includes('BUILD DRAFT SECRET') && !document.body.textContent.includes('Private changed title')));
  check('built preview applies noindex and staging canonical',await page.evaluate(()=>document.querySelector('meta[name="robots"]')?.content==='noindex,nofollow' && document.querySelector('link[rel="canonical"]')?.href===`${location.origin}${location.pathname}`));
  console.log(`\nCMS staging build: ${passed}/${passed+failed} passed (local synthetic browser)`);
  if(failed)process.exitCode=1;
} catch(error){console.error(error);process.exitCode=1;} finally{await browser.close();}
