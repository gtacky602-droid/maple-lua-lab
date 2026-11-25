// Repeating pixel tiles for the lab's collidable foreground. The platform top is local y=0.
const patterns = new WeakMap();

function surfaceTile(material, ground) {
  const tile = document.createElement('canvas');
  tile.width = 64;
  tile.height = ground ? 60 : 20;
  const pen = tile.getContext('2d');
  function rect(color, x, y, w, h) {
    pen.fillStyle = color;
    pen.fillRect(x, y, w, h);
  }
  if (material === 'lacquer') {
    rect('#402527', 0, 0, 64, tile.height);
    for (let y = 3; y < tile.height; y += 13) {
      rect('#623231', 0, y, 64, 9);
      rect('#332029', y % 2 ? 12 : 43, y, 2, 10);
      rect('#7d4838', 24, y + 2, 20, 1);
    }
    rect('#ba8451', 0, 0, 64, 2);
  } else if (material === 'violetSlate') {
    rect('#302343', 0, 0, 64, tile.height);
    rect('#73598b', 0, 0, 64, 3);
    rect('#49335c', 0, 3, 64, 6);
    for (let i = 0; i < 4; i++) {
      rect('#594167', 13 + i * 3, 7 + i * 3, 4, 3);
      rect('#402e52', 48 - i * 2, 10 + i * 2, 3, 2);
    }
  } else if (material === 'snow') {
    rect('#74889d', 0, 0, 64, tile.height);
    rect('#d3e6e6', 0, 0, 64, 8);
    rect('#f2f6e9', 0, 0, 64, 3);
    for (const x of [2, 27, 46]) {
      rect('#bfd5df', x, 6, 13, 4);
      rect('#a6c1d0', x + 4, 10, 8, 3);
      rect('#62768e', x + 10, 17, 6, 2);
    }
  } else if (material === 'ice') {
    rect('#50778e', 0, 0, 64, tile.height);
    rect('#85bdcb', 0, 0, 64, 9);
    rect('#d8f3ed', 0, 0, 64, 2);
    for (let i = 0; i < 5; i++) {
      rect('#b1dadf', 9 + i * 3, 2 + i * 2, 4, 2);
      rect('#709faa', 49 - i * 2, 5 + i * 3, 3, 3);
    }
  } else if (material === 'heather') {
    rect('#67435c', 0, 0, 64, tile.height);
    rect('#985585', 0, 0, 64, 7);
    rect('#c482b3', 0, 0, 64, 2);
    for (const x of [3, 21, 49]) {
      rect('#754367', x, 4, 9, 6);
      rect('#af6c99', x + 3, 2, 5, 3);
      rect('#51374e', x + 5, 15, 11, 2);
    }
  } else if (material === 'wetSand') {
    rect('#c59169', 0, 0, 64, tile.height);
    rect('#e4bb8c', 0, 0, 64, 15);
    rect('#a9c9b2', 0, 0, 64, 3);
    rect('#e0f1d9', 6, 1, 19, 2);
    rect('#e7cba0', 36, 5, 12, 2);
    rect('#d5a97d', 20, 12, 23, 2);
    rect('#b88561', 45, 25, 7, 2);
  } else if (material === 'sandstone' || material === 'cavern') {
    const cave = material === 'cavern';
    rect(cave ? '#433842' : '#ad7352', 0, 0, 64, tile.height);
    for (let y = 4; y < tile.height; y += 15) {
      const joint = (y * 5) % 53;
      rect(cave ? '#2b2936' : '#865646', 0, y + 11, 64, 3);
      rect(cave ? '#342d38' : '#92624b', joint, y + 1, 3, 11);
      rect(cave ? '#655052' : '#c68b5d', joint + 3, y, 17, 2);
    }
    rect(cave ? '#725951' : '#e0aa72', 0, 0, 64, 3);
  } else if (material === 'timber') {
    // The gap beneath the boards lets the lake show through the piles.
    rect('#533a31', 0, 0, 64, 10);
    rect('#a47549', 0, 1, 64, 5);
    rect('#deb575', 0, 0, 64, 2);
    for (const x of [4, 35]) {
      rect('#573d33', x, 1, 2, 6);
      rect('#dfab70', x + 4, 4, 13, 1);
    }
    rect('#433737', 0, 10, 64, 4);
    rect('#644938', 9, 13, 8, tile.height - 13);
    rect('#9e7951', 10, 13, 2, tile.height - 13);
  } else {
    const grass = material === 'grass';
    rect(grass ? '#685541' : '#646c66', 0, 0, 64, tile.height);
    for (let y = 6; y < tile.height; y += 11) {
      const joint = (y * 7) % 51;
      rect(grass ? '#594839' : '#424e50', 0, y + 8, 64, 2);
      rect(grass ? '#504337' : '#4c5958', joint, y, 2, 9);
      rect(grass ? '#90714f' : '#87928a', joint + 4, y + 1, 17, 2);
    }
    rect(grass ? '#657c43' : '#909c91', 0, 0, 64, 5);
    rect(grass ? '#a8ba63' : '#c0caba', 0, 0, 64, 2);
    if (grass) {
      rect('#657c43', 6, 4, 14, 3);
      rect('#839c51', 10, 4, 5, 5);
      rect('#8fa858', 41, 2, 12, 4);
    }
  }
  return tile;
}

export function drawScenerySurface(ctx, material, x, platform) {
  let cache = patterns.get(ctx);
  if (!cache) { cache = new Map(); patterns.set(ctx, cache); }
  const ground = platform.y === 480;
  const id = material + (ground ? '-floor' : '-ledge');
  if (!cache.has(id)) cache.set(id, ctx.createPattern(surfaceTile(material, ground), 'repeat-x'));
  ctx.save();
  ctx.translate(Math.round(x), platform.y);
  ctx.fillStyle = cache.get(id);
  ctx.fillRect(0, 0, platform.w, ground ? 60 : 20);
  ctx.restore();
}
