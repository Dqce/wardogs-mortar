const METERS_PER_UNIT = 100;
const MORTAR_RANGE_M = 684;
const MORTAR_RANGE_U = MORTAR_RANGE_M / METERS_PER_UNIT;
const TILE_SIZE = 256;
const MAX_SCALE = 900;
const MIN_SCALE = 0.6;

const FACTION = {
  Lonestar: { color: "#5fa8d3", icon: "assets/lonestar.webp" },
  Valkyra: { color: "#d86666", icon: "assets/valkyra.webp" },
  Manticore: { color: "#82c596", icon: "assets/manticore.webp" },
};

const DJZET_TILES = "https://djzet.github.io/wardogs-maps/maps";

const MAPS = {
  bakurani: {
    id: "bakurani",
    worldW: 163.81,
    worldH: 163.83,
    maxZoom: 7,
    tileUrl: (z, x, y) =>
      `${DJZET_TILES}/bakurani/tiles/zoom_${z}/${x}_${y}.webp`,
    cors: true,
    spawns: [
      { name: "Valkyra", x: 118.75, y: 70.93 },
      { name: "Manticore", x: 40.09, y: 77.52 },
      { name: "Lonestar", x: 87.46, y: 32.5 },
    ],
    towers: [
      { x: 80.5, y: 69.86 },
      { x: 77.19, y: 70.0 },
      { x: 77.18, y: 73.46 },
      { x: 83.63, y: 72.86 },
      { x: 82.21, y: 68.43 },
    ],
  },
  ozeti: {
    id: "ozeti",
    worldW: 163.81,
    worldH: 163.83,
    maxZoom: 7,
    tileUrl: (z, x, y) =>
      `${DJZET_TILES}/ozeti/tiles/zoom_${z}/${x}_${y}.webp`,
    cors: true,
    spawns: [
      { name: "Valkyra", x: 137.9, y: 67.3 },
      { name: "Manticore", x: 68.4, y: 88.0 },
      { name: "Lonestar", x: 83.7, y: 30.9 },
    ],
    towers: [
      { x: 100.62, y: 67.64 },
      { x: 104.49, y: 63.71 },
      { x: 100.37, y: 59.23 },
      { x: 95.8, y: 62.82 },
    ],
  },
  zestafona: {
    id: "zestafona",
    worldW: 163.81,
    worldH: 163.83,
    maxZoom: 6,
    tileUrl: (z, x, y) => `maps/zestafona/tiles/zoom_${z}/${x}_${y}.webp`,
    cors: true,
    spawns: [
      { name: "Valkyra", x: 39.44, y: 124.94 },
      { name: "Manticore", x: 104.66, y: 115.08 },
      { name: "Lonestar", x: 68.01, y: 66.6 },
    ],
    towers: [
      { x: 70.17, y: 100.17 },
      { x: 68.6, y: 104.15 },
      { x: 72.89, y: 105.07 },
    ],
  },
};

function focusFromTowers(towers) {
  const cx = towers.reduce((s, t) => s + t.x, 0) / towers.length;
  const cy = towers.reduce((s, t) => s + t.y, 0) / towers.length;
  let maxDist = 0;
  for (const t of towers) {
    maxDist = Math.max(maxDist, Math.hypot(t.x - cx, t.y - cy));
  }
  return { cx, cy, view: Math.max(18, (maxDist + 3) * 2.8) };
}

for (const m of Object.values(MAPS)) {
  m.focus = focusFromTowers(m.towers);
}

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const shell = canvas.parentElement;
const distanceEl = document.getElementById("distance");
const rangeEl = document.getElementById("range-status");
const mapHint = document.getElementById("map-hint");
const cursorEl = document.getElementById("cursor-coords");
const mortarX = document.getElementById("mortar-x");
const mortarY = document.getElementById("mortar-y");
const targetX = document.getElementById("target-x");
const targetY = document.getElementById("target-y");

const state = {
  mapId: "zestafona",
  tool: "mortar",
  mortar: null,
  target: null,
  scale: 1,
  ox: 0,
  oy: 0,
  dragging: false,
  moved: false,
  lastX: 0,
  lastY: 0,
  pointers: new Map(),
  pinchDist: 0,
};

