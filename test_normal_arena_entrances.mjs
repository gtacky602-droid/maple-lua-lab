import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const load=async name=>JSON.parse(await readFile('content/'+name+'.json','utf8'));
const {nodes}=await load('story-graph');
const bosses=(await load('encounters')).encounters.filter(b=>b.kind==='normal');
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage(),base=process.env.LAB_URL??'http://127.0.0.1:19743/';
 await page.goto(new URL('bosses-art.html?profile=h48c32&arena=atocpan-lava-field',base).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 const picker=page.locator('#bossArena'),panel=page.locator('#arenaEntrances');
 assert.equal(await picker.inputValue(),'atocpan-lava-field');
 let total=0;
 for(const boss of bosses){
  const id=boss.fieldNode;
  const expected=nodes.flatMap(n=>n.exits.filter(e=>e.to===id&&n.id!==id).map(e=>[n.id,String(e.x),String(e.y??480)]));
  await picker.selectOption(id);
  assert(await panel.isVisible(),boss.name);
  const actual=await panel.locator('a').evaluateAll(links=>links.map(link=>{
   const p=new URL(link.href).searchParams;
   return ['node','gateX','gateY','to','profile'].map(k=>p.get(k));
  }));
  assert.deepEqual(actual,expected.map(row=>[...row,id,'h48c32']));
  total+=actual.length;
 }
 await picker.selectOption('natlan-sunset-arena');
 await page.locator('#profile').selectOption('h32c16');
 await panel.locator('summary').click();
 const link=panel.getByRole('link',{name:'夕映え会場の水路見張り台・模擬戦の会場へ'});
 await link.click();
 await page.waitForFunction(()=>window.mapArt?.ready);
 const selected=page.locator('#gatePreview select option:checked');
 assert.equal(await selected.getAttribute('data-gate-y'),'390');
 const arrival=page.locator('#gatePreview a');
 await arrival.click();
 const battle=page;
 await battle.waitForFunction(()=>window.mapArt?.node==='natlan-sunset-arena'&&window.mapArt.ready);
 assert.equal(await battle.locator('#profile').inputValue(),'h32c16');
 console.log(bosses.length+' normal arenas, '+total+' physical gates, selected upper gate to arena in 16 colors.');
}finally{await browser.close()}
