import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9125';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(base);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.evaluate(()=>window.lab.action('world_map_toggle'));
 const preview=await browser.newPage();
 for(const node of graph.nodes){
  for(const edge of node.exits.filter(e=>e.routeFixture)){
   await page.evaluate(id=>window.lab.action('world_map_focus:'+id),node.id);
   const anchor=page.locator('a[href*="gateX="]').filter({hasText:'入口を見る'});
   const link=anchor.and(page.locator('a[href*="node='+node.id+'&to='+edge.to+'&"]')).last();
   await link.waitFor({state:'attached'});
   const url=await link.getAttribute('href');
   assert.equal(new URL(url,base).searchParams.get('fixture'),'closed');
   await preview.goto(new URL(url,base).href);
   await preview.waitForFunction(()=>window.mapArt?.ready);
   const toggle=preview.locator('#fixtureState');
   assert.equal(await toggle.isChecked(),false);
   await preview.locator('#focusGate').click();
   for(const open of [false,true]){
    await toggle.setChecked(open);
    const rows=graph.routeFixtures[edge.routeFixture][open?'open':'closed'];
    // Take a pixel within the distinctive bar, platform or signal arm, outside the portal tip.
    const [dx,dy,w,h,color]=rows.at(-1);
    for(const canvas of ['png','rect']){
     const rgb=await preview.evaluate(({canvas,x,y})=>Array.from(document.getElementById(canvas)
      .getContext('2d').getImageData(x-window.mapArt.camera,y,1,1).data).slice(0,3),
      {canvas,x:edge.x+dx+(w>40?6:1),y:(edge.y??480)+dy+1});
     assert.equal('#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),color);
    }
   }
   const detail=await preview.locator('#detailLink').getAttribute('href');
   await preview.goto(new URL(detail,preview.url()).href);
   await preview.waitForFunction(()=>window.mapArt?.ready);
   assert.ok(await toggle.isChecked());
   console.log(node.id,edge.routeFixture,'both states and canvases, shared crop');
  }
 }
}finally{await browser.close()}
