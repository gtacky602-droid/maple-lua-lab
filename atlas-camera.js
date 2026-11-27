const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function atlasCamera(canvas, changed) {
 let scale = MIN_ZOOM, left = 0, top = 0, drag, dragged = false;
 const center = () => ({x:canvas.width / 2,y:canvas.height / 2});
 const project = point => ({x:point.x * scale + left,y:point.y * scale + top});
 const localPoint = event => {
  const box = canvas.getBoundingClientRect();
  return {
   x:(event.clientX - box.left) * canvas.width / box.width,
   y:(event.clientY - box.top) * canvas.height / box.height,
  };
 };

 function position(nextScale, nextLeft, nextTop) {
  scale = nextScale;
  left = clamp(nextLeft, canvas.width * (1 - scale), 0);
  top = clamp(nextTop, canvas.height * (1 - scale), 0);
  changed();
 }

 function zoom(next, at = center()) {
  next = clamp(next, MIN_ZOOM, MAX_ZOOM);
  if (next === scale) return false;
  const ratio = next / scale;
  position(next, at.x - (at.x - left) * ratio, at.y - (at.y - top) * ratio);
  return true;
 }

 function focus(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const next = points.length === 1 ? 2.5 : clamp(
   Math.min((canvas.width - 144) / (maxX - minX), (canvas.height - 112) / (maxY - minY)),
   MIN_ZOOM, MAX_ZOOM,
  );
  position(next, (canvas.width - (minX + maxX) * next) / 2, (canvas.height - (minY + maxY) * next) / 2);
 }

 function panTo(point) {
  const middle = center();
  position(scale, middle.x - point.x * scale, middle.y - point.y * scale);
 }

 function reveal(point) {
  if (scale === MIN_ZOOM) return;
  const target = project(point);
  if (target.x >= 38 && target.x <= canvas.width - 38 && target.y >= 38 && target.y <= canvas.height - 38) return;
  panTo(point);
 }

 canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  dragged = false;
  if (scale === MIN_ZOOM) return;
  drag = {id:event.pointerId,start:localPoint(event),left,top,clientX:event.clientX,clientY:event.clientY};
  canvas.setPointerCapture(event.pointerId);
 });
 canvas.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  if (!dragged && Math.hypot(event.clientX - drag.clientX,event.clientY - drag.clientY) < 5) return;
  dragged = true;
  canvas.classList.add('panning');
  const next = localPoint(event);
  position(scale, drag.left + next.x - drag.start.x, drag.top + next.y - drag.start.y);
 });
 canvas.addEventListener('lostpointercapture', () => {
  drag = undefined;
  canvas.classList.remove('panning');
 });
 canvas.addEventListener('keydown', event => {
  if (scale === MIN_ZOOM) return;
  const delta = {ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]}[event.key];
  if (!delta) return;
  event.preventDefault();
  position(scale, left + delta[0], top + delta[1]);
 });

 return {
  get scale() {return scale;},
  get left() {return left;},
  get top() {return top;},
  get dragged() {return dragged;},
  reset:() => {
   drag = undefined;
   dragged = false;
   canvas.classList.remove('panning');
   position(MIN_ZOOM, 0, 0);
  },
  zoom, focus, panTo, reveal, project, localPoint,
 };
}

export const atlasZoomMax = MAX_ZOOM;
