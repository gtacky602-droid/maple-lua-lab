import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const catalog=JSON.parse(await fs.readFile('content/weapon-settings.json','utf8'));
const starters=catalog.items.filter(item=>item.bound&&item.bound!=='traveler');
const saveFile=process.env.COMPANION_ROSTER_SAVE||'work/companion-starters/companion-earned-roster-save.json';
const evidence=process.env.COMPANION_BROWSER_EVIDENCE||'work/companion-starters/companion-starters-browser.json';
const base=process.env.LAB_URL||'http://127.0.0.1:19753/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1180,height:860}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const row=id=>page.locator(`[data-quest="${id}"]`);
const starterStatus=page.locator('#starterEquipmentStatus');
const partner=page.locator('#weaponPanel');

async function waitForOwner(item){
 await page.waitForFunction(({bound,id})=>{
  const f=window.lab.frame;
  return f.companion?.id===bound&&f.weaponView?.partner===id&&f.starterEquipment?.flower.hp===10;
 },item);
}
async function select(item){
 const button=row(item.quest).getByRole('button',{name:/を同行に選ぶ$/});
 await button.click();
 await waitForOwner(item);
}
async function load(){
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
}
async function openFilter(){
 const filter=page.locator('#questFilter');
 await filter.selectOption('complete');
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile(saveFile,'utf8'));
 await load();
 await page.waitForFunction(()=>window.lab.frame.progression?.level===200&&window.lab.frame.story?.active);
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await openFilter();
 const result=[];
 for(const item of starters){
  await select(item);
  const f=await frame();
  assert.ok(f.storyJoined[item.bound]);
  const label=await starterStatus.innerText();
  const active=f.weaponView.options.find(row=>row.id===item.id);
  assert.ok(label.includes(item.name)&&label.includes(f.starterEquipment.flower.name),label);
  assert.ok(label.includes(`武器ATK ${active.atk}`),label);
  result.push({id:item.bound,weapon:item.id,flower:f.starterEquipment.flower.name,label});
 }

 const ayaka=starters.find(item=>item.bound==='ayaka');
 const beidou=starters.find(item=>item.bound==='beidou');
 await select(ayaka);
 await partner.locator('summary').click();
 await partner.locator('[data-weapon="SW02"]').getByRole('button',{name:'綾華に装備',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.weaponView.partner==='SW02');
 const transferred=await starterStatus.innerText();
 assert.match(transferred,/港の護送剣.*武器ATK/);
 assert.ok(transferred.includes('綾華の入門の花'));
 const presets=page.locator('#partyPresets');
 await presets.locator('summary').click();
 const register=presets.getByRole('button',{name:'枠2を登録',exact:true});
 await register.click();
 await page.waitForFunction(()=>window.lab.frame.partyPresets?.[2]?.weapons?.partner==='SW02');
 await select(beidou);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await load();
 await waitForOwner(beidou);
 await presets.locator('summary').click();
 await presets.getByRole('button',{name:'枠2を適用',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.companion.id==='ayaka'&&window.lab.frame.weaponView.partner==='SW02');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 assert.match(await starterStatus.innerText(),/港の護送剣.*武器ATK/);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await starterStatus.evaluate(el=>el.scrollWidth<=el.clientWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(evidence,JSON.stringify({journalSelections:result,reloadedPreset:'ayaka:SW02',
  sharedLevel:200,mobileWidth:390,errors},null,2)+'\n');
 console.log('Eight earned journal selections, live equipment labels, and a weapon preset after save reload passed');
}finally{await browser.close()}
