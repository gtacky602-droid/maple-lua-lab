import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const kind=process.argv.includes('--characters')?'character':'boss';
const catalog=JSON.parse(await fs.readFile(`content/${kind}-art-gallery.json`,'utf8')).items;
const b=await chromium.launch({headless:true,channel:'chrome'});
const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt);
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8769')+'/map-art.html');
 await p.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
 await p.selectOption('#node','sumeru-entry');
 if(kind==='character'){
  await p.selectOption('#species','boss-jadeplume');const box=await p.locator('#png').boundingBox();
  await p.locator('#png').click({position:{x:800/960*box.width,y:478/540*box.height}});
 }
 const baseline=(await state()).count;
 const box=await p.locator('#png').boundingBox();
 const checked=[];
 for(const item of catalog){
  await p.selectOption('#species',kind+'-'+item.id);
  await p.locator('#png').click({position:{x:600/960*box.width,y:478/540*box.height}});
  let s=await state(),e=s.placements.at(-1);
  if(s.count!==baseline+1||e.species!==kind+'-'+item.id||e.y!==480||!s.grounded)throw Error('add/support '+item.id);
  for(const profile of ['legacy','h48c32','h32c16']){
   await p.selectOption('#profile',profile);s=await state();
   if(s.visuals.at(-1).height!==item.height||s.visuals.at(-1).y!==480-(item.mapHover??0))throw Error('visual anchor '+item.id);
  }
  await p.locator(`#placements button[data-id="${e.id}"]`).click();
  await p.click('#flipSelected');if(!(await state()).placements.at(-1).flip)throw Error('flip');
  await p.click('#flipSelected');
  if(kind==='boss'&&item.id==='jadeplume')await p.locator('main').screenshot({path:'evidence/jadeplume-map-comparison.png'});
  if(kind==='character'&&item.id==='traveler')await p.locator('main').screenshot({path:'evidence/character-boss-map-comparison.png'});
  if(item.id==='electro-regisvine')await p.locator('main').screenshot({path:'evidence/electro-regisvine-map-comparison.png'});
  if(item.id==='ruin-serpent')await p.locator('main').screenshot({path:'evidence/ruin-serpent-map-comparison.png'});
  if(item.id==='aeonblight')await p.locator('main').screenshot({path:'evidence/aeonblight-map-comparison.png'});
  if(item.id==='lava-dragon')await p.locator('main').screenshot({path:'evidence/lava-dragon-map-comparison.png'});
  if(item.id==='qucusaur')await p.locator('main').screenshot({path:'evidence/qucusaur-map-comparison.png'});
  if(item.id==='yumka')await p.locator('main').screenshot({path:'evidence/yumka-map-comparison.png'});
  if(item.id==='signora-flame')await p.locator('main').screenshot({path:'evidence/signora-flame-map-comparison.png'});
  if(item.id==='signora')await p.locator('main').screenshot({path:'evidence/signora-map-comparison.png'});
  if(item.id==='dvalin')await p.locator('main').screenshot({path:'evidence/dvalin-map-comparison.png'});
  if(item.id==='childe-foul')await p.locator('main').screenshot({path:'evidence/childe-foul-map-comparison.png'});
  if(item.id==='childe')await p.locator('main').screenshot({path:'evidence/childe-map-comparison.png'});
  if(item.id==='andrius')await p.locator('main').screenshot({path:'evidence/andrius-map-comparison.png'});
  if(item.id==='azhdaha')await p.locator('main').screenshot({path:'evidence/azhdaha-map-comparison.png'});
  if(item.id==='wolflord')await p.locator('main').screenshot({path:'evidence/wolflord-map-comparison.png'});
  if(item.id==='legatus')await p.locator('main').screenshot({path:'evidence/legatus-map-comparison.png'});
  if(item.id==='suanni')await p.locator('main').screenshot({path:'evidence/suanni-map-comparison.png'});
  if(item.id==='field-generator')await p.locator('main').screenshot({path:'evidence/field-generator-map-comparison.png'});
  if(item.id==='tulpa')await p.locator('main').screenshot({path:'evidence/tulpa-map-comparison.png'});
  if(item.id==='emperor')await p.locator('main').screenshot({path:'evidence/emperor-map-comparison.png'});
  if(item.id==='seahorse')await p.locator('main').screenshot({path:'evidence/seahorse-map-comparison.png'});
  if(item.id==='baptist')await p.locator('main').screenshot({path:'evidence/baptist-map-comparison.png'});
  if(item.id==='wenut')await p.locator('main').screenshot({path:'evidence/wenut-map-comparison.png'});
  if(item.id==='asimon')await p.locator('main').screenshot({path:'evidence/asimon-map-comparison.png'});
  const promise=p.waitForEvent('download');await p.click('#export');const download=await promise;
  const text=await fs.readFile(await download.path(),'utf8');
  await p.click('#deleteSelected');if((await state()).count!==baseline)throw Error('delete');
  await p.locator('#import').setInputFiles({name:kind+'-placement.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await p.waitForFunction(()=>document.getElementById('import').value==='');
  if((await state()).visuals.at(-1).y!==480-(item.mapHover??0))throw Error('restored hover '+item.id);
  if(JSON.stringify((await state()).placements)!==JSON.stringify(s.placements))throw Error('roundtrip '+item.id);
  await p.locator(`#placements button[data-id="${e.id}"]`).click();await p.click('#deleteSelected');
  await p.click('#undo');if((await state()).count!==baseline+1)throw Error('undo');
  await p.locator(`#placements button[data-id="${e.id}"]`).click();await p.click('#deleteSelected');
  await p.selectOption('#editMode','add');checked.push(item.id);
 }
 await p.setViewportSize({width:390,height:844});
 if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
 if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile(`evidence/${kind}-placement-test.json`,JSON.stringify({checked,profiles:3,groundSupport:true,declaredHeights:true,hoverOffsets:true,flip:true,exportImport:true,deleteUndo:true,mobileOverflow:false,errors},null,2));
 console.log(`${checked.length} ${kind} candidates: placement, profiles, roundtrip and mobile passed`);
}finally{await b.close()}
