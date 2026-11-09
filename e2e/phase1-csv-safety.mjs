/* Browser-unit regression for spreadsheet-safe CSV escaping. No real spreadsheet is launched. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8083';const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try{
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===base?r.continue():r.abort());await page.goto(base,{waitUntil:'domcontentloaded'});
 const csv=await page.evaluate(async()=>{const {toCsv}=await import('/src/lib/csv.ts');return toCsv(['Value'],[['=SUM(1,2)'],['+cmd'],['-2+3'],['@x'],['  =1'],['\t=1'],['\r@x'],['\u200b=1'],['Normal'],['hello, "world"'],[-42],[42],['-42']]);});
 const lines=csv.split('\r\n');
 check('formula starters are prefixed even when CSV quoting is needed',lines[1]===`"'=SUM(1,2)"` && lines[2]==="'+cmd" && lines[3]==="'-2+3" && lines[4]==="'@x");
 check('leading whitespace and invisible prefixes do not bypass protection',lines[5]==="'  =1" && lines[6]==="'\t=1" && lines[7]===`"'\r@x"` && lines[8]==="'\u200b=1");
 check('normal strings and embedded quotes retain CSV escaping',lines[9]==='Normal' && lines[10]==='"hello, ""world"""');
 check('real numbers stay numeric; formula-like text is prefixed',lines[11]==='-42' && lines[12]==='42' && lines[13]==="'-42");
}catch(e){failed++;console.error('FAIL unexpected test error',e);}finally{await browser.close();}
console.log(`CSV safety: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
