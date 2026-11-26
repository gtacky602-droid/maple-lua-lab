import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage();
 for(const id of ['fon-wp-55765','morte-tower-sluice']){
  const gate=nodes.find(n=>n.id===id).exits.find(e=>e.to==='chassanion-legend-bubble-room');
  const params=new URLSearchParams({node:id,to:gate.to,gateX:gate.x,gateY:gate.y??480,placements:'live',compare:'background'});
  await page.goto(new URL('map-art.html?'+params,process.env.LAB_URL||'http://127.0.0.1:9125').href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  await page.locator('#focusGate').click();
  for(const tier of [6144,4096]){
   await page.locator('#backgroundTier').selectOption(String(tier));
   await page.waitForFunction(t=>window.mapArt?.decodedBackgroundRectangles===t,tier);
   const result=await page.evaluate(()=>{
    const v=id=>Number(document.getElementById(id).value);
    const left=v('detailX'),top=v('detailY');
    const samples=['png','rect'].map(id=>document.getElementById(id).getContext('2d').getImageData(left,top,80,45).data);
    let total=0,changed=0;
    for(let i=0;i<samples[0].length;i+=4){
     const diff=[0,1,2].reduce((sum,k)=>sum+Math.abs(samples[0][i+k]-samples[1][i+k]),0);
     total+=diff;if(diff)changed++;
    }
    return {left,top,camera:v('camera'),mean:(total/10800).toFixed(2),changed,text:document.querySelector('#sampleDifference').textContent};
   });
   assert.ok(result.text.includes(result.mean+' / 255') && result.text.includes(result.changed+' / 3600'));
   assert.ok(gate.x-result.camera>=result.left && gate.x-result.camera<result.left+80);
   assert.ok((gate.y??480)>=result.top && (gate.y??480)<result.top+45);
   console.log(id,tier,result.text);
  }
 }
}finally{await browser.close()}
