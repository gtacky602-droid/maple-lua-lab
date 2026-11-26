import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',args:['--disable-gpu']});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9125/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='mond-town');
 const board=page.locator('#dailyBoard');
 if(!await board.evaluate(el=>el.open))await board.locator('summary').click();
 await board.locator('[data-daily-id="daily-mond-slimes"] select').selectOption('mond-road');
 await page.locator('#atlasDaily summary').click();
 const item=page.locator('#atlasDailyLinks li').filter({hasText:'今日の観察記録'});
 const preview=item.getByRole('link',{name:/体の配置を比較/});
 const [art]=await Promise.all([page.waitForEvent('popup'),preview.click()]);
 await art.waitForFunction(()=>window.mapArt?.ready);
 const selected=await art.evaluate(()=>window.mapArt.placements);
 assert.ok(selected.length && selected.every(e=>e.species.includes('slime')));
 assert.deepEqual(selected.map(e=>e.id),new URL(art.url()).searchParams.getAll('target'));
 assert.ok(await art.locator('#dailyTargetPreview').isVisible());
 await art.locator('#profile').selectOption('h48c32');
 await art.locator('#measureSprite').click();
 const fidelity=await art.locator('#spriteFidelity').evaluate(el=>JSON.parse(el.dataset.result));
 assert.ok(fidelity.union>0);
 await art.locator('#dailyTargetPreview a').click();
 await art.waitForFunction(()=>window.mapArt?.ready && window.mapArt.profile==='h48c32');
 assert.ok(await art.locator('#dailyTargetPreview').isHidden());
 const all=await art.evaluate(()=>window.mapArt.placements);
 assert.ok(all.length>selected.length && selected.every(e=>all.some(other=>other.id===e.id)));
 console.log(JSON.stringify({targets:selected.map(e=>e.id),all:all.length,overlap:fidelity.overlapPercent}));
}finally{await browser.close()}
