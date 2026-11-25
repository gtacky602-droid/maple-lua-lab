import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const nodes=Object.fromEntries(JSON.parse(await fs.readFile('content/story-graph.json','utf8')).nodes.map(n=>[n.id,n]));
const bosses=JSON.parse(await fs.readFile('content/field-boss-spawns.json','utf8')).fieldBosses;
const routes=[
  ['suanni-field-fixture','chenyu-camp','suanni-commission','chenyu-depth','suanni-field-sanctum','suanni-field','boss-suanni'],
  ['coop-original-bellgate-fixture','bygone-camp','bygone-sound-book','bygone-listening-gallery','bygone-bell-archive','bygone-resonance','boss-bellgate'],
];
const browser=await chromium.launch({channel:'chrome',headless:true});
const measured={};
try{
  for(const [fixture,camp,quest,approach,arena,background,species] of routes){
    const page=await browser.newPage({viewport:{width:1240,height:940}});
    const drive=waypointDriver(page,nodes,{walkTimeout:25000});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const draw=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
        const result=draw.call(this,image,...args);
        if(this.canvas.id==='game' && image.src?.includes('-native-tiers-v1.webp') && args.length===8){
          window.playedTier={file:new URL(image.src).pathname.split('/').pop(),tile:args.slice(0,4)};
        }
        return result;
      };
    });
    try{
      await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9101/');
      await page.waitForFunction(()=>window.lab?.frame);
      await page.locator('#importSave').setInputFiles('work/'+fixture+'.json');
      await drive.waitNode(camp);
      await drive.accept(quest);
      await page.locator('#renderMode').selectOption('sprite');
      await page.locator('#playBackgroundTier').selectOption('4096');
      await drive.cross(approach);
      await drive.cross(arena);
      // Enter the existing 550-pixel boss HUD range so the frame contains the opening pose.
      await drive.walk(bosses.find(b=>b.node===arena).home-520);
      await page.waitForFunction(file=>window.playedTier?.file===file && window.lab.frame.fieldBoss,background+'-native-tiers-v1.webp');
      const live=await page.evaluate(()=>{
        const f=window.lab.frame,b=f.fieldBoss;
        const art=f.draws.find(d=>d.kind==='boss_sprite' && Math.abs(d.x+f.camera-b.x)<.001 && d.y===b.y);
        return {id:b.id,x:b.x,y:b.y,source:art.source,height:art.h,flip:art.flip,scene:window.playedTier};
      });
      assert.deepEqual(live.scene.tile,[0,0,512,288]);
      await page.keyboard.press('KeyM');
      const link=page.locator('#atlasBackgroundCompare');
      const [view]=await Promise.all([page.waitForEvent('popup'),link.click()]);
      try{
        await view.waitForFunction(id=>window.mapArt?.liveView && window.mapArt.node===id && window.mapArt.count===1,arena);
        await view.selectOption('#backgroundTier','4096');
        await view.waitForFunction(()=>window.mapArt.decodedBackgroundRectangles===4096);
        const art=await view.evaluate(()=>window.mapArt);
        assert.equal(art.camera,live.x-480);
        assert.deepEqual(art.placements,[{id:live.id,species,x:live.x,y:live.y,flip:live.flip}]);
        assert.equal(art.visuals[0].height,live.height);
        assert.equal(art.visuals[0].source,live.source);
        assert.equal(art.visuals[0].y,live.y);
        const label=await view.locator('#status').innerText();
        assert.ok(label.includes(quest==='bygone-sound-book'?'依頼戦・再戦':'開戦時のボス位置'));
        measured[arena]={quest,live,label};
      }finally{await view.close();}
      assert.deepEqual(errors,[]);
    }finally{await page.close();}
  }
  await fs.writeFile('evidence/branch-courts-boss-browser.json',JSON.stringify(measured,null,2)+'\n');
  console.log('Both quest entrances, 4096-rectangle adventure backgrounds, and the exact opening boss art matched the atlas preview.');
}finally{await browser.close();}
