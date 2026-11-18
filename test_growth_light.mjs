import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:30000});
const location=node=>wait(node=>window.lab.frame.story.node===node,node);
const canvas=page.locator('#game');
const hud=page.locator('#growthTrialHud');
const button=name=>page.getByRole('button',{name,exact:true});
const quest=id=>page.locator(`[data-quest="growth-${id}"]`);
const issues=[];
page.on('pageerror',error=>issues.push(error.message));

async function load(name,node){
 const file=await fs.readFile(`work/growth-light-${name}.json`,'utf8');
 await page.evaluate(data=>localStorage.setItem('maple-lua-lab.checkpoint.v1',data),file);
 const session=(await frame()).session;
 await page.locator('#loadProgress').click();
 await wait(old=>window.lab.frame.session!==old,session);
 await location(node);
}

async function enter(id,skill){
 await quest(id).getByRole('button',{name:'受注',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests['growth-'+id]?.status==='active',id);
 await quest(id).getByRole('button',{name:'練習場に入る',exact:true}).click();
 await wait(skill=>window.lab.frame.growthTrial?.skill===skill,skill);
 await hud.waitFor();
}

async function report(id){
 await quest(id).getByRole('button',{name:'報告',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests['growth-'+id]?.status==='complete',id);
}

async function charge(goal){
 await canvas.click();
 await page.keyboard.down('KeyJ');
 try{await wait(value=>window.lab.frame.gauge>=value,goal)}
 finally{await page.keyboard.up('KeyJ')}
 await wait(()=>window.lab.frame.actors[0].lock===0);
}

async function moveUntil(predicate,arg){
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(predicate,arg)}finally{await page.keyboard.up('KeyD')}
}

async function done(){
 await wait(()=>document.getElementById('growthTrialHelp').textContent.includes('練習目標を達成'));
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8941/');
 await wait(()=>window.lab?.frame);
 await load('lv160','mond-town');
 const original=await frame();
 await enter('light-release','SK58');
 await charge(60);
 await page.keyboard.press('KeyQ');
 await wait(()=>window.lab.frame.growthTrial?.marks['light-release']);
 await wait(()=>window.lab.frame.actors[0].lock===0);
 await page.keyboard.down('KeyJ');
 try{await wait(()=>window.lab.frame.growthTrial?.marks['light-normal'])}
 finally{await page.keyboard.up('KeyJ')}
 await done();
 await page.locator('.game').screenshot({path:'evidence/growth-light-training.png'});
 await page.keyboard.press('Escape');
 await hud.waitFor({state:'hidden'});
 const returned=await frame();
 assert.equal(returned.gauge,original.gauge);
 assert.equal(returned.mora,original.mora);
 assert.deepEqual(returned.inventory.items,original.inventory.items);
 assert.deepEqual(returned.loadout,original.loadout);
 await report('light-release');

 await quest('branch-visit').getByRole('button',{name:'受注',exact:true}).click();
 await button('拠点へ：ドラゴンスパイン・入口拠点').click();
 await location('dragonspine-camp');
 await moveUntil(()=>window.lab.frame.storyNearbyPortal?.to==='dragonspine-depth'&&window.lab.frame.storyNearbyPortal.available);
 await page.keyboard.press('KeyF');
 await location('dragonspine-depth');
 await moveUntil(()=>window.lab.frame.growthBranchObserve);
 await button('高難度地域の観測地点を調べる').click();
 await wait(()=>window.lab.frame.story.growth?.['branch-practice']);
 await button('拠点へ：モンド・城門広場').click();
 await location('mond-town');
 await report('branch-visit');

 await load('lv180','snezhnaya-hub');
 await enter('light-echo','SK59');
 await charge(60);
 await page.keyboard.press('KeyQ');
 await wait(()=>window.lab.frame.lightForm.seconds>0);
 await page.keyboard.press('Digit1');
 await wait(()=>window.lab.frame.echoSource==='SK09');
 await page.keyboard.press('Digit2');
 await done();
 await hud.getByRole('button',{name:'練習を終える',exact:true}).click();
 await hud.waitFor({state:'hidden'});
 await report('light-echo');

 await enter('seven-strike','SK60');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await hud.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await charge(100);
 await page.keyboard.press('Digit3');
 await wait(()=>window.lab.frame.ultimate&&window.lab.frame.gauge<10);
 await done();
 await hud.getByRole('button',{name:'練習を終える',exact:true}).click();
 await hud.waitFor({state:'hidden'});
 assert.equal((await frame()).gauge,22);
 await report('seven-strike');
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await location('snezhnaya-hub');
 const final=await frame();
 assert.equal(final.story.quests['growth-seven-strike'].status,'complete');
 assert.equal(final.story.growth['seven-strike'],true);
 assert.equal(final.growthTrial,undefined);
 assert.deepEqual(issues,[]);
 await fs.writeFile('evidence/growth-light-web.json',JSON.stringify({
  reports:4, acceptedAndFoughtThroughNormalBindings:true, realBranchWalkAndObservation:true,
  isolatedCheckpointAndResources:true, sharedGaugeAfterSevenStrike:true,
  mobileTrialControlsFit:true, reloadPersistsCompletion:true, pageErrors:issues
 },null,2)+'\n');
 console.log('Growth Q-G09–12: live Chrome practice, route observation, four reports and save passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,trial:f?.growthTrial,gauge:f?.gauge,position:f?.actors[0].x,notice:f?.skillNotice,issues});
 await page.screenshot({path:'work/growth-light-failure.png'});
 throw error;
}finally{
 await browser.close();
}
