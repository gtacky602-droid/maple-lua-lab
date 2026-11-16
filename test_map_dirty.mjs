import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {placementSignature} from './placement-signature.js';
const a={id:'a',species:'hilichurl',x:1,y:480,flip:false},c={...a,id:'b'};
assert.equal(placementSignature({nodes:{x:[a],y:[]}}),placementSignature({nodes:{x:[a]}}));
assert.notEqual(placementSignature({nodes:{x:[a,c]}}),placementSignature({nodes:{x:[c,a]}}));
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
const dirty=()=>p.evaluate(()=>window.mapArt.dirty);
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);assert.equal(await dirty(),false);
 await p.locator('#placements button').first().click();await p.click('#flipSelected');assert.equal(await dirty(),true);await p.click('#undo');assert.equal(await dirty(),false);assert.doesNotMatch(await p.locator('#browserStatus').innerText(),/未保存の編集/);
 await p.click('#redo');assert.equal(await dirty(),true);await p.click('#saveBrowser');assert.equal(await dirty(),false);
 const saved=await p.evaluate(()=>localStorage.getItem('maple-lua-lab.map-draft.v1'));
 await p.click('#flipSelected');assert.equal(await dirty(),true);await p.click('#undo');assert.equal(await dirty(),false);assert.match(await p.locator('#browserStatus').innerText(),/最後に保存した配置案と同じ/);
 await p.selectOption('#node','sumeru-entry');assert.equal(await dirty(),false);await p.selectOption('#profile','legacy');await p.dispatchEvent('#profile','input');assert.equal(await dirty(),false);
 const original=JSON.parse(saved),reordered={...original,nodes:Object.fromEntries(Object.entries(original.nodes).reverse())};
 await p.locator('#import').setInputFiles({name:'same.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(reordered))});await p.waitForFunction(()=>document.getElementById('fileStatus').textContent.includes('same.json'));assert.equal(await dirty(),false);
 await p.selectOption('#node','mond-road');await p.locator('#placements button').first().click();await p.click('#flipSelected');assert.equal(await dirty(),true);
 // Failed persistence cannot move the saved baseline.
 await p.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError')}});await p.click('#saveBrowser');assert.equal(await dirty(),true);assert.match(await p.locator('#browserStatus').innerText(),/失敗/);assert.equal(await p.evaluate(()=>localStorage.getItem('maple-lua-lab.map-draft.v1')),saved);
 await p.evaluate(()=>Storage.prototype.setItem=window.realSetItem);await p.click('#undo');assert.equal(await dirty(),false);
 await p.reload();await p.waitForFunction(()=>window.mapArt?.ready);assert.equal(await dirty(),false);
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/map-dirty-test.json',JSON.stringify({errors,checks:['initial clean','edit undo redo','save establishes baseline','undo to saved content clean','view-only node/profile change clean','reordered JSON nodes equivalent','empty node equivalent but sprite draw order distinct','quota failure preserves saved baseline and dirty','reload clean']},null,2));console.log('Placement dirty state and saved baseline passed');
}finally{await b.close()}
