import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const panels=[];
 for(const [from,to,x,iron] of [['toyac-rainbow-key-cave','toyac-balachko-inner-cave',1400,true],
    ['sulfurous-resonant-basin','sulfurous-totem-cave',1405,false]]){
  const url=new URL('map-art.html',process.env.LAB_URL??'http://127.0.0.1:19743/');
  url.search=new URLSearchParams({node:from,to,gateX:x,gateY:480,placements:'live',profile:'h32c16',fixture:'open'});
  await page.goto(url.href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  const stage=page.locator('#questPropStage'),fixture=page.locator('#fixtureState');
  if(iron)assert.equal(await stage.inputValue(),'3');else assert(await fixture.isChecked());
  for(const open of [false,true]){
   if(iron)await stage.selectOption(open?'3':'2');else await fixture.setChecked(open);
   await page.locator('#compareSpriteProfiles').click();
   assert.deepEqual(await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.cells[1].textContent))),Array(3).fill(iron&&!open?9:4));
   const {image,colors}=await page.evaluate(x=>{
    const c=document.createElement('canvas');c.width=104;c.height=113;
    const ctx=c.getContext('2d');ctx.drawImage(document.querySelector('#rect'),x-window.mapArt.camera-52,376,104,113,0,0,104,113);
    const rgba=ctx.getImageData(0,0,104,113).data,colors=new Set();
    for(let i=0;i<rgba.length;i+=4)colors.add((rgba[i]<<16)+(rgba[i+1]<<8)+rgba[i+2]);
    return {image:c.toDataURL(),colors:[...colors]};
   },x);
   assert(colors.includes(open?0x83dbe1:iron?0xe1b968:0x565067));
   panels.push([image,(iron?'バラチコの格子':'共鳴晶岩の岩戸')+'・'+(open?'開通後':'開通前')]);
  }
 }
 await page.setContent('<style>body{margin:0}main{display:inline-flex;background:#18323a;color:white;font:14px sans-serif;text-align:center}figure{margin:8px}img{width:156px;height:170px;image-rendering:pixelated}</style><main>'+panels.map(([src,label])=>'<figure><img src="'+src+'"><figcaption>'+label+'</figcaption></figure>').join('')+'</main>');
 await page.locator('main').screenshot({path:'evidence/natlan-cave-gates-before-after.png'});
 console.log('Both gate previews match the closed and open Lua marker colors and rectangle counts.');
}finally{await browser.close()}
