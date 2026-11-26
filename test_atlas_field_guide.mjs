import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9124';
const load=async name=>JSON.parse(await readFile('content/'+name,'utf8'));
const index=await load('field-sprite-index.json');
const spawns=(await load('enemy-spawns.json')).nodes;
const byNode=new Map();
for(const species of index.species)for(const [node,count] of species.places){
 if(!byNode.has(node))byNode.set(node,new Map());
 byNode.get(node).set(species.id,count);
}
assert.equal(byNode.size,Object.keys(spawns).length);
for(const [node,placements] of Object.entries(spawns)){
 const counts=new Map();
 for(const p of placements)counts.set(p.art,(counts.get(p.art)||0)+1);
 assert.deepEqual(counts,byNode.get(node),node);
}
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/fontaine-wildlife-save.json');
 await page.waitForFunction(()=>window.lab.frame.story?.node==='fontaine-hub');
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 const link=page.locator('#atlasFieldEnemyGuide'),node='fontaine-field';
 await page.locator('#atlasField').selectOption(node);
 await link.waitFor();
 assert((await link.innerText()).includes('（'+spawns[node].length+'体）'));
 const opened=page.waitForEvent('popup');
 await link.click();
 const guide=await opened;
 const choices=guide.locator('#species');
 await guide.waitForFunction(()=>document.querySelector('#source')?.dataset.art);
 assert.deepEqual(await choices.locator('option').evaluateAll(options=>options.map(o=>o.value)),[...byNode.get(node).keys()]);
 for(const [id,count] of byNode.get(node)){
  await choices.selectOption(id);
  await guide.waitForFunction(value=>document.querySelector('#source').dataset.art===value,id);
  assert.equal(await guide.locator('#place').inputValue(),node);
  assert.equal(await guide.locator('#count').innerText(),'この地点に'+count+'体配置。地図を開いたときの進行状況では、入場時に'+count+'体出現。');
  const map=new URL(await guide.locator('#fieldMap').getAttribute('href'),base);
  assert.equal(map.searchParams.get('node'),node);
  assert.equal(map.searchParams.get('species'),id);
 }
 await guide.locator('#scope a').click();
 await guide.waitForFunction(()=>document.querySelector('#source')?.dataset.art);
 assert.equal(await choices.locator('option').count(),index.species.length);
 await page.locator('#atlasField').selectOption('fontaine-hub');
 await link.waitFor({state:'hidden'});
 assert.equal(await link.getAttribute('href'),null);
 await page.locator('#atlasField').selectOption('fon-emilie-scent-shore');
 await link.waitFor();
 await page.waitForFunction(()=>document.querySelector('#atlasFieldEnemyGuide').textContent.includes('今入ると0体／全配置1体'));
 const shore=page.waitForEvent('popup');
 await link.click();
 const shoreGuide=await shore;
 await shoreGuide.waitForFunction(()=>document.querySelector('#source')?.dataset.art==='armored-crab');
 assert((await shoreGuide.locator('#count').innerText()).includes('入場時に0体出現。 関連する依頼「旅の香りを、ひとしずく」'));
 console.log(byNode.size+' placement lists match; M map, scoped guide, species switching, full guide and empty hub verified.');
}finally{await browser.close()}
