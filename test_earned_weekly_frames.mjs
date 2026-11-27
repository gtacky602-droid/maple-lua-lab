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
const version = browser.version();
const result = {};
const gallery = [];
try {
  for (const {controller, case:caseId = controller, label = names[controller]} of rows) {
    assert.match(caseId, /^[\w-]+$/);
    const samples = await read(path.join(source, caseId + '-frames.json'));
    const frames = Object.entries(samples).sort((a, b) => a[1].tick - b[1].tick);
    const page = await browser.newPage({viewport:{width:1500, height:800}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/weekly-review-local', route => route.fulfill({
      contentType:'text/html; charset=utf-8',
      body:`<!doctype html><meta charset="utf-8"><title>週ボスの描画比較</title><style>
        body{margin:0;background:#222e37;color:#edf4eb;font:16px system-ui,sans-serif}
        main{width:1440px;box-sizing:border-box;padding:20px;margin:auto}
        h1{margin:0 0 14px;font-size:25px} section{margin:0 0 14px}
        h2{margin:6px 0;font-size:16px} .profiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .mechanic{margin:4px 0 8px;color:#b8dfd4}
        figure{margin:0;background:#2e3b45} figcaption{padding:4px 8px}
        canvas{display:block;width:100%;image-rendering:pixelated}
      </style><main id="comparison"></main>`,
    }));
    await page.goto(base + 'weekly-review-local');
    const rendered = await page.evaluate(async ({frames, nodes, title}) => {
      const {loadScenery, scenery} = await import('./scenery.js');
      const {falseMoonEncounterText, narwhalJourneyText, primalTrialText, raidenFlowerText} = await import('./endgame-ui.js');
      const {drawCombatRect, drawCombatRuns, elementTintedSprite, combatOpacity, omitCombatDraw, loadImageSet} =
        await import('./sprite-images.js');
      const root = document.querySelector('main');
      const heading = document.createElement('h1');
      heading.textContent = title;
      root.append(heading);
      const width = 960, height = 540;
      const loaded = await loadImageSet(frames.flatMap(([,sample]) => sample.png
        .filter(draw => draw.kind === 'boss_sprite').map(draw => draw.source)));
      function canvasContext() {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        ctx.imageSmoothingEnabled = false;
        return ctx;
      }
      function paint(parent, caption, frame, commands) {
        const figure = document.createElement('figure');
        const label = document.createElement('figcaption');
        label.textContent = caption;
        const ctx = canvasContext();
        figure.append(label, ctx.canvas);
        parent.append(figure);
        scenery(ctx, frame);
        paintDraws(ctx, commands);
        return ctx.getImageData(0, 0, width, height).data;
      }
      function paintDraws(ctx, {draws, rectBatches}) {
        for (const d of draws) {
          if (omitCombatDraw(d)) continue;
          ctx.globalAlpha = combatOpacity(d);
          if (d.kind === 'rect') {
            drawCombatRect(ctx, d);
          } else if (d.kind === 'rect_runs') {
            drawCombatRuns(ctx, d, rectBatches[d.batch - 1]);
          } else if (d.kind === 'boss_sprite') {
            const image = elementTintedSprite(loaded[d.source], d.tint);
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
      }
      function canvasTiming(variants) {
        const warmup = 3, repeats = 11;
        const contexts = variants.map(() => canvasContext());
        const times = variants.map(() => []);
        for (let rep = 0; rep < warmup + repeats; rep++) {
          for (let column = 0; column < variants.length; column++) {
            const index = (column + rep) % variants.length;
            const ctx = contexts[index];
            ctx.clearRect(0, 0, width, height);
            ctx.getImageData(0, 0, 1, 1);
            const start = performance.now();
            paintDraws(ctx, variants[index]);
            ctx.getImageData(0, 0, 1, 1);
            if (rep >= warmup) times[index].push(performance.now() - start);
          }
        }
        return times.map(samples => samples.sort((a, b) => a - b)[Math.floor(repeats / 2)]);
      }
      const comparison = {};
      for (const [id, sample] of frames) {
        const section = document.createElement('section');
        const label = document.createElement('h2');
        label.textContent = [sample.view.label && sample.view.label !== id ? `${sample.view.label} (${id})` : id,
          nodes[sample.node].name,
          `${(sample.tick / 60).toFixed(1)}秒`].join(' ／ ');
        const grid = document.createElement('div');
        grid.className = 'profiles';
        section.append(label);
        const {falseMoon, flower, move, narwhal, narwhalStage, primal} = sample.view;
        const flowerText = flower && 'inside' in flower ? raidenFlowerText(flower, move) : '';
        const journeyText = narwhal ? narwhalJourneyText(narwhal, narwhalStage) : '';
        const primalText = primal ? primalTrialText(primal) : '';
        const falseMoonText = falseMoon ? falseMoonEncounterText(falseMoon) : '';
        if (flowerText || journeyText || primalText || falseMoonText) {
          const status = document.createElement('p');
          status.className = 'mechanic';
          status.textContent = flowerText || journeyText || primalText || falseMoonText;
          section.append(status);
        }
        section.append(grid);
        root.append(section);
        const frame = {camera:sample.camera, platforms:sample.platforms, story:{active:true, node:sample.node},
          campaign:{zone:'story:' + sample.node}, storyGraph:{nodes:[nodes[sample.node]]}};
        await loadScenery(frame);
        const original = {draws:sample.png, rectBatches:[]};
        const variants = Object.entries(sample.profiles);
        const sprite = paint(grid, '元のドット絵', frame, original);
        const [originalMs, ...variantTimes] = canvasTiming([original, ...variants.map(([,variant]) => variant.packed)]);
        const profiles = {};
        for (const [index, [key, variant]] of variants.entries()) {
          const packed = paint(grid, key, frame, variant.packed);
          let differentPixels = 0, rgbAbsoluteError = 0;
          for (let i = 0; i < sprite.length; i += 4) {
            const error = Math.abs(sprite[i] - packed[i]) + Math.abs(sprite[i+1] - packed[i+1])
              + Math.abs(sprite[i+2] - packed[i+2]);
            if (error || sprite[i+3] !== packed[i+3]) differentPixels++;
            rgbAbsoluteError += error;
          }
          profiles[key] = {differentPixels, rgbAbsoluteError, unpackedCommands:variant.unpackedCount,
            packedCommands:variant.packed.draws.length, unpackedBytes:variant.unpackedBytes,
            packedBytes:variant.packedBytes, combatCanvasMs:variantTimes[index]};
        }
        comparison[id] = {tick:sample.tick, originalCombatCanvasMs:originalMs, profiles,
          ...(flowerText && {flowerText}), ...(journeyText && {journeyText}),
          ...(primalText && {primalText}), ...(falseMoonText && {falseMoonText})};
      }
      return comparison;
    }, {frames, nodes, title:label});
    assert.deepEqual(errors, []);
    const image = caseId + '.png';
    await page.locator('#comparison').screenshot({path:path.join(output, image)});
    result[caseId] = {image, frames:rendered};
    const safeLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    gallery.push(`<li><a href="${image}">${safeLabel}（${frames.length}場面）</a></li>`);
    await page.close();
    console.log(caseId, frames.length, 'scenes with three render profiles');
  }
  await fs.writeFile(path.join(output, 'weekly-frame-comparison.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'browser-version.txt'), version + '\n');
  await fs.writeFile(path.join(output, 'index.html'), `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>週ボスの描画比較</title>
<style>
 body{max-width:44rem;margin:3rem auto;padding:0 1.25rem;background:#222e37;color:#edf4eb;font:1rem/1.7 system-ui,sans-serif}
 a{color:#b8dfd4}li{margin:.6rem 0}
</style>
<h1>週ボスの描画比較</h1>
<p>各行に同じ再戦場面を並べています。左から元のドット絵、中間画質 h48c32、軽量版 h32c16 です。</p>
<ul>${gallery.join('\n')}</ul></html>\n`);
} finally {
  await browser.close();
}
