import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const folder='work/quest-daily-fields';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1250,height:960}});
const atlas=page.locator('#worldAtlas');
const panel=page.locator('#atlasDaily');
const errors=[];
const cases=[
  {name:'mond',before:'mond-before-commission',after:'mond-after-commission',region:'region-01',
    field:'mond-watchtower',gate:/街道を取り戻せ！/,daily:'皇女の巡察',initial:5,restored:0,targets:1},
  {name:'liyue',before:'liyue-before-commission',after:'liyue-after-commission',region:'region-02',
    field:'liyue-loading-yard',gate:/港に着いたら、ひと仕事！/,daily:'今日は、この道を頼むよ',initial:17,restored:17,targets:11},
  {name:'inazuma',before:'inazuma-before-lantern',after:'inazuma-after-commission',region:'region-03',
    field:'inazuma-lantern-trail',gate:/その灯籠、今、動きました？/,daily:'早く終わらせたい見回り',initial:17,restored:17,targets:17},
];
const readView=()=>page.evaluate(()=>window.lab.frame.worldMap);
page.on('pageerror',error=>errors.push(error.message));

async function open(fixture,region,field,layer){
  await page.locator('#importSave').setInputFiles(`${folder}/${fixture}.json`);
  const message=await page.waitForFunction(()=>{
    const text=document.querySelector('#saveStatus').textContent;
    return /このブラウザにも保存|読み込みに失敗/.test(text)&&text;
  });
  assert.match(await message.jsonValue(),/このブラウザにも保存/,fixture);
  await page.locator('#game').click();
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
  if(layer==='hunt'){
    await page.selectOption('#atlasLayer','hunt');
    await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
  }
  await page.selectOption('#atlasField',field);
  await page.waitForFunction(({field,layer})=>{
    const view=window.lab.frame.worldMap;
    return view?.layer===layer&&view.selected?.id===field;
  },{field,layer});
  return readView();
}

async function close(){
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
}

try{
  const records={};
  for(const spec of cases){
    // Reload through a fresh game entry so each import waits for its own response.
    await page.goto(process.env.LAB_URL||'http://127.0.0.1:8862/');
    await page.waitForFunction(()=>window.lab?.frame);
    const initial=await open(spec.before,spec.region,spec.field,'all');
    assert.equal(initial.guide.status,'blocked');
    assert.match(initial.guide.reason,spec.gate);
    assert.equal(initial.selected.entryEnemyCount,spec.initial);
    if(!await panel.evaluate(el=>el.open)) await panel.locator('summary').click();
    const item=panel.locator('li').filter({hasText:spec.daily});
    const link=item.getByRole('link',{name:`対象${spec.targets}体の配置を比較`});
    const href=await link.evaluate(el=>el.href);
    const targets=new URL(href).searchParams.getAll('target');
    assert.equal(targets.length,spec.targets);
    if(spec.name==='mond')assert.match(await item.innerText(),/「街道を取り戻せ！」を進めると、この地点での討伐機会が終了/);
    await atlas.screenshot({path:`${folder}/${spec.name}-map-before.png`});
    await close();
    await page.goto(process.env.LAB_URL||'http://127.0.0.1:8862/');
    await page.waitForFunction(()=>window.lab?.frame);
    const latest=await open(spec.after,spec.region,spec.field,spec.name==='mond'?'all':'hunt');
    assert.equal(latest.guide.status,'ready');
    assert.equal(latest.selected.entryEnemyCount,spec.restored);
    if(spec.name==='mond'){
      assert.ok(await panel.isHidden());
    }else{
      assert.equal(latest.selected.huntKind,'field');
      const afterTargets=latest.selected.dailyQuests.find(q=>q.name===spec.daily).targets;
      assert.deepEqual(afterTargets,targets);
    }
    records[spec.name]={field:spec.field,blocked:initial.guide.reason,after:latest.guide.status,
      targets,entryPopulationBefore:spec.initial,entryPopulationAfter:spec.restored,
      untilQuestClear:initial.selected.dailyQuests.find(q=>q.name===spec.daily).untilQuestClear};
    await atlas.screenshot({path:`${folder}/${spec.name}-map-after.png`});
    await close();
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${folder}/quest-daily-atlas-browser.json`,JSON.stringify(records,null,2)+'\n');
  console.log('M map verified before and after all three commissions.');
}finally{await browser.close()}