const tileCache = new Map();
const iconCache = new Map();

function map() {
  return MAPS[state.mapId];
}

function loadIcon(src) {
  let entry = iconCache.get(src);
  if (entry) return entry;
  entry = { img: new Image(), ready: false };
  entry.img.onload = () => {
    entry.ready = true;
    draw();
  };
  entry.img.src = src;
  iconCache.set(src, entry);
  return entry;
}

loadIcon("assets/tower.webp");
Object.values(FACTION).forEach((f) => loadIcon(f.icon));

function parseCoord(value) {
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatMetres(m) {
  return `${m.toLocaleString("en-US", { maximumFractionDigits: 0 })} m`;
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll(".tool[data-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tool === tool);
  });
  mapHint.textContent =
    tool === "mortar" ? "Click to place mortar" : "Click to place target";
}

function worldToScreen(wx, wy) {
  return {
    x: wx * state.scale + state.ox,
    y: -wy * state.scale + state.oy,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - state.ox) / state.scale,
    y: -(sy - state.oy) / state.scale,
  };
}

function fitMap() {
  const m = map();
  const f = m.focus;
  const sw = canvas._cssW;
  const sh = canvas._cssH;
  state.scale = Math.min(sw / f.view, sh / f.view);
  state.ox = sw / 2 - f.cx * state.scale;
  state.oy = sh / 2 + f.cy * state.scale;
  draw();
}

function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy);
  state.scale = Math.min(Math.max(state.scale * factor, MIN_SCALE), MAX_SCALE);
  const after = worldToScreen(before.x, before.y);
  state.ox += sx - after.x;
  state.oy += sy - after.y;
  draw();
}

function loadTile(z, x, y) {
  const m = map();
  const key = `${m.id}:${z}:${x}:${y}`;
  let entry = tileCache.get(key);
  if (entry) return entry;
  entry = { img: new Image(), ready: false };
  if (m.cors) entry.img.crossOrigin = "anonymous";
  entry.img.onload = () => {
    entry.ready = true;
    draw();
  };
  entry.img.onerror = () => {
    entry.failed = true;
  };
  entry.img.src = m.tileUrl(z, x, y);
  tileCache.set(key, entry);
  return entry;
}

function tileZoom() {
  const m = map();
  const worldPx = m.worldW * state.scale;
  return Math.min(
    m.maxZoom,
    Math.max(0, Math.floor(Math.log2(worldPx / TILE_SIZE)))
  );
}

function drawTiles() {
  const m = map();
  const z = tileZoom();
  const n = 1 << z;
  const tileWorldX = m.worldW / n;
  const tileWorldY = m.worldH / n;
  const cssW = canvas._cssW;
  const cssH = canvas._cssH;

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(cssW, cssH);
  const minWX = Math.min(topLeft.x, bottomRight.x);
  const maxWX = Math.max(topLeft.x, bottomRight.x);
  const minWY = Math.min(topLeft.y, bottomRight.y);
  const maxWY = Math.max(topLeft.y, bottomRight.y);

  const x0 = Math.max(0, Math.floor(minWX / tileWorldX));
  const x1 = Math.min(n - 1, Math.floor(maxWX / tileWorldX));
  const y0 = Math.max(0, Math.floor((m.worldH - maxWY) / tileWorldY));
  const y1 = Math.min(n - 1, Math.floor((m.worldH - minWY) / tileWorldY));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      loadTile(z, tx, ty);

      let lz = z;
      let lx = tx;
      let ly = ty;
      let entry = tileCache.get(`${m.id}:${lz}:${lx}:${ly}`);

      while (lz > 0 && (!entry || !entry.ready)) {
        lz -= 1;
        lx = Math.floor(lx / 2);
        ly = Math.floor(ly / 2);
        entry = loadTile(lz, lx, ly);
      }

      if (!entry || !entry.ready) continue;

      const wx = tx * tileWorldX;
      const wyTop = m.worldH - ty * tileWorldY;
      const p = worldToScreen(wx, wyTop);
      const dw = tileWorldX * state.scale + 0.5;
      const dh = tileWorldY * state.scale + 0.5;

      if (lz === z) {
        ctx.drawImage(entry.img, p.x, p.y, dw, dh);
      } else {
        const drop = z - lz;
        const size = TILE_SIZE / (1 << drop);
        const sx = (tx - lx * (1 << drop)) * size;
        const sy = (ty - ly * (1 << drop)) * size;
        ctx.drawImage(entry.img, sx, sy, size, size, p.x, p.y, dw, dh);
      }
    }
  }
}

