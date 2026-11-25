import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
const arena = 'chizhang-legend-terrace';
const browser = await chromium.launch({channel:'chrome'});
try {
  const page = await browser.newPage();
  const drive = waypointDriver(page, nodes);
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9101/');
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/chizhang-legend-terrace-fixture.json');
  await drive.waitNode('chenyu-camp');
  await drive.warp('liyue-wp-64830');
  await page.locator('#renderMode').selectOption('sprite');
  await page.locator('#playBackgroundTier').selectOption('4096');
  await drive.cross(arena);
  await drive.walk(182);
  await page.waitForFunction(() => window.lab.frame.fieldBoss);
  const live = await page.evaluate(() => {
    const f = window.lab.frame;
    return f.draws.filter(d => d.kind==='boss_sprite' && d.source.startsWith('chizhang-')).map(d => ({
      x:d.x + f.camera, y:d.y, height:d.h, flip:d.flip, source:d.source,
    }));
  });
  assert.equal(live.length, 2);
  await page.keyboard.press('KeyM');
  const [view] = await Promise.all([page.waitForEvent('popup'), page.locator('#atlasBackgroundCompare').click()]);
  await view.waitForFunction(id=>window.mapArt?.node===id && window.mapArt.liveView && window.mapArt.count===2, arena);
  await view.selectOption('#backgroundTier', '4096');
  await view.waitForFunction(()=>window.mapArt.decodedBackgroundRectangles===4096);
  const art = await view.evaluate(()=>window.mapArt);
  assert.equal(art.camera, (live[0].x + live[1].x)/2 - 480);
  const seen = art.placements.map(({x,y,flip},i)=>({x,y,flip,height:art.visuals[i].height,source:art.visuals[i].source}));
  assert.deepEqual(seen, live);
  assert.equal(art.backgroundFile,'chenyu-twin-vishap-court-background-v1.png');
  await view.locator('main').screenshot({path:'evidence/chenyu-twins-live-4096.png'});
  await fs.writeFile('evidence/chenyu-lake-twin-boss.json',JSON.stringify({arena,live,camera:art.camera,
    tier:art.decodedBackgroundRectangles,background:art.backgroundFile},null,2)+'\n');
  console.log('Both opening sprites matched the adventure on the atlas with the 4096-rectangle background.');
} finally {await browser.close();}
