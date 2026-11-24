import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {MAX_SAVE_FILE_BYTES} from './save-transfer.js';
const base=process.env.LAB_URL||'http://127.0.0.1:8771',b=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
const key='maple-lua-lab.checkpoint.v1';
try{
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForFunction(()=>window.lab?.frame);
 await p.click('#exportSave');assert.match(await p.locator('#saveStatus').textContent(),/先に/);
 await p.evaluate(()=>window.lab.action('story_start'));await p.waitForFunction(()=>window.lab.frame.story.active);
 await p.evaluate(()=>window.lab.action('story_accept:mond-patrol'));await p.waitForFunction(()=>window.lab.frame.story.quests['mond-patrol']);
 await p.click('#saveProgress');await p.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 const promise=p.waitForEvent('download');await p.click('#exportSave');const download=await promise,text=await fs.readFile(await download.path(),'utf8');const exported=JSON.parse(text);
 assert.equal(exported.story.quests['mond-patrol'].status,'active');
 const receiver=await b.newPage({viewport:{width:1200,height:1000}});receiver.on('pageerror',e=>errors.push(e.message));await receiver.goto(base);await receiver.waitForFunction(()=>window.lab?.frame);assert.equal(await receiver.evaluate(key=>localStorage.getItem(key),key),null);
 const upload=async text=>{await receiver.locator('#importSave').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(text)});await receiver.waitForFunction(()=>!document.getElementById('importSave').disabled&&document.getElementById('importSave').value==='')};
 await upload(text);assert.match(await receiver.locator('#saveStatus').textContent(),/このブラウザにも保存/);
 assert.equal(await receiver.evaluate(()=>window.lab.frame.story.quests['mond-patrol'].status),'active');
 const before=await receiver.evaluate(key=>localStorage.getItem(key),key),sid=await receiver.evaluate(()=>window.lab.frame.session);
 for(const bad of ['{','null','[]',JSON.stringify({...exported,version:99})]){
  await upload(bad);assert.match(await receiver.locator('#saveStatus').textContent(),/元のブラウザ保存は保持/);assert.equal(await receiver.evaluate(key=>localStorage.getItem(key),key),before);assert.equal(await receiver.evaluate(()=>window.lab.frame.session),sid);
 }
 await upload(text+' '.repeat(MAX_SAVE_FILE_BYTES));
 assert.ok((await receiver.locator('#saveStatus').textContent()).includes(`${MAX_SAVE_FILE_BYTES/1024}KiB`));
 assert.equal(await receiver.evaluate(key=>localStorage.getItem(key),key),before);
 assert.equal(await receiver.evaluate(()=>window.lab.frame.session),sid);
 await receiver.route('**/api/frame',async route=>{const data=route.request().postDataJSON();if(data.restore)await route.fulfill({status:503,body:'offline'});else await route.continue()});
 await upload(text);assert.match(await receiver.locator('#saveStatus').textContent(),/保持/);assert.equal(await receiver.evaluate(key=>localStorage.getItem(key),key),before);await receiver.unroute('**/api/frame');
 await receiver.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='maple-lua-lab.checkpoint.v1')throw new DOMException('Storage full','QuotaExceededError');return original.call(this,k,v)}});
 await upload(text);assert.match(await receiver.locator('#saveStatus').textContent(),/再開しましたが.*保存に失敗/);assert.equal(await receiver.evaluate(key=>localStorage.getItem(key),key),before);await receiver.evaluate(()=>window.restoreStorage());
 await upload(text);await receiver.locator('#saveControls').screenshot({path:'evidence/save-transfer.png'});
 await receiver.setViewportSize({width:390,height:844});assert.equal(await receiver.locator('#saveControls').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/save-transfer-test.json',JSON.stringify({separateBrowserContexts:true,exportImport:true,questPreserved:true,invalidFilesPreserveSaveAndSession:true,networkFailurePreservesSave:true,storageFailureReportedAfterResume:true,mobileOverflow:false,errors},null,2));
 await p.goto('about:blank');await receiver.goto('about:blank');console.log('Save file transfer between browser contexts and failure preservation passed');
}finally{await b.close()}
