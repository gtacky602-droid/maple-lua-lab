import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';

const read = async p => JSON.parse(await fs.readFile(p,'utf8'));
const base = process.env.LAB_URL || 'http://127.0.0.1:9117/';
const {scenes} = await read('assets/remaining-legends-background-generation.json');
const encoded = (await read('evidence/remaining-legends-background-compression.json')).scenes;
const nodes = new Map((await read('content/story-graph.json')).nodes.map(n=>[n.id,n]));
const roster = (await read('content/field-boss-spawns.json')).fieldBosses.filter(b=>b.id.startsWith('legend-'));
const arenasByRegion = new Map();
for (const {node} of roster) {
  const region=nodes.get(node).region;
  if (!arenasByRegion.has(region)) arenasByRegion.set(region,[]);
  arenasByRegion.get(region).push(node);
}
const browser = await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:920}});
  const errors=[], stages=[], pictures=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function open(node) {
    const region=nodes.get(node).region;
    const query=new URLSearchParams({node,region,placements:'live',arena:'legend',measured:'1',compare:'background',tier:'4096'});
    await page.goto(base+'map-art.html?'+query);
    await page.waitForFunction(n=>window.mapArt?.node===n && window.mapArt.decodedBackgroundRectangles===4096,node);
    const visible=await page.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(e=>e.dataset.node).sort());
    assert.deepEqual(visible,[...arenasByRegion.get(region)].sort());
  }
  for (const [region,arenas] of arenasByRegion) {
    if (!scenes.some(s=>nodes.get(s.node).region===region)) await open(arenas[0]);
  }
  for (const {node,source} of scenes) {
    await open(node);
    assert.equal(await page.evaluate(()=>window.mapArt.backgroundFile),source);
    const picture=async id=>page.locator('#'+id).evaluate(c=>c.toDataURL());
    const images=[await picture('png'),await picture('rect')],sizes={};
    for (const tier of encoded[source].tiers) {
      const n=tier.rectangles;
      await page.selectOption('#backgroundTier',String(n));
      await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
      assert.equal(await displayedTierHash(page,n),tier.rgbSha256);
      const link=page.locator('#sceneryDownload[download$="-'+n+'.lua"]');
      await link.waitFor();
      sizes[n]=await link.evaluate(async a=>(await (await fetch(a.href)).blob()).size);
    }
    images.push(await picture('rect'));
    pictures.push({name:nodes.get(node).name,images});
    stages.push({node,source,sizes});
  }
  const sheet=await page.evaluate(async rows=>{
    const c=document.createElement('canvas'),w=272,h=153,rowHeight=h+30;
    c.width=2*(3*w+18);c.height=42+Math.ceil(rows.length/2)*rowHeight;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#15282d';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#f1efe5';ctx.font='bold 16px "Yu Gothic UI",sans-serif';
    for(const offset of [0,c.width/2]) ['元の背景','4,096矩形','6,144矩形'].forEach((text,i)=>ctx.fillText(text,offset+i*w+6,24));
    for (const [index,row] of rows.entries()) {
      const x=(index%2)*c.width/2, y=40+Math.floor(index/2)*rowHeight;
      ctx.fillText(row.name,x+6,y+17);
      for(const [i,src] of row.images.entries()){
        const img=new Image();img.src=src;await img.decode();
        ctx.drawImage(img,x+i*w+4,y+22,w-2,h-1);
      }
    }
    return c.toDataURL();
  },pictures);
  assert.deepEqual(errors,[]);
  assert.equal(roster.length,56);
  await fs.writeFile('evidence/remaining-legend-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
  await fs.writeFile('evidence/remaining-legend-scenery-browser.json',
    JSON.stringify({regions:Object.fromEntries(arenasByRegion),stages},null,2)+'\n');
  console.log(roster.length+' measured legend arenas, '+stages.length+' new backgrounds at five tiers');
} finally {await browser.close();}
