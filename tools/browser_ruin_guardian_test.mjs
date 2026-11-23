import assert from 'node:assert/strict';

export async function observeRuinAttacks(page, expected) {
  await page.evaluate(expected=>{
    document.activeElement.blur();
    const held = new Set();
    const moves = new Set();
    const recovered = new Set();
    const started = window.lab.frame.t;
    window.ruinTrial = null;
    function hold(code, on) {
      if (held.has(code)===on) return;
      if (on) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    function update() {
      const f = window.lab.frame;
      const b = f.fieldBoss;
      const a = f.actors.find(actor=>actor.id===f.active);
      if (!b || f.t-started>23 || expected.every(move=>recovered.has(move))) {
        for (const code of [...held]) hold(code,false);
        window.ruinTrial = {moves:[...moves],recovered:[...recovered],alive:a.hp>0,returns:f.returns};
        return;
      }
      const zones = Object.values(b.zones??{});
      if (zones.length) moves.add(b.move);
      if (b.recovering && moves.has(b.move)) recovered.add(b.move);
      const choices = [b.x-9,b.x+9,b.x-110,b.x+110];
      for (const zone of zones) choices.push(zone.left-30,zone.right+30);
      const safe = choices.filter(x=>zones.every(zone=>x<zone.left-16 || x>zone.right+16));
      const distance = x=>Math.abs(a.x-x)+0.8*Math.abs(b.x-x);
      safe.sort((a,b)=>distance(a)-distance(b));
      const dx = (safe[0]??b.x)-a.x;
      hold('KeyA',dx<-10);
      hold('KeyD',dx>10);
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  },expected);
  await page.waitForFunction(()=>window.ruinTrial,undefined,{timeout:35000});
  const result = await page.evaluate(()=>window.ruinTrial);
  assert.deepEqual(result.moves.toSorted(),expected.toSorted());
  assert.deepEqual(result.recovered.toSorted(),expected.toSorted());
  assert.ok(result.alive&&!result.returns,JSON.stringify(result));
  return result;
}
