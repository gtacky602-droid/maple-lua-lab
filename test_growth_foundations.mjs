import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const partner='growth-partner-swap', gear='growth-targeted-gear';
const upgrade='growth-upgrade-gear', inheritance='growth-inherit-gear';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const canvas=page.locator('#game'), preview=page.locator('#artifactPreview'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const quest=id=>page.locator(`[data-quest="${id}"]`);
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const button=(name)=>page.getByRole('button',{name,exact:true});

async function load(name,node){
 const snapshot=await fs.readFile(`work/${name}.json`,'utf8');
 await page.evaluate(value=>localStorage.setItem('maple-lua-lab.checkpoint.v1',value),snapshot);
 const {session}=await frame();
 const restore=page.waitForResponse(res=>res.url().endsWith('/api/frame')&&!!res.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 const response=await restore;
 if(!response.ok())throw new Error(await response.text());
 await wait(old=>window.lab.frame.session!==old,session);
 await at(node);
}

async function accept(id){
 await quest(id).getByRole('button',{name:'受注',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests[id]?.status==='active',id);
}

async function report(id){
 await quest(id).getByRole('button',{name:'報告',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
}

async function openBag(){
 const summary=page.getByText('聖遺物バッグ・5部位装備',{exact:true});
 if(!await summary.evaluate(node=>node.parentElement.open))await summary.click();
}

async function gate(x,to){
 const right=(await frame()).actors[0].x<x;
 await canvas.click();
 await page.keyboard.down(right?'KeyD':'KeyA');
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame,actor=f.actors[f.active-1];
   return right?actor.x>=x-5:actor.x<=x+5;
  },{x,right});
 }finally{await page.keyboard.up(right?'KeyD':'KeyA')}
 await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,to);
 await page.keyboard.press('KeyF');
 await at(to);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8939/');
 await wait(()=>window.lab?.frame);
 await load('growth-foundations-fixture','mond-town');
 await accept(partner);
 await gate(1380,'mond-road');
 await canvas.click();
 await page.keyboard.press('KeyE');
 await wait(id=>window.lab.frame.story.quests[id]?.count===2,partner);
 assert.equal((await frame()).active,2);
 await button('拠点へ：モンド・城門広場').click();
 await at('mond-town');
 await report(partner);

 await load('growth-level-20','liyue-harbor');
 await accept(gear);
 await openBag();
 await page.locator('[data-action="target_set:troupe"]').click();
 await button('教材で装備を比較').click();
 await wait(id=>window.lab.frame.story.quests[id].count===2,gear);
 assert.match(await preview.textContent(),/対象ドロップ 黄金の劇団.*剣闘士のフィナーレ/);
 assert.equal((await frame()).inventory.items.length,0);
 await report(gear);

 await load('growth-level-40','inazuma-port');
 await accept(upgrade);
 await openBag();
 await button('教材で強化を試算').click();
 await wait(id=>window.lab.frame.story.quests[id].count===1,upgrade);
 assert.match(await preview.textContent(),/20,000モラ.*\+0.*\+4/);
 assert.equal((await frame()).mora,0);
 await report(upgrade);

 await load('growth-level-60','sumeru-hub');
 await accept(inheritance);
 await openBag();
 await button('教材で継承を試算').click();
 await wait(id=>window.lab.frame.story.quests[id].count===1,inheritance);
 await preview.screenshot({path:'evidence/growth-inherit-example.png'});
 assert.equal(await preview.getByRole('button').count(),0);
 await report(inheritance);

 await load('growth-inherit-fixture','sumeru-hub');
 await openBag();
 await page.locator('#artifactInheritSource').selectOption('1');
 await page.locator('#artifactInheritTarget').selectOption('2');
 await button('選んだ品で継承を試算').click();
 await wait(()=>window.lab.frame.artifactPreview?.cost===1980000);
 assert.match(await preview.textContent(),/消費する品 #1/);
 assert.match(await preview.textContent(),/変更後 #2/);
 await preview.screenshot({path:'evidence/growth-inherit-choice.png'});
 await preview.getByRole('button',{name:'継承を確定して元の品を消費',exact:true}).click();
 await wait(()=>window.lab.frame.mora===20000&&window.lab.frame.inventory.items.length===2);
 const equipped=(await frame()).inventory.items.find(item=>item.id===2);
 assert.deepEqual([equipped.itemLv,equipped.enhance,equipped.imprintStars,equipped.owner],[70,20,5,1]);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await at('sumeru-hub');
 assert.equal((await frame()).inventory.items.find(item=>item.id===1),undefined);
 assert.equal((await frame()).story.quests[inheritance].status,'complete');
 await page.setViewportSize({width:390,height:844});
 await openBag();
 await button('教材で継承を試算').click();
 await wait(()=>window.lab.frame.artifactPreview?.example===true);
 assert.ok(await preview.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/growth-foundations-web.json',JSON.stringify({
  fourReports:true,walkedToCombatAndSwapped:true,examplesWithEmptyBag:true,
  upgradePreviewWithoutSpending:true,inheritancePreviewBeforeConsent:true,
  actualTransferAndReload:true,mobilePreviewFits:true,errors
 },null,2)+'\n');
 console.log('Growth Q-G01–04: Chrome reports, ordinary combat, learning previews, transfer and reload passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,growth:f?.story?.growth,preview:f?.artifactPreview,mora:f?.mora,errors});
 await page.screenshot({path:'work/growth-foundations-failure.png'});
 throw error;
}finally{
 await browser.close();
}
