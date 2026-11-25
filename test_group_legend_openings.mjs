import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const graph=await read('content/story-graph.json');
const scenes=await read('content/group-legend-openings.json');
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const shots=new Set(['fairy-knight-twins-legend-court','chassanion-legend-bubble-room','witztli-tristars-camp']);
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9117/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 await page.locator('#atlasWorld').click();
 await page.locator('#atlasLayer').selectOption('boss');
 const choices=await page.waitForFunction(()=>window.lab.frame.worldMap?.bosses?.filter(b=>b.boss.kind==='legend').map(b=>({node:b.id,preview:b.boss.placementPreview})));
 const legends=await choices.jsonValue();
 assert.equal(legends.length,56);
 assert.ok(legends.every(b=>b.preview));
 const verified={},gallery=[];
 for(const [id,scene] of Object.entries(scenes)){
  const node=graph.nodes.find(n=>n.id===id);
  const refs=await read('work/group-legend-openings/'+id+'.json');
  if(await page.locator('#atlasWorld').isEnabled()){
   await page.locator('#atlasWorld').click();
   await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='world');
   await page.locator('#atlasLayer').selectOption('boss');
  }
  await page.locator('#atlasField').selectOption(id);
  const link=page.locator('#atlasBackgroundCompare[href*="'+id+'"]');
  const [viewer]=await Promise.all([page.waitForEvent('popup'),link.click()]);
  viewer.on('pageerror',e=>errors.push(e.message));
  await viewer.waitForFunction(([id,n])=>window.mapArt?.node===id&&window.mapArt.count===n&&window.mapArt.backgroundState==='ready',[id,scene.parts.length]);
  const initial=await viewer.evaluate(()=>window.mapArt);
  const setCamera=async v=>viewer.locator('#camera').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input'))},v);
  const plot=refs.png.filter(d=>d.kind==='boss_sprite');
  assert.equal(plot.length,initial.visuals.length);
  const matchSprites=viewer.locator('#matchSpritePng');
  if(await matchSprites.isVisible())await matchSprites.uncheck();
  const decoded=viewer.locator('#decodedBackground');
  if(await decoded.isVisible())await decoded.uncheck();
  const profiles={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await viewer.selectOption('#profile',profile);
   // Center the group so even the second ray and the outermost gunner are on-screen.
   const dx=refs.camera-initial.camera;
   const translate=ds=>ds.map(d=>({...d,x:d.x+dx}));
   const diff=await compareOpeningPixels(viewer,translate(refs.png),translate(refs[profile]),node,initial.camera);
   assert.deepEqual(diff,{png:0,rect:0},id+' '+profile+' '+JSON.stringify(diff));
   profiles[profile]=refs[profile].filter(d=>d.kind==='rect').length;
  }
  assert.ok(initial.visuals.every((v,i)=>v.source===plot[i].source&&Math.abs(v.y-plot[i].y)<1e-8&&v.height===plot[i].h));
  if(scene.parts.length>1){
   for(const p of scene.parts){
    await viewer.selectOption('#liveSubject',p.id);
    assert.equal(await viewer.evaluate(()=>window.mapArt.shownCount),1);
   }
   await viewer.selectOption('#liveSubject','');
  }
  if(shots.has(id)){
   await setCamera(initial.camera);
   await decoded.check();await viewer.selectOption('#backgroundTier','4096');
   await viewer.waitForFunction(()=>window.mapArt.decodedBackgroundRectangles===4096);
   const canvas=await viewer.locator('#rect').evaluate(c=>c.toDataURL('image/png'));
   await fs.writeFile('evidence/'+id+'-formation.png',Buffer.from(canvas.split(',')[1],'base64'));
   gallery.push({name:id,images:[await viewer.locator('#png').evaluate(c=>c.toDataURL()),canvas]});
  }
  verified[id]={tick:refs.tick,phase:refs.phase,swimming:refs.swimming,actors:plot.length,
   labels:refs.png.filter(d=>d.kind==='text').map(d=>d.text),hpBarRectangles:refs.png.filter(d=>d.kind==='rect').length,profiles};
  await viewer.close();
 }
 assert.deepEqual(errors,[]);
 const image=await page.evaluate(async rows=>{
  const names={'fairy-knight-twins-legend-court':'双生妖精の騎士','chassanion-legend-bubble-room':'シャサニョン','witztli-tristars-camp':'異色三連星'};
  const c=document.createElement('canvas');c.width=1000;c.height=32+rows.length*230;
  const ctx=c.getContext('2d');ctx.fillStyle='#18282f';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#fff4e3';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ctx.fillText('元の背景 ＋ 元のドット絵',10,23);ctx.fillText('4,096矩形の背景 ＋ 16色のドット絵',508,23);
  ctx.imageSmoothingEnabled=false;
  for(const [i,row] of rows.entries()){
   const y=32+i*230;ctx.fillText(names[row.name],10,y+18);
   for(const [j,src] of row.images.entries()){
    const im=new Image();im.src=src;await im.decode();
    ctx.drawImage(im,0,141,960,395,8+j*498,y+24,486,200);
   }
  }
  return c.toDataURL();
 },[...shots].map(id=>gallery.find(row=>row.name===id)));
 await fs.writeFile('evidence/legend-formations-comparison.png',Buffer.from(image.split(',')[1],'base64'));
 await fs.writeFile('evidence/group-legend-openings-browser.json',JSON.stringify({legendLinks:legends.length,differentPixels:0,verified},null,2)+'\n');
 console.log(Object.keys(verified).length+' rooms with groups or underwater legends match all four renderings.');
}finally{await browser.close()}
