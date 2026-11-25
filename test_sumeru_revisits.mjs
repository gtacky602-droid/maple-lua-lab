import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1150,height:880}});
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function inspect(file,expected){
 await page.locator('#importSave').setInputFiles(file);
 await wait(level=>window.lab.frame.progression?.level===level&&document.querySelector('#saveStatus').textContent.includes('再開'),expected.level);
 await page.evaluate(()=>window.lab.action('story_fast:sumeru-sky-observatory'));
 await wait(()=>window.lab.frame.story.node==='sumeru-sky-observatory');
 const x=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
 await page.locator('#game').click();
 const right=x<826,key=right?'KeyD':'KeyA';
 await page.keyboard.down(key);
 try{
  await wait(right=>{const f=window.lab.frame,x=f.actors[f.active-1].x;return right?x>=820:x<=832},right);
 }finally{await page.keyboard.up(key)}
 await page.keyboard.down('Space');
 try{
  await wait(()=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return a.ground&&a.y===391&&f.storySurveyMap?.id==='sumeru-height-map';
  });
 }finally{await page.keyboard.up('Space')}
 const sheets=page.locator('#surveySheet'),notes=page.locator('#surveyFieldNotes');
 assert.equal(await sheets.locator('option').count(),5);
 assert.equal(await notes.locator('li').count(),expected.notes);
 const hashes=new Set();
 for(const id of ['river-canopy','root-up','merged-canopy','wanderer-observation-record','sumeru-height-map']){
  await sheets.selectOption(id);
  hashes.add(await page.locator('#surveyMapCanvas').evaluate(c=>c.toDataURL()));
 }
 assert.equal(hashes.size,5);
 if(expected.notes===5){
  assert.match(await notes.textContent(),/内に開く窓/);
  assert.match(await notes.textContent(),/低い音 → 高い音 → 中くらいの音/);
  const panel=page.locator('#surveyMap');
  await panel.screenshot({path:'evidence/sumeru-observatory-notes.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
  await notes.getByRole('button',{name:'閲覧室を地図で見る'}).click();
  await wait(()=>window.lab.frame.worldMap?.selected?.id==='sum-kaveh-reading-room');
  await page.keyboard.press('Escape');
 }
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 await inspect('work/sumeru-revisits-route/fontaine-save.json',{level:80,notes:2});
 await inspect('evidence/sumeru-revisit-save.json',{level:81,notes:5});
 assert.deepEqual(errors,[]);
 const proof={earnedCheckpoints:[80,81],availableNotes:[2,5],distinctRenderedSheets:5,mobileWidth:390,atlasDestination:'sum-kaveh-reading-room',errors};
 await fs.writeFile('evidence/sumeru-observatory-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame,a=f?.actors[f.active-1];
  return {at:f?.story?.node,x:a?.x,y:a?.y,hp:a?.hp,ground:a?.ground,map:f?.storySurveyMap?.id,
   notice:f?.storyNotice,status:document.getElementById('status').textContent};
 }));
 throw error;
}finally{await browser.close()}
