import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const read=async name=>JSON.parse(await fs.readFile('content/'+name+'.json','utf8'));
const catalog=await read('boss-arena-index');
const atlas=await read('world-atlas');
const bosses=atlas.regions.flatMap(r=>r.points.filter(p=>p.boss));
assert.deepEqual(bosses.map(p=>p.id).sort(),Object.values(catalog).flat().map(p=>p.node).sort());
assert.ok(bosses.every(p=>p.boss.placementPreview));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9125/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 const report={};
 let viewer;
 for(const entry of Object.values(catalog).flat()){
  const id=entry.node;
  await page.locator('#atlasWorld').evaluate(b=>{if(!b.disabled)b.click()});
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='world');
  await page.selectOption('#atlasLayer','boss');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='boss');
  await page.selectOption('#atlasField',id);
  const link=page.getByRole('link',{name:/の開幕配置を比較/});
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  await link.waitFor();
  const url=new URL(await link.getAttribute('href'),page.url());
  assert.equal(url.searchParams.get('node'),id);
  assert.equal(url.searchParams.get('background'),'original');
  assert.equal(url.searchParams.get('profile'),'h32c16');
  // Follow the first link, then reuse the same comparison page for identical presets.
  if(!viewer)[viewer]=await Promise.all([page.waitForEvent('popup'),link.click()]);
  else await viewer.selectOption('#node',id);
  await viewer.bringToFront();
  try{
   await viewer.waitForFunction(id=>window.mapArt?.ready && window.mapArt.node===id && window.mapArt.shownCount>0,id);
   assert.equal(await viewer.locator('#matchSpritePng').isChecked(),false);
   assert.equal(await viewer.locator('#decodedBackground').isChecked(),false);
   assert.equal(await viewer.locator('#profile').inputValue(),'h32c16');
   await viewer.waitForFunction(()=>window.mapArt.profile==='h32c16' && window.mapArt.ready);
   if(id==='shouki-godmaking-arena'){
    await viewer.setViewportSize({width:1440,height:960});
    await viewer.locator('main').screenshot({path:'evidence/atlas-shouki-opening-16.png'});
   }
   report[id]=await viewer.evaluate(()=>window.mapArt.shownCount);
  }catch(error){
   throw Error(id+' '+await viewer.locator('#status').textContent(),{cause:error});
  }
  await page.bringToFront();
  if(Object.keys(report).length%20===0)console.log(Object.keys(report).length+' arena previews checked');
 }
 const layouts=Object.assign({},...await Promise.all(['field-boss-openings','group-legend-openings',
  'stygian-openings','weekly-opening-parts'].map(read)));
 const weekly=(await read('weekly-boss-spawns')).weeklyBosses;
 for(const [id,count] of Object.entries(report)){
  const boss=weekly.find(b=>b.node===id);
  const expected=layouts[id]?.parts.length ?? (boss?.mapIdleArt ? 1+Number(Boolean(boss.partner?.mapIdleArt)) : 0);
  assert.equal(count,expected,id);
 }
 await fs.writeFile('evidence/atlas-boss-opening-links.json',JSON.stringify(report,null,2)+'\n');
 console.log(bosses.length+' mapped arena IDs; '+Object.keys(report).length+' opening comparisons opened in Chrome.');
}finally{await browser.close()}
