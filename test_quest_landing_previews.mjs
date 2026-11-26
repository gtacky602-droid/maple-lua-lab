import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 for(const [from,to] of [['tunigi-return-shelter','tunigi-baffle-workshop'],['sumeru-branch-run','sumeru-canopy-junction'],['nod-crab-tsar-palace','nod-hiisi-mirror-court']]){
  const gate=nodes.get(from).exits.find(e=>e.to===to);
  const query=new URLSearchParams({node:from,placements:'live',to,gateX:gate.x,gateY:gate.y??480,background:'original'});
  await page.goto(new URL('map-art.html?'+query,base).href);
  await page.locator('#gatePreview a').click();
  const ready=()=>page.waitForFunction(id=>window.mapArt?.node===id&&mapArt.backgroundState==='ready',to);
  await ready();
  assert.match(await page.locator('#context').innerText(),/開いた足場に到着/);
  const pixels=()=>page.evaluate(([x,y])=>['png','rect'].map(id=>Array.from(document.getElementById(id)
   .getContext('2d').getImageData(x-mapArt.camera-12,y,24,8).data).join(',')),[gate.arrivalX,gate.arrivalY]);
  const built=await pixels();
  const url=new URL(page.url());url.searchParams.delete('from');url.searchParams.delete('departureX');
  await page.goto(url.href);await ready();
  const original=await pixels();
  for(let i=0;i<2;i++)assert.notEqual(built[i],original[i],to);
  console.log(to,gate.arrivalX,gate.arrivalY);
 }
 // The tea lift has one movable deck. Inspect both positions in a single viewport.
 await page.goto(new URL('map-art.html?node=chenyu-tea-lift&placements=live&background=original',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
 const gateMenu=page.locator('#gatePreview select');
 await page.locator('#gatePreview summary').click();
 const inspect=async destination=>{
  const index=nodes.get('chenyu-tea-lift').exits.findIndex(edge=>edge.to===destination);
  await gateMenu.selectOption(index<0?'':String(index+1));
  return page.evaluate(()=>{
   const slider=document.getElementById('camera');slider.value=500;slider.dispatchEvent(new Event('input'));
   return ['png','rect'].map(id=>[[650,312],[1200,385]].map(([x,y])=>Array.from(document.getElementById(id)
    .getContext('2d').getImageData(x-mapArt.camera,y,20,8).data).join(',')));
  });
 };
 const empty=await inspect(null),high=await inspect('chenyu-tea-lift'),side=await inspect('chenyu-tea-pavilion');
 for(let i=0;i<2;i++){
  assert.notEqual(high[i][0],empty[i][0]);assert.equal(high[i][1],empty[i][1]);
  assert.equal(side[i][0],empty[i][0]);assert.notEqual(side[i][1],empty[i][1]);
 }
 assert.deepEqual(await inspect(null),empty);
 console.log('Tea lift high and side decks replace each other in both profiles.');
}finally{await browser.close()}
