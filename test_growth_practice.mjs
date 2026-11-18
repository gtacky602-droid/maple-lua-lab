import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game');
const quest=id=>page.locator(`[data-quest="growth-${id}"]`);
const button=name=>page.getByRole('button',{name,exact:true});
const at=node=>wait(node=>window.lab.frame.story?.node===node,node);
const preview=page.locator('#artifactPreview');
const bag=page.getByText('聖遺物バッグ・5部位装備',{exact:true});

async function load(name,node){
 const checkpoint=await fs.readFile(`work/${name}.json`,'utf8');
 await page.evaluate(value=>localStorage.setItem('maple-lua-lab.checkpoint.v1',value),checkpoint);
 const before=(await frame()).session;
 const restore=page.waitForResponse(res=>res.url().endsWith('/api/frame')&&!!res.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 const response=await restore;
 assert.equal(response.status(),200,await response.text());
 await wait(old=>window.lab.frame.session!==old,before);
 await at(node);
}

async function accept(id){
 await quest(id).getByRole('button',{name:'受注',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests['growth-'+id]?.status==='active',id);
}

async function report(id){
 await quest(id).getByRole('button',{name:'報告',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests['growth-'+id]?.status==='complete',id);
}

async function openBag(){
 if(!await bag.evaluate(node=>node.parentElement.open))await bag.click();
}

async function enterField(node){
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{
  await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);
 }finally{await page.keyboard.up('KeyD')}
 await page.keyboard.press('KeyF');
 await at(node);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8940/');
 await wait(()=>window.lab?.frame);
 await load('growth-imprint-lv1','mond-town');
 await accept('first-imprint');
 await openBag();
 await button('教材で刻印の一星を試算').click();
 await wait(()=>window.lab.frame.artifactPreview?.kind==='imprint');
 assert.match(await preview.textContent(),/教材の刻印の一星.*200,000モラ/);
 assert.match(await page.locator('#inventoryImprintStatus').textContent(),/装備の光界値 0 \/ 50.*共通戦闘ゲージ 60 \/ 100/);
 assert.equal((await frame()).inventory.items.length,0);
 await report('first-imprint');

 await load('growth-party-imprint','natlan-hub');
 await openBag();
 await page.locator('#artifactPairCompanion').selectOption('beidou');
 await button('編成の光界値を比較').click();
 await wait(()=>window.lab.frame.artifactPreview?.kind==='party');
 assert.equal(await preview.locator('tbody tr').count(),5);
 assert.match(await preview.locator('caption').textContent(),/26 \/ 50 → 比較先 50 \/ 50/);
 assert.equal((await frame()).companion.id,'amber');
 await page.locator('#artifactBarrierTarget').selectOption('novokichev-depth');
 assert.match(await preview.textContent(),/障壁に威力100を当てた試算　現在 57 → 比較先 100/);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await preview.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await preview.screenshot({path:'evidence/growth-party-imprint-mobile.png'});
 await page.setViewportSize({width:1280,height:980});
 await report('pair-imprint');

 await load('growth-lunar-lv120','nod-port');
 await accept('lunar-practice');
 await enterField('nod-field');
 await wait(()=>window.lab.frame.auras.some(a=>a.element==='hydro'&&a.owner===2));
 await page.keyboard.press('Digit1');
 await wait(()=>window.lab.frame.story.growth?.['lunar-reaction']);
 assert.match(await page.locator('#companionStatus').textContent(),/月感電/);
 await button('拠点へ：ナド・クライ・到着港').click();
 await at('nod-port');
 await report('lunar-practice');

 await load('growth-star-lv149','snezhnaya-hub');
 await accept('star-practice');
 assert.doesNotMatch(await quest('star-practice').textContent(),/Lv155/);
 await enterField('snezhnaya-field');
 await page.keyboard.press('Digit1');
 await wait(()=>window.lab.frame.starSeed);
 await wait(()=>window.lab.frame.story.growth?.['star-wind']);
 await button('拠点へ：スネージナヤ・雪の町').click();
 await at('snezhnaya-hub');
 await report('star-practice');
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await at('snezhnaya-hub');
 assert.equal((await frame()).story.quests['growth-star-practice'].status,'complete');
 assert.equal((await frame()).story.growth['star-wind'],true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/growth-practice-web.json',JSON.stringify({
  reports:4, emptyBagImprintAtLevel1:true, separateCombatGauge:true, pairPower:[26,50],
  barrierTestDamage:[57,100], mobilePreviewFits:true, moonInOrdinaryField:'月感電',
  starInOrdinaryField:'星嵐の種', savesReportAndOptionalLesson:true, errors
 },null,2)+'\n');
 console.log('Growth Q-G05–08: four Chrome reports, equipment comparisons, moon and star hits, mobile and save passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,actors:f?.actors?.map(a=>[a.x,a.y]),growth:f?.story?.growth,notice:f?.skillNotice,errors});
 await page.screenshot({path:'work/growth-practice-failure.png'});
 throw error;
}finally{
 await browser.close();
}
