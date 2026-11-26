import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
const browser=await chromium.launch({channel:'chrome'});
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
}finally{await browser.close()}
