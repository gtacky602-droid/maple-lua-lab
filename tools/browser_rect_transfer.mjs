import assert from 'node:assert/strict';

export async function captureRectTransfer(page, profile, packed, change) {
  const pending = page.waitForResponse(response => {
    if (!response.url().endsWith('/api/frame')) return false;
    const request = response.request().postDataJSON();
    return request?.profile === profile && request.packRectArt === packed;
  });
  await change();
  const response = await pending;
  assert.ok(response.ok());
  assert.equal(response.headers()['content-encoding'], 'gzip');
  const snapshot = await response.json();
  await page.waitForFunction(count => window.lab.frame?.draws.length === count, snapshot.draws.length);
  const raster = await page.locator('#game').evaluate(canvas => canvas.toDataURL());
  return {snapshot, raster, gzipBytes:Number(response.headers()['content-length'])};
}
