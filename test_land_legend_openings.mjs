import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const graph=await read('content/story-graph.json');
const bosses=(await read('content/field-boss-spawns.json')).fieldBosses.filter(b=>b.controller==='branchLegend'&&!b.partner&&!b.members);
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage(),report={};
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto(base);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 await page.locator('#atlasWorld').click();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasField').selectOption('cineas-legend-chamber');
 const link=page.getByText('この地点のドット絵を比較（別タブ）',{exact:true});
 const [viewer]=await Promise.all([page.waitForEvent('popup'),link.click()]);
 viewer.on('pageerror',err=>errors.push(err.message));
 await viewer.waitForFunction(()=>window.mapArt?.node==='cineas-legend-chamber');
 await viewer.goto(base+'map-art.html?placements=live&background=original');
 await viewer.waitForFunction(()=>window.mapArt?.ready);
 for(const boss of bosses){
  const node=graph.nodes.find(n=>n.id===boss.node);
  const ref=await read('work/land-legend-openings/'+node.id+'.json');
  await viewer.selectOption('#node',node.id);
  await viewer.waitForFunction(id=>window.mapArt.node===id&&window.mapArt.count===1&&window.mapArt.backgroundState==='ready',node.id);
  await viewer.locator('#camera').evaluate((el,camera)=>{el.value=camera;el.dispatchEvent(new Event('input'))},ref.camera);
  const profiles={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await viewer.selectOption('#profile',profile);
   const diff=await compareOpeningPixels(viewer,ref.png,ref[profile],node,ref.camera);
   assert.deepEqual(diff,{png:0,rect:0},node.id+' '+profile+' '+JSON.stringify(diff));
   profiles[profile]=ref[profile].length;
  }
  report[node.id]={name:boss.name,tick:ref.ticks,source:ref.png[0].source,rectangles:profiles};
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/land-legend-openings-browser.json',JSON.stringify({verified:bosses.length,differentPixels:0,scenes:report},null,2)+'\n');
 console.log(bosses.length+' single-body land legends matched every PNG and rectangle frame.');
}finally{await browser.close()}
