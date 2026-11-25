// Sample the actual displayed canvases, including their current camera and sprite settings.
export function setupSceneryDetail(liveView, query) {
  const detail = document.getElementById('sceneryDetail');
  const x = document.getElementById('detailX');
  const y = document.getElementById('detailY');
  const sources = [...document.querySelectorAll('main .detail-source')];
  const width = 80, height = 45;
  const link = document.getElementById('detailLink');
  link.hidden = !liveView;
  for (const [param, slider] of [['sampleX',x],['sampleY',y]]) {
    const value = query.get(param);
    if (value !== null && /^\d+$/.test(value)) slider.value = value;
  }
  if (location.hash === '#sceneryDetail') detail.open = true;

  function draw() {
    if (detail.open && liveView) {
      const params = new URLSearchParams({placements:'live', sampleX:x.value, sampleY:y.value});
      for (const [param,id] of [['node','node'],['tier','backgroundTier'],['camera','camera'],['profile','profile']]) {
        params.set(param, document.getElementById(id).value);
      }
      if (document.getElementById('matchSpritePng').checked) params.set('compare','background');
      if (!document.getElementById('decodedBackground').checked) params.set('background','original');
      link.href = '?' + params + '#sceneryDetail';
    }
    for (const wrapper of sources) {
      const marker = wrapper.querySelector('.detail-marker');
      marker.hidden = !detail.open;
      if (!detail.open) continue;
      const src = wrapper.querySelector('canvas');
      const dest = document.getElementById(src.id + 'Detail');
      const left = x.valueAsNumber, top = y.valueAsNumber;
      marker.style.left = (100 * left / src.width) + '%';
      marker.style.top = (100 * top / src.height) + '%';
      const ctx = dest.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, left, top, width, height, 0, 0, dest.width, dest.height);
    }
  }
  for (const wrapper of sources) {
    const src = wrapper.querySelector('canvas');
    src.addEventListener('click', event => {
      if (!detail.open) return;
      event.stopImmediatePropagation();
      const bounds = src.getBoundingClientRect();
      // The canvas border is outside the bitmap.
      const px = (event.clientX - bounds.left - src.clientLeft) * src.width / src.clientWidth;
      const py = (event.clientY - bounds.top - src.clientTop) * src.height / src.clientHeight;
      x.valueAsNumber = Math.round(px - width / 2);
      y.valueAsNumber = Math.round(py - height / 2);
      draw();
    }, true);
  }
  x.addEventListener('input', draw);
  y.addEventListener('input', draw);
  detail.addEventListener('toggle', draw);
  return draw;
}
