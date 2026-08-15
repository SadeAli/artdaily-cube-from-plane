/* ============================================================
   game.js — Cube From Plane. The sheet shows a horizon and ONE
   vertical face of a two-point-perspective box. The player drags
   three corner handles (far-bottom, far-top, top-back) until all
   nine visible edges converge, presses done, and the true cube is
   revealed in the accent with its construction lines to the VPs.
   Three boxes per round; the VPs pull closer each box.
   All scoring/geometry math is pure and lives up top.
   ============================================================ */
(function () {
  'use strict';

  var SLUG = 'cube-from-plane';
  var ITEMS_PER_ROUND = 3;
  var HANDLE_R = 11;    /* drawn radius */
  var HIT_R = 26;       /* grab radius → 52px touch target */
  /* Placement within 1.5% of the face diagonal counts as perfect, so a
     careful hand can genuinely reach 100. Mean error of 30% scores 0. */
  var ERR_TOL = 0.015;
  var ERR_ZERO = 0.30;

  /* ================= pure math (unit-testable) =================
     Points are {x, y}. Box geometry lives in normalized sheet space
     (x, y in 0..1; VPs may fall outside) — the construction is
     affine-invariant, so it stays a valid 2-VP box at any canvas
     size. Scoring runs on pixel distances. */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function lerpPt(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }

  /* y on the line p→vp at a given x (vp.x !== p.x by construction) */
  function yAt(p, vp, x) { return p.y + (vp.y - p.y) * (x - p.x) / (vp.x - p.x); }

  /* intersection of infinite lines a1–a2 and b1–b2 */
  function lineHit(a1, a2, b1, b2) {
    var d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
    if (Math.abs(d) < 1e-9) return lerpPt(a2, b2, 0.5); /* unreachable with distinct VPs */
    var s = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
    return { x: a1.x + s * (a2.x - a1.x), y: a1.y + s * (a2.y - a1.y) };
  }

  /* Build a 2-VP box from params: hy horizon y, vlx/vrx VP x, fx front
     vertical edge x, fyb its bottom y, h its height, tL/tR fraction of
     the way from the front corner to each VP. Verticals stay vertical.
     Corners: F front, L far-left, R far-right, B back; b bottom, t top. */
  function makeBox(p) {
    var vpl = { x: p.vlx, y: p.hy };
    var vpr = { x: p.vrx, y: p.hy };
    var Fb = { x: p.fx, y: p.fyb };
    var Ft = { x: p.fx, y: p.fyb - p.h };
    var Lb = lerpPt(Fb, vpl, p.tL);
    var Lt = { x: Lb.x, y: yAt(Ft, vpl, Lb.x) };
    var Rb = lerpPt(Fb, vpr, p.tR);
    var Rt = { x: Rb.x, y: yAt(Ft, vpr, Rb.x) };
    var Bt = lineHit(Lt, vpr, Rt, vpl);
    return { hy: p.hy, vpl: vpl, vpr: vpr, Fb: Fb, Ft: Ft, Lb: Lb, Lt: Lt, Rb: Rb, Rt: Rt, Bt: Bt };
  }

  /* Random params for item i (0..2). The right VP pulls in hard on the
     last item, so foreshortening ramps within the round. rnd injected. */
  function genParams(i, rnd) {
    var hy = rnd(0.22, 0.32);
    var fyb = rnd(0.82, 0.92);
    var h = Math.min(rnd(0.34, 0.46), fyb - hy - 0.14);
    var vlx, vrx, fx, tL, tR;
    if (i === 0) {
      vlx = rnd(-1.3, -0.8); vrx = rnd(1.8, 2.3);
      fx = rnd(0.44, 0.56); tL = rnd(0.16, 0.24); tR = rnd(0.14, 0.22);
    } else if (i === 1) {
      vlx = rnd(-0.9, -0.5); vrx = rnd(1.35, 1.75);
      fx = rnd(0.42, 0.56); tL = rnd(0.18, 0.26); tR = rnd(0.16, 0.24);
    } else {
      vlx = rnd(-1.8, -1.2); vrx = rnd(0.88, 1.05);
      fx = rnd(0.34, 0.46); tL = rnd(0.13, 0.19); tR = rnd(0.30, 0.44);
    }
    /* modest box: cap the depths so every corner stays on the sheet */
    tL = Math.min(tL, (fx - 0.06) / (fx - vlx));
    tR = Math.min(tR, (0.94 - fx) / (vrx - fx));
    return { hy: hy, vlx: vlx, vrx: vrx, fx: fx, fyb: fyb, h: h, tL: tL, tR: tR };
  }

  /* Spec: err_i = dist(placed, true) / faceDiagonal (with a small
     perfect-zone); item = 100 · clamp(1 − mean(err)/0.30, 0, 1). */
  function itemScore(dists, faceDiag) {
    if (!dists.length || !(faceDiag > 0)) return 0; /* degenerate → worst, never NaN */
    var sum = 0;
    for (var i = 0; i < dists.length; i++) sum += Math.max(0, dists[i] / faceDiag - ERR_TOL);
    return 100 * clamp(1 - (sum / dists.length) / ERR_ZERO, 0, 1);
  }

  function roundScore(itemScores) {
    if (!itemScores.length) return 0;
    var sum = 0;
    for (var i = 0; i < itemScores.length; i++) sum += itemScores[i];
    return Math.round(sum / itemScores.length);
  }

  /* Ghost starts: plausible-but-wrong, 13–20% of the face diagonal off
     the truth, kept on-sheet and un-crowded. Pixel space, rnd injected. */
  function ghostSpots(truthPx, diagPx, w, hgt, rnd) {
    var out = [], i, g, tries, a, m, j, crowded;
    for (i = 0; i < truthPx.length; i++) {
      g = null;
      for (tries = 0; tries < 24; tries++) {
        a = rnd(0, Math.PI * 2);
        m = rnd(0.13, 0.20) * diagPx;
        g = {
          x: clamp(truthPx[i].x + Math.cos(a) * m, 16, w - 16),
          y: clamp(truthPx[i].y + Math.sin(a) * m, 16, hgt - 16),
        };
        if (dist(g, truthPx[i]) < 0.08 * diagPx) continue; /* clamped too close to right */
        crowded = false;
        for (j = 0; j < out.length; j++) if (dist(g, out[j]) < 44) crowded = true;
        if (!crowded) break;
      }
      out.push(g);
    }
    return out;
  }

  /* ================= canvas / DOM ================= */

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var hint = document.getElementById('hint');
  var toast = document.getElementById('toast');
  var hudRound = document.getElementById('hudRound');
  var hudScore = document.getElementById('hudScore');
  var hudBest = document.getElementById('hudBest');
  var btnDone = document.getElementById('btnDone');

  ArtDaily.init({ slug: SLUG });

  /* ---- theme-aware inks (re-read on every repaint) ---- */
  function inks() {
    var cs = getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue('--ink').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      accent: cs.getPropertyValue('--game-accent').trim() || cs.getPropertyValue('--mint').trim(),
    };
  }

  /* ---- crisp canvas at any devicePixelRatio; height tracks width ---- */
  var W = 0, H = 0;
  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.round(W * 0.62);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function px(pt) { return { x: pt.x * W, y: pt.y * H }; }

  /* ---- round state ---- */
  var round = 0, idx = 0, items = [], scores = [], roundOver = true;
  var activeHandle = 0;

  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  function newItem(i) {
    var box = makeBox(genParams(i, rnd));
    var truthPx = [px(box.Rb), px(box.Rt), px(box.Bt)];
    var diagPx = dist(px(box.Fb), px(box.Lt));
    var ghosts = ghostSpots(truthPx, diagPx, W, H, rnd);
    return {
      box: box,
      /* handle order: 0 far-bottom (Rb), 1 far-top (Rt), 2 top-back (Bt) */
      place: ghosts.map(function (g) { return { x: g.x / W, y: g.y / H }; }),
      phase: 'edit',
    };
  }

  function newRound() {
    round += 1;
    idx = 0;
    scores = [];
    roundOver = false;
    activeHandle = 0;
    items = [newItem(0), newItem(1), newItem(2)];
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    btnDone.hidden = false;
    btnDone.textContent = 'done ✓';
    hint.textContent = 'box 1/' + ITEMS_PER_ROUND + ' — drag the 3 dots until every edge converges, then press done.';
    draw();
  }

  /* ---- painting (canvas bg stays clear so the CSS dot-grid shows) ---- */
  function seg(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    var item = items[idx];
    if (!item) return;
    var b = item.box;
    var vpl = px(b.vpl), vpr = px(b.vpr);
    var Fb = px(b.Fb), Ft = px(b.Ft), Lb = px(b.Lb), Lt = px(b.Lt);
    var tRb = px(b.Rb), tRt = px(b.Rt), tBt = px(b.Bt);
    var pRb = px(item.place[0]), pRt = px(item.place[1]), pBt = px(item.place[2]);
    var hyPx = b.hy * H;
    var reveal = item.phase === 'reveal';

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* horizon */
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    seg({ x: 0, y: hyPx }, { x: W, y: hyPx });
    ctx.setLineDash([]);
    ctx.fillStyle = c.muted;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('eye level', W - 8, hyPx - 5);
    ctx.textAlign = 'left';

    if (reveal) {
      /* construction lines: each converging edge extended to its VP */
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.25;
      seg(Lb, vpl); seg(Lt, vpl);
      seg(tRb, vpr); seg(tRt, vpr);
      seg(tBt, vpr); seg(tBt, vpl);
      ctx.globalAlpha = 1;
      [vpl, vpr].forEach(function (v) {
        if (v.x < 6 || v.x > W - 6) return;
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.5;
        seg({ x: v.x - 5, y: v.y - 5 }, { x: v.x + 5, y: v.y + 5 });
        seg({ x: v.x - 5, y: v.y + 5 }, { x: v.x + 5, y: v.y - 5 });
      });
    }

    /* the given front-left face, lightly shaded */
    ctx.beginPath();
    ctx.moveTo(Fb.x, Fb.y); ctx.lineTo(Ft.x, Ft.y); ctx.lineTo(Lt.x, Lt.y); ctx.lineTo(Lb.x, Lb.y);
    ctx.closePath();
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.stroke();

    /* the player's five edges (muted during reveal so the truth pops) */
    ctx.strokeStyle = reveal ? c.muted : c.ink;
    ctx.globalAlpha = reveal ? 0.7 : 0.85;
    ctx.lineWidth = 2;
    seg(Fb, pRb); seg(Ft, pRt); seg(pRb, pRt); seg(Lt, pBt); seg(pRt, pBt);
    ctx.globalAlpha = 1;

    if (reveal) {
      /* true cube in the accent + delta whiskers to the placed dots */
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2.5;
      seg(Fb, tRb); seg(Ft, tRt); seg(tRb, tRt); seg(Lt, tBt); seg(tRt, tBt);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      seg(pRb, tRb); seg(pRt, tRt); seg(pBt, tBt);
      ctx.setLineDash([]);
      ctx.fillStyle = c.accent;
      [tRb, tRt, tBt].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      [pRb, pRt, pBt].forEach(function (p, i) {
        ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = c.accent;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = c.ink;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
        if (i === activeHandle) {
          ctx.strokeStyle = c.accent;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_R + 5, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    }
  }

  /* ---- input: drag handles (pointerId-guarded), keyboard nudges ---- */
  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function moveHandle(i, p) {
    var item = items[idx];
    if (!item) return;
    item.place[i] = { x: clamp(p.x, 10, W - 10) / W, y: clamp(p.y, 10, H - 10) / H };
    draw();
  }

  var dragPointer = null, dragIdx = -1;

  canvas.addEventListener('pointerdown', function (ev) {
    var item = items[idx];
    if (roundOver || !item || item.phase !== 'edit' || dragPointer !== null) return;
    ev.preventDefault();
    var p = pointerPos(ev);
    var bestI = -1, bestD = HIT_R, i, d;
    for (i = 0; i < 3; i++) {
      d = dist(p, px(item.place[i]));
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI < 0) return;
    dragPointer = ev.pointerId;
    dragIdx = bestI;
    activeHandle = bestI;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    moveHandle(bestI, p);
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (dragPointer === null || ev.pointerId !== dragPointer) return;
    ev.preventDefault();
    moveHandle(dragIdx, pointerPos(ev));
  });

  function endDrag(ev) {
    if (dragPointer === null || ev.pointerId !== dragPointer) return;
    dragPointer = null;
    dragIdx = -1;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', function (ev) {
    var item = items[idx];
    if (roundOver || !item) return;
    if (ev.key === 'Enter') { ev.preventDefault(); onDone(); return; }
    if (item.phase !== 'edit') return;
    if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
      activeHandle = Number(ev.key) - 1;
      draw();
      return;
    }
    var step = ev.shiftKey ? 1 : 4, dx = 0, dy = 0;
    if (ev.key === 'ArrowLeft') dx = -step;
    else if (ev.key === 'ArrowRight') dx = step;
    else if (ev.key === 'ArrowUp') dy = -step;
    else if (ev.key === 'ArrowDown') dy = step;
    else return;
    ev.preventDefault();
    var cur = px(item.place[activeHandle]);
    moveHandle(activeHandle, { x: cur.x + dx, y: cur.y + dy });
  });

  /* ---- done → score item → reveal → next / finish ---- */
  function onDone() {
    var item = items[idx];
    if (roundOver || !item) return;
    if (item.phase === 'edit') {
      var t = [px(item.box.Rb), px(item.box.Rt), px(item.box.Bt)];
      var p = item.place.map(px);
      var ds = [dist(p[0], t[0]), dist(p[1], t[1]), dist(p[2], t[2])];
      var s = itemScore(ds, dist(px(item.box.Fb), px(item.box.Lt)));
      scores.push(s);
      item.phase = 'reveal';
      if (idx === ITEMS_PER_ROUND - 1) {
        finishRound();
      } else {
        btnDone.textContent = 'next ▸';
        hint.textContent = 'true cube in mint — this box: ' + Math.round(s) + '. press next.';
      }
      draw();
      return;
    }
    idx += 1;
    activeHandle = 0;
    btnDone.textContent = 'done ✓';
    hint.textContent = 'box ' + (idx + 1) + '/' + ITEMS_PER_ROUND + ' — ' +
      (idx === 2 ? 'one VP is close now, watch the plunge. done when it reads true.' : 'drag the 3 dots, then press done.');
    draw();
  }

  function finishRound() {
    roundOver = true;
    btnDone.hidden = true;
    var res = ArtDaily.report(roundScore(scores));
    hudScore.textContent = String(res.score);
    hudBest.textContent = res.best === null ? '–' : String(res.best);
    hint.textContent = 'last box: ' + Math.round(scores[scores.length - 1]) + ' — round done, press “new round” to go again.';
    showToast((res.isNewBest ? 'new best! ' : 'score ') + res.score + ' / 100', res.isNewBest);
  }

  var toastTimer = null;
  function showToast(msg, celebrate) {
    toast.innerHTML = '';
    var s = document.createElement('span');
    s.className = celebrate ? 'toast-accent' : '';
    s.textContent = msg;
    toast.appendChild(s);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  /* ---- chrome wiring ---- */
  btnDone.addEventListener('click', onDone);
  document.getElementById('btnRound').addEventListener('click', newRound);

  var btnHow = document.getElementById('btnHow');
  var howTo = document.getElementById('howTo');
  btnHow.addEventListener('click', function () {
    howTo.hidden = !howTo.hidden;
    btnHow.setAttribute('aria-expanded', String(!howTo.hidden));
  });

  ArtDaily.onTheme(draw);
  /* geometry is stored normalized, so a resize just rescales the sheet */
  window.addEventListener('resize', function () { fitCanvas(); draw(); });

  /* ---- boot ---- */
  fitCanvas();
  var best = ArtDaily.best();
  hudBest.textContent = best === null ? '–' : String(best);
  newRound();
})();
