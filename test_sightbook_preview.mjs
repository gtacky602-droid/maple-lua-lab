import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {worksitePoint,worksitePoints,surveyPointUrl} from './survey-point.js';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const quest=graph.quests.find(q=>q.sights);
const sites=worksitePoints(quest);
const {worksites}=JSON.parse(await fs.readFile('content/worksite-props.json','utf8'));
const art=worksites[quest.id];
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 const root=process.env.LAB_URL||'http://127.0.0.1:9117/';
 const errors=[],rows=[];
 page.on('pageerror',error=>errors.push(error.message));
 for(const site of sites){
  await page.goto(new URL(surveyPointUrl(worksitePoint(quest,site.id,site.node)),root).href);
  await page.waitForFunction(id=>document.querySelector('#surveyPointNote')?.dataset.worksite===id&&
   window.mapArt?.decodedBackgroundRectangles===4096,site.id);
  const result=await page.evaluate(({site,sites,art})=>{
   const camera=Number(document.querySelector('#camera').value);
   const visible=sites.reduce((sum,place)=>sum+art[place.id].filter(([dx,dy,w,h])=>
    place.x+dx+w>camera&&place.x+dx<camera+960&&place.y+dy+h>0&&place.y+dy<540).length,0);
   if(!document.querySelector('#surveyPointNote').textContent.includes(visible+'矩形'))throw Error('Visible draw count');
   const counts={visibleRectangles:visible},crops=[];
   for(const layer of ['png','rect']){
    const canvas=document.getElementById(layer),ctx=canvas.getContext('2d');
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const expected=new Map();
    for(const place of sites){
     for(const [dx,dy,w,h,color] of art[place.id]){
      for(let y=place.y+dy;y<place.y+dy+h;y++)for(let x=place.x-camera+dx;x<place.x-camera+dx+w;x++){
       if(x<0||x>=canvas.width||y<0||y>=canvas.height)continue;
       if(Math.abs(x+camera-site.x)<=12&&Math.abs(y-site.y)<=12)continue;
       expected.set(canvas.width*y+x,color);
      }
     }
    }
    for(const [offset,color] of expected){
     const rgb=(pixels[offset*4]<<16)+(pixels[offset*4+1]<<8)+pixels[offset*4+2];
     if(rgb!==parseInt(color.slice(1),16))throw Error(site.id+' '+layer+' '+offset);
    }
    counts[layer]=expected.size;
    const crop=document.createElement('canvas');crop.width=236;crop.height=110;
    crop.getContext('2d').drawImage(canvas,site.x-camera-118,site.y-89,236,110,0,0,236,110);
    crops.push(crop.toDataURL());
   }
   return {counts,crops};
  },{site,sites,art});
  assert.ok(result.counts.png>0&&result.counts.png===result.counts.rect);
  rows.push({name:site.name,...result});
 }
 const sheet=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=984;c.height=317;
  const ctx=c.getContext('2d');ctx.fillStyle='#173538';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#fff0d2';ctx.font='bold 18px sans-serif';ctx.fillText('綾華の案内絵図',12,25);
  ctx.font='14px sans-serif';ctx.fillText('上は元の背景画像、下は4,096矩形。水色の十字が景色を調べる位置。',12,49);
  for(const [i,row] of rows.entries()){
   const x=10+244*i;ctx.fillText(row.name,x,76);
   for(const [j,src] of row.crops.entries()){
    const img=new Image();img.src=src;await img.decode();ctx.drawImage(img,x,84+j*115);
   }
  }
  return c.toDataURL();
 },rows);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-sightbook-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 const checks=rows.map(({name,counts})=>({name,...counts}));
 await fs.writeFile('evidence/sightbook-preview-pixels.json',JSON.stringify(checks,null,2)+'\n');
 console.log(checks);
}finally{await browser.close()}
