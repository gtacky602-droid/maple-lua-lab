import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const read=async name=>JSON.parse(await fs.readFile('content/'+name+'.json','utf8'));
const {nodes}=await read('story-graph');
const rooms=Object.values(await read('boss-arena-index')).flat();
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9125/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 const panel=page.locator('#atlasBossEntrances');
 const sources=new Map();
 const visible=await page.evaluate(()=>window.lab.frame.storyGraph.nodes.map(n=>({id:n.id,exits:n.exits})));
 for(const {node:id} of rooms){
  await page.evaluate(id=>window.lab.action('world_map_boss:'+id),id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  const gates=await page.evaluate(()=>window.lab.frame.worldMap.selected.entrances);
  const authored=visible.flatMap(n=>n.exits.filter(e=>e.to===id).map(e=>[n.id,e.x,e.y??480]));
  const coordinates=gates.map(e=>[e.from,e.previewX,e.previewY]);
  assert.deepEqual(coordinates,authored,id);
  assert.ok(coordinates.every(([from,x,y])=>nodes.find(n=>n.id===from).exits.some(e=>e.to===id && e.x===x && (e.y??480)===y)));
  await page.waitForFunction(id=>document.querySelector('#atlasBossEntrances a')?.href.includes('to='+id+'&'),id);
  const links=await panel.locator('a').evaluateAll(a=>a.map(e=>e.href));
  assert.deepEqual(links.map(href=>{
   const u=new URL(href).searchParams;
   assert.equal(u.get('to'),id);
   return [u.get('node'),Number(u.get('gateX')),Number(u.get('gateY'))];
  }),authored);
  sources.set(id,coordinates);
  if(id==='buried-weaving-room'){
   await panel.evaluate(el=>{el.open=true});
   for(const gate of gates){
    assert.ok(gate.reason && gate.requiredLevel);
    const text=await panel.locator('li').filter({hasText:gate.sourceName}).innerText();
    assert.ok(text.includes(gate.reason) && text.includes('必要Lv'+gate.requiredLevel));
   }
  }
  if(id==='chassanion-legend-bubble-room'){
   await panel.locator('summary').click();
   const gate=gates.find(g=>g.from==='fon-wp-55765');
   assert.ok(gate.requiredLevel && !gate.reason);
   const row=panel.locator('li').filter({hasText:gate.sourceName});
   assert.ok((await row.innerText()).includes('必要Lv'+gate.requiredLevel));
   const [preview]=await Promise.all([page.waitForEvent('popup'),row.locator('a').click()]);
   try{
    await preview.waitForFunction(id=>window.mapArt?.ready && window.mapArt.node===id,gate.from);
    const option=preview.locator('option:checked[data-to="'+id+'"]');
    assert.equal(Number(await option.getAttribute('data-gate-x')),gate.previewX);
    assert.equal(Number(await option.getAttribute('data-gate-y')),gate.previewY);
   }finally{await preview.close()}
   await row.getByRole('button').click();
   await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,gate.from);
   assert.ok(await panel.isHidden());
  }
 }
 console.log(rooms.length+' arenas, '+[...sources.values()].reduce((n,v)=>n+v.length,0)+' entrance links');
}finally{await browser.close()}
