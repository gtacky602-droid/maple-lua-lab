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
      const subject = document.getElementById('liveSubject').value;
      if (subject) params.set('subject', subject);
      if (document.getElementById('matchSpritePng').checked) params.set('compare','background');
      if (!document.getElementById('decodedBackground').checked) params.set('background','original');
      if (!document.getElementById('lampPreview').hidden) params.set('light',document.getElementById('lampMode').value);
      if (!document.getElementById('sceneryPhaseControl').hidden) params.set('phase',document.getElementById('sceneryPhase').value);
      const gate=document.querySelector('#gatePreview select').selectedOptions[0];
      if(gate?.dataset.to)for(const key of ['to','gateX','gateY'])params.set(key,gate.dataset[key]);
      if(!document.getElementById('fixtureControl').hidden)params.set('fixture',document.getElementById('fixtureState').checked?'open':'closed');
      const marker=document.getElementById('surveyPointNote');
      if(!marker.hidden){
        params.set('quest',marker.dataset.quest);params.set('step',marker.dataset.step);
      }
      link.href = '?' + params + '#sceneryDetail';
    }
    const samples = [];
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
      samples.push(src.getContext('2d').getImageData(left, top, width, height).data);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, left, top, width, height, 0, 0, dest.width, dest.height);
    }
    if (samples.length === 2) {
      const [a,b] = samples;
      let total = 0, changed = 0;
      for (let i = 0; i < a.length; i += 4) {
        const difference = Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
        total += difference;
        if (difference) changed++;
      }
      document.getElementById('sampleDifference').textContent =
        '拡大範囲の平均色差 '+(total/(3*width*height)).toFixed(2)+' / 255（色が変わった画素 '+changed+' / '+(width*height)+'）';
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
