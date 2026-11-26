import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const node = 'sites-hunt-36704';
const base = process.env.LAB_URL || 'http://127.0.0.1:9068';
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await browser.newPage();
  // Keep the long-lived and freshly created comparison canvases on the same raster backend.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
      return getContext.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);
    };
  });
  await page.goto(new URL('/map-art.html?background=original&node=' + node, base).href);
  await page.waitForFunction(() => window.mapArt?.ready && window.mapArt.backgroundState === 'ready');
  const items = [true, false].map((flip, i) => ({
    id: 'layer-' + i, species: 'boss-ronova', x: i ? 1150 : 1006, y: 480, flip,
  }));
  const draft = {version: 1, nodes: {[node]: items}};
  await page.locator('#import').setInputFiles({
    name: 'layers.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)),
  });
  await page.waitForFunction(() => window.mapArt.count === 2);

  const results = await page.evaluate(async ({node, items}) => {
    const {paintSprite, spriteBounds} = await import('./sprite-layers.js');
    const {scenery} = await import('./scenery.js');
    const json = async url => (await fetch(url)).json();
    const graph = await json('content/story-graph.json');
    const spec = (await json('content/boss-art-gallery.json')).items.find(b => b.id === 'ronova');
    async function load(file) {
      const art = await json('assets/' + file);
      art.image = new Image();
      art.image.src = 'assets/' + art.source;
      await art.image.decode();
      return art;
    }
    const [right, left, wings] = await Promise.all([spec.file,spec.leftFile,spec.rear.file].map(load));
    const platforms = graph.nodes.find(n => n.id === node).platforms;
    const results = [];
    for (const camera of [0, 600, 1920]) {
      const slider = document.getElementById('camera');
      slider.value = camera;
      slider.dispatchEvent(new Event('input'));
      for (const profile of ['legacy', 'h32c16']) {
        const picker = document.getElementById('profile');
        picker.value = profile;
        picker.dispatchEvent(new Event('input'));
        const total = [right, left, wings, wings].reduce((n, art) => n + art.profiles[profile].runs.length, 0);
        // From the left edge only the wings of the left-facing figure overlap the camera.
        const visible = camera === 0 ? wings.profiles[profile].runs.length : camera === 600 ? total : 0;
        const samePixels = {};
        for (const mode of ['png', 'rect']) {
          const canvas = document.getElementById(mode);
          const reference = document.createElement('canvas');
          reference.width = canvas.width;
          reference.height = canvas.height;
          const ctx = reference.getContext('2d');
          scenery(ctx, {camera, platforms, campaign:{zone:'story:'+node}, story:{active:true,node}, storyGraph:graph});
          ctx.imageSmoothingEnabled = false;
          for (const item of items) {
            const art = item.flip ? left : right;
            ctx.save();
            ctx.translate(item.x-camera,item.y-(spec.mapHover||0));
            for (const [layer,height,bottom] of [[wings,spec.rear.height,spec.rear.bottom],[art,spec.height,0]]) {
              paintSprite(ctx,layer,layer.image,spriteBounds(layer,height,bottom),mode==='png'?null:profile);
            }
            ctx.restore();
            ctx.fillStyle = '#fff';
            ctx.fillRect(item.x-camera-3,item.y-1,6,2);
          }
          const expected = ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const actual = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          samePixels[mode] = expected.every((value,i) => value===actual[i]);
        }
        results.push({camera,profile,total,visible,samePixels,caption:document.getElementById('viewportCost').textContent,
          status:document.getElementById('status').textContent});
      }
    }
    return results;
  }, {node, items});
  for (const row of results) {
    assert.ok(row.samePixels.png && row.samePixels.rect, JSON.stringify(row));
    assert.ok(row.status.includes('矩形'+row.total.toLocaleString('ja-JP')+'個'));
    assert.ok(row.visible ? row.caption.includes('矩形 '+row.visible.toLocaleString('ja-JP')+'個') : row.caption.includes('素材はありません'));
    if (row.visible && row.profile==='h32c16') assert.ok(row.caption.includes('%減'));
  }
  await fs.writeFile('evidence/placement-viewport-cost.json', JSON.stringify(results,null,2)+'\n');
  console.log('Viewport totals and exact canvas pixels verified for two facing directions, rear-only and empty views.');
} finally {
  await browser.close();
}
