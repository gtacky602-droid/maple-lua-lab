import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const scenes={
 novokichev:['novokichev-camp','novokichev-depth'],
 wavebinderField:['wavebinder-tide-cavern'],
 novoFrozenWorks:['novo-frozen-works'],
 novoDriftPassage:['novo-drift-passage'],
 novoIceVault:['novo-ice-vault'],
};
const expected=new Map(Object.entries(scenes).flatMap(([key,ids])=>ids.map(id=>[id,key])));
const base=process.env.LAB_URL||'http://127.0.0.1:19753/';
const stateFile=process.env.NOVOKICHEV_SAVE||'work/novokichev-travel/novokichev-earned-save.json';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:850}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const results=[];
try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile(stateFile,'utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 await page.waitForFunction(()=>window.lab.frame.story.node==='novokichev-camp');
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 assert.equal(await page.evaluate(()=>window.lab.frame.storyGraph.nodes.some(
  n=>n.region==='ナド・クライ特別地域（仮）')),false);
 for(const [id,scene] of expected){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  const compare=page.locator('#atlasBackgroundCompare');
  await compare.waitFor();
  const expectedLink=await compare.getAttribute('href');
  assert.equal(new URL(expectedLink,page.url()).searchParams.get('node'),id);
  const [preview]=await Promise.all([page.waitForEvent('popup'),compare.click()]);
  preview.on('pageerror',e=>errors.push(e.message));
  try{
   await preview.waitForFunction(({id,scene})=>window.mapArt?.ready&&
    window.mapArt.node===id&&window.mapArt.backgroundState==='ready'&&window.mapArt.background===scene,{id,scene});
   const native=preview.locator('#decodedBackground');
   if(!await native.isChecked())await native.check();
   for(const tier of [4096,6144]){
    await preview.locator('#backgroundTier').selectOption(String(tier));
    await preview.waitForFunction(tier=>window.mapArt?.ready&&window.mapArt.decodedBackgroundRectangles===tier,tier);
   }
   const placement=await preview.evaluate(()=>window.mapArt);
   assert.ok(!placement.backgroundFallback,id);
   assert.ok(placement.liveView,id);
   results.push({id,scene,source:placement.backgroundFile,atlasHref:expectedLink,tiers:[4096,6144]});
  }finally{await preview.close()}
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/novokichev-scenery.json',JSON.stringify({
  rooms:results,artScope:'Temporary lab backgrounds for the provisional region',
  method:'Opened each background comparison from the live Lua world map after loading the earned adventure save.',
  suspendedRegionAbsent:true,errors,
 },null,2)+'\n');
}finally{await browser.close()}
await checkTerrainScenes(scenes,[...expected.keys()],'novokichev');
console.log('Six Novokichev links opened from the live M map and rendered with original and reduced backgrounds');
