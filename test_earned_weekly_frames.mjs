import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const [source, output] = process.argv.slice(2);
assert(source && output, 'Usage: node test_earned_weekly_frames.mjs FRAME_DIR OUTPUT_DIR');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const graph = await read('content/story-graph.json');
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const rows = await read(path.join(source, 'weekly-mechanics.json'));
const names = Object.fromEntries((await read('content/weekly-boss-spawns.json')).weeklyBosses.map(boss => [boss.controller, boss.name]));
const base = process.env.LAB_URL || 'http://127.0.0.1:19752/';
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true, channel:'chrome'});
const result = {};
const gallery = [];
try {
  for (const {controller} of rows) {
    const samples = await read(path.join(source, controller + '-frames.json'));
    const frames = Object.entries(samples).sort((a, b) => a[1].tick - b[1].tick);
    const page = await browser.newPage({viewport:{width:1320, height:800}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/weekly-review-local', route => route.fulfill({
      contentType:'text/html; charset=utf-8',
      body:`<!doctype html><meta charset="utf-8"><title>週ボスの描画比較</title><style>
        body{margin:0;background:#222e37;color:#edf4eb;font:16px system-ui,sans-serif}
        main{width:1260px;box-sizing:border-box;padding:20px;margin:auto}
        h1{margin:0 0 14px;font-size:25px} section{margin:0 0 14px}
        h2{margin:6px 0;font-size:16px} .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        figure{margin:0;background:#2e3b45} figcaption{padding:4px 8px}
        canvas{display:block;width:100%;image-rendering:pixelated}
      </style><main id="comparison"></main>`,
    }));
    await page.goto(base + 'weekly-review-local');
    const rendered = await page.evaluate(async ({frames, nodes, title}) => {
      const {loadScenery, scenery} = await import('./scenery.js');
      const {drawCombatRect, drawCombatRuns, elementTintedSprite, combatOpacity, omitCombatDraw} =
        await import('./sprite-images.js');
      const root = document.querySelector('main');
      const heading = document.createElement('h1');
      heading.textContent = title;
      root.append(heading);
      const loaded = new Map();
      async function paint(parent, caption, frame, draws, batches) {
        const figure = document.createElement('figure');
        const label = document.createElement('figcaption');
        label.textContent = caption;
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 540;
        figure.append(label, canvas);
        parent.append(figure);
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        ctx.imageSmoothingEnabled = false;
        scenery(ctx, frame);
        for (const d of draws) {
          if (omitCombatDraw(d)) continue;
          ctx.globalAlpha = combatOpacity(d);
          if (d.kind === 'rect') {
            drawCombatRect(ctx, d);
          } else if (d.kind === 'rect_runs') {
            drawCombatRuns(ctx, d, batches[d.batch - 1]);
          } else if (d.kind === 'boss_sprite') {
            if (!loaded.has(d.source)) {
              const image = new Image();
              image.src = 'assets/' + d.source;
              await image.decode();
              loaded.set(d.source, image);
            }
            const image = elementTintedSprite(loaded.get(d.source), d.tint);
            ctx.save();
            ctx.translate(d.x, d.y);
            if (d.rotation) ctx.rotate(d.rotation);
            if (d.flip) ctx.scale(-1, 1);
            const left = -d.w * (d.anchorX ?? .5);
            const top = -d.h * (d.anchorY ?? 1);
            ctx.drawImage(image, ...d.box, left, top, d.w, d.h);
            if (d.glow) {
              ctx.strokeStyle = '#fff3bd';
              ctx.lineWidth = 2;
              ctx.strokeRect(left - 4, top - 4, d.w + 8, d.h + 8);
            }
            ctx.restore();
          } else if (d.kind === 'text') {
            ctx.font = `bold ${d.size}px 'Yu Gothic UI',sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2a484868';
            ctx.strokeText(d.text, d.x, d.y);
            ctx.fillStyle = d.color;
            ctx.fillText(d.text, d.x, d.y);
          } else if (d.kind === 'effect') {
            ctx.globalAlpha = d.alpha * .65;
            ctx.strokeStyle = d.color;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.ellipse(d.x, d.y, d.w / 2, d.h / 2, -.2, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            throw Error('Unsupported draw: ' + d.kind);
          }
        }
        ctx.globalAlpha = 1;
        return ctx.getImageData(0, 0, 960, 540).data;
      }
      const comparison = {};
      for (const [id, sample] of frames) {
        const section = document.createElement('section');
        const label = document.createElement('h2');
        label.textContent = [sample.view.label && sample.view.label !== id ? `${sample.view.label} (${id})` : id,
          nodes[sample.node].name,
          `${(sample.tick / 60).toFixed(1)}秒`].join(' ／ ');
        const pair = document.createElement('div');
        pair.className = 'pair';
        section.append(label, pair);
        root.append(section);
        const frame = {camera:sample.camera, platforms:sample.platforms, story:{active:true, node:sample.node},
          campaign:{zone:'story:' + sample.node}, storyGraph:{nodes:[nodes[sample.node]]}};
        await loadScenery(frame);
        const sprite = await paint(pair, '元のドット絵', frame, sample.png, []);
        const packed = await paint(pair, '圧縮描画 h32c16', frame, sample.packed.draws, sample.packed.rectBatches);
        let differentPixels = 0;
        for (let i = 0; i < sprite.length; i += 4) {
          if (sprite[i] !== packed[i] || sprite[i+1] !== packed[i+1] || sprite[i+2] !== packed[i+2]
              || sprite[i+3] !== packed[i+3]) differentPixels++;
        }
        comparison[id] = {differentPixels, unpackedCommands:sample.unpackedCount,
          packedCommands:sample.packed.draws.length, unpackedBytes:sample.unpackedBytes,
          packedBytes:sample.packedBytes};
      }
      return comparison;
    }, {frames, nodes, title:names[controller]});
    assert.deepEqual(errors, []);
    const image = controller + '.png';
    await page.locator('#comparison').screenshot({path:path.join(output, image)});
    result[controller] = {image, frames:rendered};
    gallery.push(`<li><a href="${image}">${names[controller]}（${frames.length}場面）</a></li>`);
    await page.close();
    console.log(controller, frames.length, 'PNG and packed comparisons');
  }
  await fs.writeFile(path.join(output, 'weekly-frame-comparison.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'index.html'), `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>週ボスの描画比較</title>
<style>
 body{max-width:44rem;margin:3rem auto;padding:0 1.25rem;background:#222e37;color:#edf4eb;font:1rem/1.7 system-ui,sans-serif}
 a{color:#b8dfd4}li{margin:.6rem 0}
</style>
<h1>週ボスの描画比較</h1>
<p>同じ再戦場面の元のドット絵を左に、軽量版 h32c16 を右に表示します。</p>
<ul>${gallery.join('\n')}</ul></html>\n`);
} finally {
  await browser.close();
}
