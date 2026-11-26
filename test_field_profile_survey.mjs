import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const spawns=JSON.parse(await readFile('content/enemy-spawns.json','utf8')).nodes;
const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL??'http://127.0.0.1:19563/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const fields=[];
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('map-art.html?placements=live',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 for(const n of graph.nodes.filter(n=>spawns[n.id])){
  await page.selectOption('#node',n.id);
  await page.waitForFunction(id=>window.mapArt?.ready && window.mapArt.node===id,n.id);
  const result=await page.evaluate(()=>{
   const {camera,count}=window.mapArt;
   if(document.querySelector('#fidelityControls').hidden)return {camera,count,profiles:null};
   document.querySelector('#compareSpriteProfiles').click();
   const profiles=Object.fromEntries([...document.querySelectorAll('#spriteProfileTable tbody tr')].map(row=>{
    const cells=[...row.cells].map(c=>c.textContent);
    const num=s=>Number.isFinite(parseFloat(s))?parseFloat(s):null;
    return [row.querySelector('button').value,{rectangles:Number(cells[1].replaceAll(',','')),overlap:num(cells[2]),colorError:num(cells[3])}];
   }));
   return {camera,count,profiles};
  });
  if(result.profiles)assert.deepEqual(Object.keys(result.profiles),['legacy','h48c32','h32c16']);
  fields.push({node:n.id,name:n.name,region:n.region,...result});
 }
 assert.equal(fields.length,Object.keys(spawns).length);
 assert.deepEqual(errors,[]);
 await writeFile('evidence/field-group-profile-scores.json','[\n'+fields.map(f=>JSON.stringify(f)).join(',\n')+'\n]\n');
 const scored=fields.filter(f=>f.profiles?.h32c16.overlap!=null);
 console.log(scored.length,'/',fields.length,scored.sort((a,b)=>a.profiles.h32c16.overlap-b.profiles.h32c16.overlap).slice(0,3));
}finally{await browser.close()}
