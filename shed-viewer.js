(() => {
  'use strict';

  const modelUrl = new URL('media/shed-example.json', document.currentScript?.src || document.baseURI);
  const featuredMark = 'SH-027';
  const presets = {
    iso: [0.86, 0.46],
    plan: [0, Math.PI / 2],
    end: [Math.PI / 2, 0]
  };
  const colours = {
    frame: [211, 226, 237],
    secondary: [161, 183, 198],
    bracing: [78, 203, 181],
    highlight: [255, 156, 78]
  };
  const background = [18, 34, 53];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const plus = (a, b) => a.map((v, i) => v + b[i]);
  const minus = (a, b) => a.map((v, i) => v - b[i]);
  const times = (a, n) => a.map(v => v * n);
  const unit = a => times(a, 1 / Math.hypot(...a));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const light = unit([-0.65, 0.75, 0.14]);

  // A folded sheet is drawn as a series of long, flat faces. Its overall
  // depth and width come from the member in this example, in millimetres.
  const folds = {
    frame: [[0.5, 0.34], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [0.5, -0.34]],
    secondary: [[-0.5, -0.5], [-0.29, -0.5], [-0.19, 0.5], [0.19, 0.5], [0.29, -0.5], [0.5, -0.5]],
    bracing: [[-0.5, 0], [0.5, 0]]
  };

  function makePiece(member, dims) {
    const { a, b, role } = member;
    if (![a, b].every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
        || !Math.hypot(...minus(b, a)) || !member.id || !role || !member.profile
        || member.sizeMm?.length !== 2 || !member.sizeMm.every(n => Number.isFinite(n) && n > 0)) {
      throw new Error('Incomplete member');
    }
    const axis = unit(minus(b, a));
    const layer = role.includes('bracing') ? 'bracing'
      : /purlin|girt/.test(role) ? 'secondary' : 'frame';
    const [sectionDepth, sectionWidth] = member.sizeMm.map(v => v / 1000);
    let normal;
    if (layer === 'frame') {
      normal = role === 'rafter' ? unit([-axis[1], axis[0], 0]) : [1, 0, 0];
    } else if (/roof|eave/.test(role)) {
      const slope = 2 * (dims.ridgeM - dims.eavesM) / dims.widthM;
      normal = unit([a[0] + b[0] < dims.widthM ? -slope : slope, 1, 0]);
    } else if (role === 'end-wall girt') {
      normal = [0, 0, a[2] === 0 ? -1 : 1];
    } else {
      normal = [a[0] === 0 ? -1 : 1, 0, 0];
    }
    const side = layer === 'frame' ? [0, 0, 1] : unit(cross(axis, normal));
    const width = layer === 'bracing' ? sectionDepth : sectionWidth;
    const height = layer === 'bracing' ? sectionWidth : sectionDepth;
    const offsets = folds[layer].map(([u, v]) =>
      plus(times(side, u * width), times(normal, v * height)));
    const faces = offsets.slice(1).map((to, index) => {
      const from = offsets[index];
      return { from, to, normal: unit(cross(axis, minus(to, from))) };
    });
    const placement = layer === 'secondary' ? times(normal, height / 2) : [0, 0, 0];
    return {
      ...member, a: plus(a, placement), b: plus(b, placement), layer, faces,
      slices: Math.ceil(Math.hypot(...minus(b, a)) / 1.5)
    };
  }

  function cameraFor(width, height, yaw, pitch, dims) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const right = [-sy, 0, cy], up = [cy * sp, cp, sy * sp], eye = [-cy * cp, sp, -sy * cp];
    const outline = [];
    for (const z of [0, dims.lengthM]) {
      for (const [x, y] of [[0, 0], [0, dims.eavesM], [dims.widthM / 2, dims.ridgeM],
        [dims.widthM, dims.eavesM], [dims.widthM, 0]]) {
        outline.push([x, y, z]);
      }
    }
    const xs = outline.map(p => dot(p, right));
    const ys = outline.map(p => -dot(p, up));
    const zs = outline.map(p => dot(p, eye));
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padX = clamp(width * 0.043, 21, 36);
    const padTop = clamp(height * 0.064, 18, 32);
    const padBottom = clamp(height * 0.095, 32, 46);
    const scale = Math.max(0.1, Math.min(
      (width - 2 * padX) / (maxX - minX + 0.28),
      (height - padTop - padBottom) / (maxY - minY + 0.28)
    ));
    const cx = width / 2 - scale * (maxX + minX) / 2;
    const cyScreen = (height + padTop - padBottom) / 2 - scale * (minY + maxY) / 2;
    const offset = p => [scale * dot(p, right), -scale * dot(p, up), dot(p, eye)];
    const project = p => {
      const [x, y, z] = offset(p);
      return [cx + x, cyScreen + y, z];
    };
    return { project, offset, eye, scale, far: Math.min(...zs), depth: Math.max(...zs) - Math.min(...zs) };
  }

  function stroke(ctx, a, b, colour, thickness) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = colour;
    ctx.stroke();
  }

  function drawGround(ctx, width, height, camera, dims, pieces) {
    const bg = ctx.createRadialGradient(width * 0.49, height * 0.47, 0,
      width * 0.49, height * 0.47, Math.max(width, height) * 0.66);
    bg.addColorStop(0, '#1c3145');
    bg.addColorStop(1, '#122235');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    const project = camera.project;
    function gridLine(a, b, major) {
      const p = project(a), q = project(b);
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1) return;
      const ink = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
      const colour = major ? 'rgba(129,157,177,0.26)' : 'rgba(129,157,177,0.13)';
      ink.addColorStop(0, 'rgba(129,157,177,0)');
      ink.addColorStop(0.18, colour);
      ink.addColorStop(0.82, colour);
      ink.addColorStop(1, 'rgba(129,157,177,0)');
      stroke(ctx, p, q, ink, major ? 0.85 : 0.65);
    }
    if (camera.eye[1] < 0.04) {
      stroke(ctx, [0, project([0, 0, 0])[1]], [width, project([0, 0, 0])[1]], '#344b5c', 1);
      return;
    }
    for (let x = -5; x <= dims.widthM + 5; x++) {
      gridLine([x, 0, -6], [x, 0, dims.lengthM + 6], x % 5 === 0);
    }
    for (let z = -6; z <= dims.lengthM + 6; z++) {
      gridLine([-5, 0, z], [dims.widthM + 5, 0, z], z % 5 === 0);
    }
    if (camera.eye[1] > 0.97) return;
    const shadow = p => project([p[0] + 0.34 * p[1], 0, p[2] + 0.25 * p[1]]);
    for (const piece of pieces) {
      if (piece.layer === 'frame') {
        stroke(ctx, shadow(piece.a), shadow(piece.b), 'rgba(6,16,26,0.31)', Math.max(2, camera.scale * 0.13));
      }
    }
  }

  function tint(colour, amount) {
    return 'rgb(' + colour.map((v, i) => Math.round(background[i] + (v - background[i]) * amount)).join(',') + ')';
  }

  function drawSteel(ctx, pieces, camera, highlight) {
    const strips = [], hits = [];
    for (const piece of pieces) {
      const a = camera.project(piece.a), b = camera.project(piece.b);
      const selected = piece.id === highlight;
      const base = selected ? colours.highlight : colours[piece.layer];
      const distance = clamp(((a[2] + b[2]) / 2 - camera.far) / camera.depth, 0, 1);
      const exposure = (piece.layer === 'secondary' && !selected ? 0.75 : 0.84) + 0.16 * distance;
      const surfaces = piece.faces.map(face => {
        const from = camera.offset(face.from), to = camera.offset(face.to);
        const lightSide = dot(face.normal, camera.eye) < 0 ? -1 : 1;
        const sun = Math.max(0, lightSide * dot(face.normal, light));
        return {
          from, to, depth: from[2] + to[2],
          fill: tint(base, exposure * (0.66 + 0.34 * sun))
        };
      }).sort((first, second) => first.depth - second.depth);
      const edge = tint(base, exposure * (selected ? 1.1 : 0.92));
      const edgeWidth = selected ? 1.0 : piece.layer === 'bracing' ? 0.78 : 0.38;
      const inc = times(minus(b, a), 1 / piece.slices);
      for (let i = 0; i < piece.slices; i++) {
        const start = plus(a, times(inc, i));
        const end = plus(start, inc);
        strips.push({
          start, end, surfaces, edge, edgeWidth, depth: (start[2] + end[2]) / 2,
          last: i === piece.slices - 1
        });
      }
      hits.push({ a, b, piece });
    }
    strips.sort((a, b) => a.depth - b.depth);
    for (const strip of strips) {
      const { start, end, surfaces, edge, edgeWidth } = strip;
      // Overlap neighbouring rasterised faces by a fraction of a pixel.
      const run = Math.max(1, Math.hypot(end[0] - start[0], end[1] - start[1]));
      const join = strip.last ? 0 : 0.42 / run;
      const ex = end[0] + (end[0] - start[0]) * join;
      const ey = end[1] + (end[1] - start[1]) * join;
      for (const { from, to, fill } of surfaces) {
        ctx.beginPath();
        ctx.moveTo(start[0] + from[0], start[1] + from[1]);
        ctx.lineTo(ex + from[0], ey + from[1]);
        ctx.lineTo(ex + to[0], ey + to[1]);
        ctx.lineTo(start[0] + to[0], start[1] + to[1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        stroke(ctx, [start[0] + from[0], start[1] + from[1]], [ex + from[0], ey + from[1]], edge, edgeWidth);
      }
    }
    return hits;
  }

  function drawDimension(ctx, a, b, centre, text, margin, small) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 27) return;
    const tx = dx / length, ty = dy / length;
    let nx = -ty, ny = tx;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * (mx - centre[0]) + ny * (my - centre[1]) < 0) { nx *= -1; ny *= -1; }
    const shift = (p, amount) => [p[0] + nx * amount, p[1] + ny * amount];
    const da = shift(a, margin), db = shift(b, margin);
    for (const p of [a, b]) {
      stroke(ctx, shift(p, 3), shift(p, margin + 3), '#577285', 0.65);
      const [x, y] = shift(p, margin);
      stroke(ctx, [x - 2 * (tx + nx), y - 2 * (ty + ny)], [x + 2 * (tx + nx), y + 2 * (ty + ny)], '#9db6bf', 0.8);
    }
    stroke(ctx, da, db, '#77969e', 0.7);
    ctx.save();
    ctx.translate(mx + nx * (margin + 8), my + ny * (margin + 8));
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    ctx.rotate(angle);
    ctx.fillStyle = '#bed2d7';
    ctx.font = (small ? '9' : '10') + 'px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function dimensions(ctx, camera, dims, view, width) {
    const { project, eye } = camera;
    const { widthM, lengthM, eavesM } = dims;
    const nearX = eye[0] <= 0 ? 0 : widthM, nearZ = eye[2] <= 0 ? 0 : lengthM;
    const centre = project([widthM / 2, eavesM / 2, lengthM / 2]);
    const small = width < 440;
    const dimension = (a, b, text, margin = small ? 12 : 16) =>
      drawDimension(ctx, project(a), project(b), centre, text, margin, small);
    dimension([0, 0, nearZ], [widthM, 0, nearZ], widthM + ' m');
    if (view === 'end') {
      dimension([nearX, 0, nearZ], [nearX, eavesM, nearZ], eavesM + ' m');
    } else if (view === 'plan' && width >= 440) {
      let station = 0;
      for (const bay of dims.baysM) {
        dimension([nearX, 0, station], [nearX, 0, station + bay], bay + ' m', 9);
        station += bay;
      }
      dimension([nearX, 0, 0], [nearX, 0, lengthM], lengthM + ' m', 29);
    } else {
      dimension([nearX, 0, 0], [nearX, 0, lengthM], lengthM + ' m');
    }
  }

  function memberLabel(ctx, hit, width, height) {
    if (!hit) return null;
    const a = hit.a, b = hit.b;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const text = hit.piece.id, small = width < 440;
    ctx.font = (small ? '9' : '10') + 'px ui-monospace, Consolas, monospace';
    const boxWidth = Math.ceil(ctx.measureText(text).width + 13);
    const boxHeight = small ? 17 : 19;
    const goLeft = mx < width / 2;
    const x = clamp(goLeft ? mx - boxWidth - 19 : mx + 19, 5, width - boxWidth - 5);
    const y = clamp(my - (small ? 31 : 39), 5, height - boxHeight - 5);
    const edge = goLeft ? x + boxWidth : x;
    stroke(ctx, [mx, my], [edge, y + boxHeight / 2], '#e7a166', 0.9);
    ctx.fillStyle = '#162638';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = '#93684c';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffc394';
    ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2 + 0.5);
    ctx.beginPath();
    ctx.arc(mx, my, small ? 1.8 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc394';
    ctx.fill();
    return { x, y, w: boxWidth, h: boxHeight, piece: hit.piece };
  }

  function start(root, model) {
    const canvas = root.querySelector('[data-shed-canvas]');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const dims = model.dimensions;
    if (!Array.isArray(model.members) || !model.members.length || !Array.isArray(dims?.baysM)
        || ![dims.widthM, dims.lengthM, dims.eavesM, dims.ridgeM].every(n => Number.isFinite(n) && n > 0)) {
      throw new Error('Incomplete sample');
    }
    const pieces = model.members.map(m => makePiece(m, dims));
    const byMark = new Map(pieces.map(p => [p.id, p]));
    const viewButtons = root.querySelectorAll('[data-shed-view]');
    const layerButtons = root.querySelectorAll('[data-shed-layer]');
    const readout = root.querySelector('[data-shed-selection]');
    const layers = { frame: true, secondary: true, bracing: true };
    let view = 'iso', [yaw, pitch] = presets.iso;
    let selected = null, pointer = null, scheduled = false, hits = [], label = null;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

    function draw() {
      scheduled = false;
      const { width, height } = canvas.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const density = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.round(width * density), h = Math.round(height * density);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
      if (view === 'iso') {
        const wide = clamp((width / height - 1.50) / 0.65, 0, 1);
        yaw = presets.iso[0] - wide * 0.25;
        pitch = presets.iso[1] - wide * 0.17;
      }
      const camera = cameraFor(width, height, yaw, pitch, dims);
      const visible = pieces.filter(piece => layers[piece.layer]);
      const highlight = selected?.id || featuredMark;
      drawGround(ctx, width, height, camera, dims, visible);
      hits = drawSteel(ctx, visible, camera, highlight);
      dimensions(ctx, camera, dims, view, width);
      const target = hits.find(item => item.piece.id === highlight);
      label = memberLabel(ctx, target, width, height);
      if (root.dataset.ready !== 'true') {
        root.dataset.ready = 'true';
        syncControls();
      }
    }

    function redraw() {
      if (!scheduled) { scheduled = true; requestAnimationFrame(draw); }
    }

    function syncControls() {
      for (const button of viewButtons) {
        button.setAttribute('aria-pressed', String(view === button.dataset.shedView));
      }
      for (const button of layerButtons) {
        button.setAttribute('aria-pressed', String(layers[button.dataset.shedLayer]));
      }
      let summary;
      if (selected) {
        const name = selected.role[0].toUpperCase() + selected.role.slice(1);
        summary = [selected.id, name, selected.profile].join(' · ');
      } else {
        const count = pieces.filter(piece => layers[piece.layer]).length;
        summary = count === pieces.length
          ? (dims.baysM.length + 1) + ' portal frames · ' + count + ' members'
          : count + ' of ' + pieces.length + ' members visible';
      }
      if (readout.textContent !== summary) readout.textContent = summary;
    }

    function update() {
      syncControls();
      redraw();
    }

    function chooseView(name) {
      view = name;
      [yaw, pitch] = presets[name];
      update();
    }

    function select(piece, reveal = false) {
      selected = piece;
      if (piece) layers[piece.layer] = true;
      if (reveal && view !== 'plan' && view !== 'iso') chooseView('iso');
      else update();
    }

    function stepMember(step) {
      const visible = pieces.filter(piece => layers[piece.layer]);
      if (!visible.length) return;
      let index = visible.indexOf(selected);
      if (index === -1 && step < 0) index = 0;
      select(visible[(index + step + visible.length) % visible.length]);
    }

    function reset() {
      for (const layer of Object.keys(layers)) layers[layer] = true;
      selected = null;
      chooseView('iso');
    }

    function orbit(newYaw, newPitch) {
      view = null;
      yaw = newYaw;
      pitch = clamp(newPitch, 0.015, Math.PI / 2);
      update();
    }

    function pick(x, y, radius) {
      if (label && x >= label.x && x <= label.x + label.w && y >= label.y && y <= label.y + label.h) return label.piece;
      let best = null, bestDistance = radius, bestDepth = -Infinity;
      for (const { a, b, piece } of hits) {
        const dx = b[0] - a[0], dy = b[1] - a[1], lengthSq = dx * dx + dy * dy;
        const t = lengthSq ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq, 0, 1) : 0.5;
        const distance = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        const depth = a[2] + t * (b[2] - a[2]);
        if (distance > radius) continue;
        if (!best || distance < bestDistance - 0.85 || (Math.abs(distance - bestDistance) <= 0.85 && depth > bestDepth)) {
          best = piece; bestDistance = distance; bestDepth = depth;
        }
      }
      return best;
    }

    for (const button of viewButtons) button.addEventListener('click', () => chooseView(button.dataset.shedView));
    for (const button of layerButtons) button.addEventListener('click', () => {
      const layer = button.dataset.shedLayer;
      layers[layer] = !layers[layer];
      if (selected?.layer === layer && !layers[layer]) selected = null;
      update();
    });
    root.querySelector('[data-shed-reset]').addEventListener('click', reset);
    for (const button of root.querySelectorAll('[data-shed-pick]')) {
      button.addEventListener('click', () => {
        const piece = byMark.get(button.dataset.shedPick);
        if (piece) select(piece, true);
      });
    }
    canvas.addEventListener('pointerdown', e => {
      if (pointer || !e.isPrimary || e.button !== 0) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw, pitch, dragged: false };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    function underPointer(e) {
      const box = canvas.getBoundingClientRect();
      return pick(e.clientX - box.left, e.clientY - box.top, e.pointerType === 'touch' ? 11 : 7);
    }
    canvas.addEventListener('pointermove', e => {
      if (!pointer) {
        canvas.style.cursor = underPointer(e) ? 'pointer' : 'grab';
        return;
      }
      if (e.pointerId !== pointer.id) return;
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      if (!pointer.dragged && Math.hypot(dx, dy) < 4) return;
      pointer.dragged = true;
      orbit(pointer.yaw + dx * 0.008, pointer.pitch + dy * 0.007);
    });
    canvas.addEventListener('pointerup', e => {
      if (pointer?.id !== e.pointerId) return;
      if (!pointer.dragged) select(underPointer(e));
      pointer = null;
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('lostpointercapture', () => { pointer = null; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('keydown', e => {
      const steps = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, 0.09], ArrowDown: [0, -0.09] };
      if (steps[e.key]) {
        e.preventDefault();
        orbit(yaw + steps[e.key][0], pitch + steps[e.key][1]);
      } else if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        stepMember(e.key === 'PageDown' ? 1 : -1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        reset();
      }
    });
    if (window.ResizeObserver) new ResizeObserver(redraw).observe(canvas);
    window.addEventListener('resize', redraw);
    draw();
  }

  async function initialise(root) {
    try {
      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error('Sample unavailable');
      start(root, await response.json());
    } catch {
      for (const button of root.querySelectorAll('[data-shed-view], [data-shed-layer], [data-shed-reset], [data-shed-pick]')) {
        button.disabled = true;
      }
    }
  }
  function boot() {
    for (const root of document.querySelectorAll('[data-shed-viewer]')) initialise(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
