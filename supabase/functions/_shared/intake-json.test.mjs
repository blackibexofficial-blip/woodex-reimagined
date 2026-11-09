import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_INTAKE_BODY_BYTES as MAX,readIntakeJson} from './intake-json.mjs';
const request = (body, headers={}) => new Request('https://test.invalid',{method:'POST',headers,body,duplex:'half'});
const stream = (chunks, onCancel=()=>{}) => new ReadableStream({
  start(controller) { for(const chunk of chunks) controller.enqueue(chunk); },
  cancel() { onCancel(); },
});
const enc = new TextEncoder();

test('valid JSON object, including Unicode, parses correctly',async()=>{
  assert.deepEqual(await readIntakeJson(request(JSON.stringify({name:'آمنہ',items:[]}))),{ok:true,body:{name:'آمنہ',items:[]}});
});
test('exact byte limit is accepted and one byte over is rejected',async()=>{
  const body = '{"x":"'+'a'.repeat(MAX-8)+'"}';
  assert.equal(enc.encode(body).length,MAX);
  assert.equal((await readIntakeJson(request(body))).ok,true);
  assert.deepEqual(await readIntakeJson(request(body+' ')),{ok:false,status:413});
});
test('size is bytes rather than characters',async()=>{
  const body = JSON.stringify({x:'ا'.repeat(MAX/2)});
  assert.ok(body.length<MAX && enc.encode(body).length>MAX);
  assert.deepEqual(await readIntakeJson(request(body)),{ok:false,status:413});
});
test('declared oversized content length fails before body reading',async()=>{
  assert.deepEqual(await readIntakeJson(request('{}',{'content-length':String(MAX+1)})),{ok:false,status:413});
});
test('oversized chunked or misleading content length is stopped and cancelled',async()=>{
  for (const headers of [{},{'content-length':'1'}]) {
    let cancelled=false;
    const body=stream([enc.encode('{"x":"'),new Uint8Array(MAX),enc.encode('"}')],()=>{cancelled=true;});
    assert.deepEqual(await readIntakeJson(request(body,headers)),{ok:false,status:413});
    assert.equal(cancelled,true);
  }
});
test('malformed, non-object, empty and invalid UTF-8 are rejected',async()=>{
  for (const body of ['{','null','[]','"string"','1','',new Uint8Array([0xff])]) {
    assert.deepEqual(await readIntakeJson(request(body)),{ok:false,status:400});
  }
  assert.deepEqual(await readIntakeJson(new Request('https://test.invalid',{method:'POST'})),{ok:false,status:400});
});
test('stream failures reject without producing an object',async()=>{
  const body=new ReadableStream({start(controller){controller.error(new Error('broken'));}});
  assert.deepEqual(await readIntakeJson(request(body)),{ok:false,status:400});
});