function drawCircle(wx, wy, rWorld, fill, stroke, width, dash) {
  const p = worldToScreen(wx, wy);
  const r = rWorld * state.scale;
  ctx.beginPath();
  if (dash) ctx.setLineDash(dash);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (fill !== "transparent") ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawIcon(wx, wy, src, size, label, color) {
  const p = worldToScreen(wx, wy);
  const entry = loadIcon(src);
  const s = size;

  if (color) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(p.x, p.y, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  if (entry.ready) {
    ctx.drawImage(entry.img, p.x - s / 2, p.y - s / 2, s, s);
  }

  if (label) {
    ctx.font = "700 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(11,15,12,0.9)";
    ctx.strokeText(label, p.x, p.y - s * 0.72);
    ctx.fillStyle = color || "#e7eee8";
    ctx.fillText(label, p.x, p.y - s * 0.72);
  }
}

function drawDot(wx, wy, color, label) {
  const p = worldToScreen(wx, wy);
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0b0f0c";
  ctx.stroke();
  if (label) {
    ctx.font = "700 11px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(11,15,12,0.85)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, p.x, p.y - 12);
    ctx.fillText(label, p.x, p.y - 12);
  }
}

function draw() {
  const m = map();
  const cssW = canvas._cssW || 0;
  const cssH = canvas._cssH || 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.fillStyle = "#070a08";
  ctx.fillRect(0, 0, cssW, cssH);

  drawTiles();

  const towerSize = Math.min(34, Math.max(18, 22 * Math.sqrt(state.scale / 4)));
  for (const t of m.towers) {
    drawIcon(t.x, t.y, "assets/tower.webp", towerSize);
  }

  const spawnSize = Math.min(36, Math.max(20, 24 * Math.sqrt(state.scale / 4)));
  for (const s of m.spawns) {
    const f = FACTION[s.name];
    drawIcon(s.x, s.y, f.icon, spawnSize, s.name, f.color);
  }

  if (state.mortar) {
    drawCircle(
      state.mortar.x,
      state.mortar.y,
      MORTAR_RANGE_U,
      "rgba(92, 255, 138, 0.08)",
      "rgba(92, 255, 138, 0.85)",
      2,
      null
    );
    drawDot(state.mortar.x, state.mortar.y, "#5cff8a", "Mortar");
  }

  if (state.mortar && state.target) {
    const a = worldToScreen(state.mortar.x, state.mortar.y);
    const b = worldToScreen(state.target.x, state.target.y);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(231, 238, 232, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.target) {
    drawDot(state.target.x, state.target.y, "#ff6b6b", "Target");
  }
}

function syncInputs() {
  mortarX.value = state.mortar ? state.mortar.x.toFixed(2) : "";
  mortarY.value = state.mortar ? state.mortar.y.toFixed(2) : "";
  targetX.value = state.target ? state.target.x.toFixed(2) : "";
  targetY.value = state.target ? state.target.y.toFixed(2) : "";
}

function updateDistance() {
  if (!state.mortar || !state.target) {
    distanceEl.textContent =
      !state.mortar ? "Place mortar" : "Place target";
    distanceEl.classList.remove("is-ready", "is-oor");
    distanceEl.classList.add("is-empty");
    rangeEl.hidden = true;
    return;
  }

  const metres = Math.round(
    Math.hypot(state.target.x - state.mortar.x, state.target.y - state.mortar.y) *
      METERS_PER_UNIT
  );
  const inRange = metres <= MORTAR_RANGE_M;

  distanceEl.textContent = formatMetres(metres);
  distanceEl.classList.remove("is-empty");
  distanceEl.classList.toggle("is-ready", inRange);
  distanceEl.classList.toggle("is-oor", !inRange);
  rangeEl.hidden = false;
  rangeEl.textContent = inRange ? "In range" : "Out of range";
  rangeEl.className = `range-status ${inRange ? "in" : "out"}`;
}

function clampPoint(pt) {
  const m = map();
  return {
    x: Math.min(Math.max(pt.x, 0), m.worldW),
    y: Math.min(Math.max(pt.y, 0), m.worldH),
  };
}

function placeFromWorld(pt) {
  const clamped = clampPoint(pt);

  if (state.tool === "mortar") {
    state.mortar = clamped;
    setTool("target");
  } else {
    state.target = clamped;
  }

  syncInputs();
  updateDistance();
  draw();
}

function readInputs() {
  const mx = parseCoord(mortarX.value);
  const my = parseCoord(mortarY.value);
  const tx = parseCoord(targetX.value);
  const ty = parseCoord(targetY.value);

  state.mortar =
    mx !== null && my !== null ? clampPoint({ x: mx, y: my }) : null;
  state.target =
    tx !== null && ty !== null ? clampPoint({ x: tx, y: ty }) : null;

  updateDistance();
  draw();
}

function clearAll() {
  state.mortar = null;
  state.target = null;
  syncInputs();
  updateDistance();
  setTool("mortar");
  draw();
}

function resize() {
  const rect = shell.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas._cssW = rect.width;
  canvas._cssH = rect.height;
}

function eventPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function updateCursor(sx, sy) {
  const w = screenToWorld(sx, sy);
  cursorEl.textContent = `X ${w.x.toFixed(2)} · Y ${w.y.toFixed(2)}`;
}

function switchMap(id) {
  if (!MAPS[id]) return;
  if (id !== state.mapId) {
    state.mapId = id;
    clearAll();
  }
  document.querySelectorAll(".map-tab").forEach((btn) => {
    const on = btn.dataset.map === id;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  fitMap();
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId, eventPos(e));
  state.moved = false;
  state.dragging = true;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  shell.classList.add("is-panning");

  if (state.pointers.size === 2) {
    const pts = [...state.pointers.values()];
    state.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
});

canvas.addEventListener("pointermove", (e) => {
  const pos = eventPos(e);
  updateCursor(pos.x, pos.y);

  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, pos);

  if (state.pointers.size === 2) {
    const pts = [...state.pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (state.pinchDist > 0) {
      const mid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      zoomAt(mid.x, mid.y, dist / state.pinchDist);
    }
    state.pinchDist = dist;
    state.moved = true;
    return;
  }

  if (!state.dragging) return;
  const dx = e.clientX - state.lastX;
  const dy = e.clientY - state.lastY;
  if (Math.hypot(dx, dy) > 3) state.moved = true;
  state.ox += dx;
  state.oy += dy;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  draw();
});

function endPointer(e) {
  const wasTap = state.dragging && !state.moved && state.pointers.size <= 1;
  state.pointers.delete(e.pointerId);
  if (state.pointers.size === 0) {
    state.dragging = false;
    state.pinchDist = 0;
    shell.classList.remove("is-panning");
    if (wasTap) {
      const p = eventPos(e);
      placeFromWorld(screenToWorld(p.x, p.y));
    }
  }
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", () => {
  cursorEl.textContent = "X — · Y —";
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = eventPos(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  },
  { passive: false }
);

document.querySelectorAll(".map-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchMap(btn.dataset.map));
});

document.querySelectorAll(".tool[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

document.getElementById("clear").addEventListener("click", clearAll);

[mortarX, mortarY, targetX, targetY].forEach((input) => {
  input.addEventListener("input", readInputs);
  input.addEventListener("focus", () => input.select());
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    clearAll();
  }
  if (e.key === "1") setTool("mortar");
  if (e.key === "2") setTool("target");
});

window.addEventListener("resize", () => {
  const mid = screenToWorld(canvas._cssW / 2, canvas._cssH / 2);
  resize();
  const after = worldToScreen(mid.x, mid.y);
  state.ox += canvas._cssW / 2 - after.x;
  state.oy += canvas._cssH / 2 - after.y;
  draw();
});

resize();
switchMap(state.mapId);
setTool("mortar");
updateDistance();
