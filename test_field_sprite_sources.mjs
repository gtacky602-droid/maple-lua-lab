import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright';

const packed=execFileSync(process.env.PYTHON||'python',['tools/field_sprite_frames.py'],{maxBuffer:16*1024*1024});
const frames=JSON.parse(gunzipSync(packed));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:940}});
 const errors=[],checked=[];
 page.on('pageerror',error=>errors.push(error.stack));
 let current=frames[0];
 await page.route('**/api/frame',route=>route.fulfill({json:current.frame}));
 await page.addInitScript(()=>{
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  window.fieldSheetPaints=new Set();
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   const result=draw.call(this,image,...args);
   if(this.canvas.id==='game'&&image instanceof HTMLImageElement&&args.length===8){
    const frame=window.lab?.frame;
    window.fieldSheetPaints.add(JSON.stringify([frame?.story?.node,frame?.camera,new URL(image.src).pathname,...args.slice(0,4)]));
   }
   return result;
  };
 });
 await page.goto(new URL('/',process.env.LAB_URL||'http://127.0.0.1:9124/').href);
 for(const record of frames){
  current=record;
  const {source,box}=record.draw;
  const key=JSON.stringify([record.node,record.frame.camera,'/assets/'+source,...box]);
  await page.waitForFunction(key=>window.fieldSheetPaints.has(key),key);
  checked.push({species:record.species,node:record.node,source,box});
  if(['fatui-frost-operative','sternshield-crab'].includes(record.species)){
   await page.locator('#game').screenshot({path:'evidence/'+record.species+'-field-png.png'});
  }
 }
 assert.deepEqual(errors,[]);
 assert.equal(checked.length,frames.length);
 await fs.writeFile('evidence/field-sprite-browser-sources.json',JSON.stringify({
  scope:'Controlled Lua frames from field placements; live game Canvas drawImage sheet and crop verified.',checked,
 },null,2)+'\n');
 console.log(checked.length+' ordinary enemy PNG sheets and crops painted by the game canvas');
}finally{await browser.close()}
