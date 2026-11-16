import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium} from 'playwright';
import {loadImageSet,spriteImageNames,atlasNames} from './sprite-images.js';
const names=[...spriteImageNames,...atlasNames];let active=0,peak=0;const progress=[];
const makeImage=()=>({async decode(){active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--}});
const start=performance.now(),images=await loadImageSet([...names,names[0]],{makeImage,onProgress:(n,total)=>progress.push([n,total])});
assert.equal(Object.keys(images).length,names.length);assert.equal(peak,6);assert.equal(active,0);assert.deepEqual(progress.at(-1),[names.length,names.length]);
const parallelMs=performance.now()-start;const serialStart=performance.now();await loadImageSet(names,{concurrency:1,makeImage});const serialMs=performance.now()-serialStart;
await assert.rejects(loadImageSet(['bad','good'],{makeImage:()=>({async decode(){if(this.src.endsWith('bad'))throw Error('404');await new Promise(r=>setTimeout(r,10))}})}),/bad/);
assert.deepEqual(await loadImageSet([]),{});await assert.rejects(loadImageSet([],{concurrency:0}));
for(const name of names)await fs.access('assets/'+name);
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],checks=[];
try{
 for(const [url,ready,status] of [['/','lab','status'],['/compare.html','compareLab','state']]){
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));let inflight=0,maxInflight=0;
  await page.route('**/assets/**',async route=>{const name=new URL(route.request().url()).pathname.slice('/assets/'.length);if(names.includes(name)){inflight++;maxInflight=Math.max(maxInflight,inflight);await new Promise(r=>setTimeout(r,100));inflight--}await route.continue()});
  const t=performance.now();await page.goto('http://127.0.0.1:8769'+url);await page.waitForFunction(key=>!!window[key]?.frame,ready,{timeout:60000});const bootMs=performance.now()-t;assert.ok(maxInflight>1&&maxInflight<=6);
  assert.ok(!(await page.locator('#'+status).textContent()).includes('読み込み中'));await page.locator(url==='/'?'#game':'#sceneA').screenshot({path:'evidence/image-load-'+ready+'.png'});checks.push({page:url,bootMs,maxInflight});await page.close();
 }
 const page=await browser.newPage();const expectedErrors=[];page.on('pageerror',e=>expectedErrors.push(e.message));await page.route('**/assets/nobushi-idle-source-v1.png',r=>r.fulfill({status:404,body:'missing'}));await page.goto('http://127.0.0.1:8769/');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('画像を読み込めません'),null,{timeout:60000});assert.match(await page.locator('#status').textContent(),/nobushi-idle-source-v1.png/);assert.equal(await page.evaluate(()=>!!window.lab),false);await page.waitForTimeout(300);assert.match(await page.locator('#status').textContent(),/再読み込み/);assert.equal(expectedErrors.length,1);await page.close();assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/image-load.json',JSON.stringify({names:names.length,workerLimit:6,mockDecodeDelayMs:5,mockSerialMs:serialMs,mockParallelMs:parallelMs,checks,missingAsset:'filename displayed; game not started; error not overwritten',errors,scope:'startup loading only; timings are local test observations, not FPS or native performance'},null,2));console.log(JSON.stringify({names:names.length,parallelMs,serialMs,checks}));
}finally{await browser.close()}
