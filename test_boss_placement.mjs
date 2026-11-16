import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const catalog=JSON.parse(await fs.readFile('content/boss-art-gallery.json','utf8')).items;
const b=await chromium.launch({headless:true,channel:'chrome'});
const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt);
try{
 await p.goto('http://127.0.0.1:8769/map-art.html');
 await p.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
 await p.selectOption('#node','sumeru-entry');
 const baseline=(await state()).count;
 const box=await p.locator('#png').boundingBox();
 const checked=[];
 for(const item of catalog){
  await p.selectOption('#species','boss-'+item.id);
  await p.mouse.click(box.x+600/960*box.width,box.y+478/540*box.height);
  let s=await state(),e=s.placements.at(-1);
  if(s.count!==baseline+1||e.species!=='boss-'+item.id||e.y!==480||!s.grounded)throw Error('add/support '+item.id);
  for(const profile of ['legacy','h48c32','h32c16']){
   await p.selectOption('#profile',profile);s=await state();
   if(s.visuals.at(-1).height!==item.height||s.visuals.at(-1).y!==480)throw Error('visual anchor '+item.id);
  }
  await p.locator(`#placements button[data-id="${e.id}"]`).click();
  await p.click('#flipSelected');if(!(await state()).placements.at(-1).flip)throw Error('flip');
  await p.click('#flipSelected');
  if(item.id==='jadeplume')await p.locator('main').screenshot({path:'evidence/jadeplume-map-comparison.png'});
  const promise=p.waitForEvent('download');await p.click('#export');const download=await promise;
  const text=await fs.readFile(await download.path(),'utf8');
  await p.click('#deleteSelected');if((await state()).count!==baseline)throw Error('delete');
  await p.locator('#import').setInputFiles({name:'boss-placement.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await p.waitForFunction(()=>document.getElementById('import').value==='');
  if(JSON.stringify((await state()).placements)!==JSON.stringify(s.placements))throw Error('roundtrip '+item.id);
  await p.locator(`#placements button[data-id="${e.id}"]`).click();await p.click('#deleteSelected');
  await p.click('#undo');if((await state()).count!==baseline+1)throw Error('undo');
  await p.locator(`#placements button[data-id="${e.id}"]`).click();await p.click('#deleteSelected');
  await p.selectOption('#editMode','add');checked.push(item.id);
 }
 await p.setViewportSize({width:390,height:844});
 if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
 if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/boss-placement-test.json',JSON.stringify({checked,profiles:3,groundSupport:true,declaredHeights:true,flip:true,exportImport:true,deleteUndo:true,mobileOverflow:false,errors},null,2));
 console.log(`${checked.length} boss candidates: placement, profiles, roundtrip and mobile passed`);
}finally{await b.close()}
