import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const baselineCommit='dec4ed2';
const before=execFileSync('git',['show',baselineCommit+':map-art.js'],{encoding:'utf8'});
const b=await chromium.launch({headless:true,channel:'chrome'}),checks=[];
try{
 for(const mode of ['before','after']){
  const p=await b.newPage();let active=0,peak=0;const names=new Set(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  if(mode==='before')await p.route('**/map-art.js',r=>r.fulfill({contentType:'text/javascript',body:before}));
  await p.route('**/assets/*.png',async r=>{
   const name=new URL(r.request().url()).pathname;
   if(!name.includes('background')){names.add(name);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,100));active--;}
   await r.continue();
  });
  const start=performance.now();await p.goto('http://127.0.0.1:8769/map-art.html');
  await p.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
  const bootMs=performance.now()-start;assert.deepEqual(errors,[]);assert.ok(peak<=(mode==='before'?1:6));if(mode==='after')assert.ok(peak>1);
  assert.ok(!(await p.locator('#status').textContent()).includes('読み込み中'));
  checks.push({mode,bootMs,peak,uniqueImages:names.size});await p.close();
 }
 const p=await b.newPage(),expected=[];p.on('pageerror',e=>expected.push(e.message));
 await p.route('**/assets/electro-regisvine-idle-source-v1.png',r=>r.fulfill({status:404,body:'missing'}));
 await p.goto('http://127.0.0.1:8769/map-art.html');
 await p.waitForFunction(()=>document.getElementById('status').textContent.includes('画像を読み込めません'),null,{timeout:60000});
 assert.match(await p.locator('#status').textContent(),/electro-regisvine-idle-source-v1.png/);
 assert.equal(await p.evaluate(()=>!!window.mapArt?.ready),false);
 await p.waitForTimeout(300);assert.match(await p.locator('#status').textContent(),/再読み込み/);assert.equal(expected.length,1);
 await fs.writeFile('evidence/map-image-load.json',JSON.stringify({baselineCommit,checks,artificialDelayMs:100,workerLimit:6,missingAsset:'filename shown; editor not initialized; error persists',scope:'single local startup observations, not FPS or native performance'},null,2));
 console.log(JSON.stringify(checks));
}finally{await b.close()}
