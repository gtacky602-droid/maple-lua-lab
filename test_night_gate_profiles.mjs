import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const art=JSON.parse(await readFile('assets/night-trial-totem-field-idle-sprites-v1.json','utf8'));
const counts=Object.values(art.profiles).map(grid=>grid.runs.length);
const base=process.env.LAB_URL??'http://127.0.0.1:19743/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let total=0;
 for(const node of graph.nodes){
  for(const gate of node.exits.filter(edge=>edge.nightTotem)){
   const url=new URL('map-art.html',base);
   url.search=new URLSearchParams({node:node.id,to:gate.to,placements:'live',gateX:gate.x,gateY:gate.y??480,profile:'h32c16'});
   if(!total)await page.goto(url.href);
   else{
    await page.selectOption('#node',node.id);
    await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id,node.id);
    await page.locator('#gatePreview summary').click();
    await page.locator('#gatePreview select').selectOption(String(node.exits.indexOf(gate)+1));
   }
   async function compare(expected){
    await page.locator('#compareSpriteProfiles').click();
    const actual=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.cells[1].textContent.replaceAll(',',''))));
    assert.deepEqual(actual,expected,node.id);
   }
   if(gate.rockSeal){
    await compare([4,4,4]);
    await page.locator('#fixtureState').check();
   }
   await compare(counts);
   total++;
  }
 }
 assert.equal(total,24);assert.deepEqual(errors,[]);
 console.log(total+' night trial gates; seal and all three totem profiles matched:',counts);
}finally{await browser.close()}
