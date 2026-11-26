import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL??'http://127.0.0.1:19743/';
const arrivals=JSON.parse(await readFile('evidence/transport-landings.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const atlas=await browser.newPage(),preview=await browser.newPage();
 await atlas.goto(base);
 await atlas.waitForFunction(()=>window.lab?.frame);
 await atlas.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await readFile('evidence/remaining-survey-save.json','utf8'));
 await atlas.locator('#loadProgress').click();
 await atlas.waitForFunction(()=>window.lab?.frame.story.active);
 await atlas.evaluate(()=>lab.action('world_map_toggle'));
 async function check(url,row){
  await preview.goto(url);
  await preview.waitForFunction(()=>window.mapArt?.ready);
  assert((await preview.locator('#context').innerText()).includes('旅人の到着位置（'+row.x+', '+row.y+'）'),row.origin);
  const visible=await preview.evaluate(x=>x>=mapArt.camera&&x<mapArt.camera+960,row.x);
  assert(visible,row.origin);
 }
 for(const row of arrivals){
  let url=new URL('map-art.html',base);
  if(row.automatic){
   await atlas.evaluate(id=>lab.action('world_map_focus:'+id),row.origin);
   const link=atlas.locator('#atlasRoutes a[href*="voyage='+row.origin+'&"]');
   await link.waitFor({state:'attached',timeout:4000});
   url=new URL(await link.getAttribute('href'),base);
  }else{
   url.search=new URLSearchParams({node:row.destination,from:row.origin,departureX:row.departureX,placements:'live'});
  }
  await check(url.href,row);
 }
 await check(new URL('map-art.html?node=sumeru-canopy-junction&from=sumeru-branch-run&departureX=55&placements=live',base).href,
  {origin:'sumeru-branch-run',x:1370,y:388});
 console.log(arrivals.length,'transport landings match Lua. Sumeru direct link verified.');
}finally{await browser.close()}

