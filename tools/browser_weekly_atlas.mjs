import assert from 'node:assert/strict';

export async function checkWeeklyAtlas(page, target, stops, label, screenshot) {
 const map = page.locator('#worldAtlas');
 await page.evaluate(()=>document.activeElement?.blur());
 await page.keyboard.press('KeyM');
 await map.waitFor();
 await map.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const {guide, time, scene}=await page.evaluate(()=>{
  const f=window.lab.frame;
  return {guide:f.worldMap.guide,time:f.t,scene:f.story.node};
 });
 assert.equal(guide.status,'battle');
 assert.deepEqual(guide.stops.map(stop=>stop.id),stops);
 assert.equal(guide.stops.at(-1).label,label);
 assert.equal(guide.stops.at(-1).mode,'battle');
 await map.locator('#atlasItineraryStops button').filter({hasText:label}).waitFor();
 const step=map.locator('#atlasItineraryStops li').filter({hasText:guide.stops.at(-1).hint});
 await step.waitFor();
 const [preview]=await Promise.all([page.waitForEvent('popup'),step.locator('a').click()]);
 try {
  const leg=guide.stops.at(-1);
  await preview.waitForFunction(id=>window.mapArt?.ready && window.mapArt.node===id,leg.id);
  const profile='h48c32';
  await preview.locator('#profile').selectOption(profile);
  await preview.locator('#battleTransferGuide a').click();
  await preview.waitForFunction(id=>window.mapArt?.ready && window.mapArt.node===id,leg.from);
  assert.equal(await preview.locator('#profile').inputValue(),profile);
  assert.equal(await preview.locator('#battleTransferGuide span').textContent(),leg.hint);
 } finally {await preview.close();}
 await page.bringToFront();
 if(screenshot)await map.screenshot({path:screenshot});
 assert.deepEqual(await page.evaluate(()=>[window.lab.frame.t,window.lab.frame.story.node]),[time,scene]);
 await page.keyboard.press('Escape');
 await map.waitFor({state:'hidden'});
 return guide.stops;
}
