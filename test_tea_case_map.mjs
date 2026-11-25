import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';

const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const suffix=process.argv.includes('--earned')?'-earned':'';
const frames=JSON.parse(await fs.readFile('work/ina-tea-case'+suffix+'-map-frames.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const quest=graph.quests.find(q=>q.teaCase),node=graph.nodes.find(n=>n.id===quest.target);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 const errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const step of [6,7]){
  const point=surveyPoint(quest,step-1,node.id);
  await page.goto(new URL(surveyPointUrl(point),base).href);
  await page.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready');
  await page.locator('#decodedBackground').uncheck();
  const result=await page.evaluate(async({node,point,draws})=>{
   const {scenery}=await import('./scenery.js');
   const {drawSurveyPoint}=await import('./survey-point.js');
   const camera=window.mapArt.camera;
   const frame={camera,platforms:node.platforms,story:{active:true,node:node.id},campaign:{zone:'story:'+node.id}};
   const images=new Map();
   for(const name of new Set(draws.sprite.map(d=>d.source))){
    const img=new Image();img.src='assets/'+name;await img.decode();images.set(name,img);
   }
   const result={};
   for(const [id,list] of [['png',draws.sprite],['rect',draws.rect]]){
    const ref=document.createElement('canvas');ref.width=960;ref.height=540;
    const ctx=ref.getContext('2d');scenery(ctx,frame);
    const background=ctx.getImageData(0,0,960,540).data;
    ctx.imageSmoothingEnabled=false;
    for(const d of list){
     if(d.kind==='boss_sprite'){
      ctx.save();ctx.translate(d.x-camera,d.y);ctx.drawImage(images.get(d.source),...d.box,-d.w*d.anchorX,-d.h,d.w,d.h);ctx.restore();
     }else{
      ctx.fillStyle=d.color;ctx.fillRect(d.x-camera,d.y,d.w,d.h);
     }
    }
    drawSurveyPoint(ctx,point,camera);
    const expected=ctx.getImageData(0,0,960,540).data;
    const actual=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
    let checked=0,different=0;
    for(let i=0;i<expected.length;i+=4){
     if(expected[i]===background[i]&&expected[i+1]===background[i+1]&&expected[i+2]===background[i+2])continue;
     checked++;
     if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2])different++;
    }
    result[id]={checked,different};
   }
   return result;
  },{node,point,draws:frames[step]});
  for(const {checked,different} of Object.values(result)){
   assert.ok(checked>1000&&different===0,JSON.stringify({step,result}));
  }
  results.push({step,...result});
  if(step===7){
   const src=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=232;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#203236';ctx.fillRect(0,0,900,232);
    ctx.font='bold 18px "Yu Gothic UI",sans-serif';ctx.fillStyle='#fff1cf';ctx.imageSmoothingEnabled=false;
    for(const [i,id] of ['png','rect'].entries()){
     ctx.fillText(i?'Lua矩形・16色':'元PNG',i*450+10,26);
     ctx.drawImage(document.getElementById(id),400,300,450,196,i*450,36,450,196);
    }
    return canvas.toDataURL();
   });
   await fs.writeFile('evidence/ina-tea-case-comparison.png',Buffer.from(src.split(',')[1],'base64'));
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/ina-tea-case-map-pixels.json',JSON.stringify(results,null,2)+'\n');
 console.log(results);
}finally{await browser.close()}
