// The HUD (cash, health, wanted stars, ammo, speed, objective, minimap),
// the dialogue box, the shop menu, and the title / pause / game-over screens.
// Menus are drawn on the canvas and clicked with the mouse, or driven by keys.
import { GAME_SUBTITLE, GAME_TITLE, PRICES } from './config.js';
import { MISSION_COUNT, missionObjectiveText } from './missions.js';
import { hasSave } from './save.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function text(ctx, value, x, y, size, color, align = 'left', weight = '') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function panel(ctx, x, y, w, h, fill = 'rgba(16,14,12,0.72)') {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,211,77,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawStars(ctx, stars, x, y, size) {
  for (let i = 0; i < 5; i += 1) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = i < stars ? '#ffd34d' : 'rgba(255,255,255,0.28)';
    ctx.fillText('★', x + i * (size + 2), y);
  }
}

// --- Minimap ---------------------------------------------------------------
function drawMinimap(game, ctx, view) {
  const size = 190;
  const x0 = view.w - size - 16;
  const y0 = view.h - size - 16;
  const scale = size / game.city.size;
  ctx.save();
  panel(ctx, x0 - 6, y0 - 6, size + 12, size + 12);
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  // Sea and sand.
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x0, y0 + 3224 * scale, size, (3460 - 3224) * scale);
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(x0, y0, size, 3224 * scale);
  // Roads.
  ctx.strokeStyle = '#3d3a38';
  ctx.lineWidth = 4;
  for (const c of game.city.roadsV) {
    ctx.beginPath();
    ctx.moveTo(x0 + c * scale, y0);
    ctx.lineTo(x0 + c * scale, y0 + size);
    ctx.stroke();
  }
  for (const c of game.city.roadsH) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + c * scale);
    ctx.lineTo(x0 + size, y0 + c * scale);
    ctx.stroke();
  }
  // Park.
  ctx.fillStyle = '#5d9b4a';
  ctx.fillRect(x0 + game.city.park.x * scale, y0 + game.city.park.y * scale, 360 * scale, 360 * scale);
  // Shops.
  for (const s of game.city.shops) {
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(x0 + s.x * scale - 2, y0 + s.y * scale - 2, 4, 4);
  }
  // Mission marker, pulsing.
  const m = game.mission;
  if (m.active && m.target) {
    const r = 5 + Math.sin(game.time * 5) * 2;
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(x0 + m.target.x * scale, y0 + m.target.y * scale, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1d1a18';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police cars as red dots, traffic as grey dots.
  for (const car of game.cars) {
    if (car.kind === 'player') continue;
    ctx.fillStyle = car.kind === 'police' ? '#ff3b30' : 'rgba(230,230,230,0.7)';
    ctx.fillRect(x0 + car.x * scale - 1.5, y0 + car.y * scale - 1.5, 3, 3);
  }
  // The player: a white arrow that turns with him.
  const p = game.player;
  ctx.save();
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  text(ctx, 'SOLMAR', x0, y0 - 10, 13, '#ffd34d', 'left', 'bold');
}

// --- HUD -------------------------------------------------------------------
export function drawHUD(game, ctx, view) {
  const p = game.player;
  const w = game.wanted;
  // Cash and health, top-left.
  panel(ctx, 14, 12, 210, 64);
  text(ctx, `$ ${p.cash.toLocaleString('en-US')}`, 26, 40, 24, '#ffd34d', 'left', 'bold');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(26, 52, 186, 10);
  ctx.fillStyle = p.hp > 50 ? '#58c96b' : p.hp > 25 ? '#e8b93b' : '#e5534b';
  ctx.fillRect(26, 52, 186 * Math.max(0, p.hp / 100), 10);
  text(ctx, `HP ${Math.ceil(p.hp)}`, 26, 58, 11, '#ffffff');
  // Wanted stars, ammo and speed, top-right.
  panel(ctx, view.w - 224, 12, 210, 64);
  drawStars(ctx, w.stars, view.w - 212, 38, 22);
  text(ctx, `AMMO ${p.ammo}`, view.w - 212, 62, 15, '#ffffff', 'left', 'bold');
  if (p.inCar && p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.12);
    text(ctx, `${mph} mph`, view.w - 26, 62, 15, '#9fd8ff', 'right', 'bold');
  }
  // Objective, top-centre.
  const m = game.mission;
  if (m.active && m.def) {
    const obj = missionObjectiveText(game);
    const label = `MISSION ${m.index + 1}/${MISSION_COUNT} — ${m.def.title.toUpperCase()}`;
    ctx.font = `bold 13px ${FONT}`;
    const lw = Math.max(ctx.measureText(label).width, ctx.measureText(obj).width) + 28;
    panel(ctx, (view.w - lw) / 2, 12, lw, 62, 'rgba(16,14,12,0.78)');
    text(ctx, label, view.w / 2, 36, 13, '#ffd34d', 'center', 'bold');
    text(ctx, obj, view.w / 2, 60, 15, '#ffffff', 'center');
  }
  // Dialogue, bottom-centre.
  if (game.dialogue.lines.length > 0) {
    const line = game.dialogue.lines[game.dialogue.index];
    if (line) {
      ctx.font = `16px ${FONT}`;
      const lw = Math.min(view.w - 280, ctx.measureText(line).width + 32);
      panel(ctx, (view.w - lw) / 2, view.h - 92, lw, 40, 'rgba(16,14,12,0.82)');
      text(ctx, line, view.w / 2, view.h - 65, 16, '#ffffff', 'center');
    }
  }
  // Toasts (job done / failed).
  if (game.toastTimer > 0 && game.toast) {
    ctx.font = `bold 17px ${FONT}`;
    const tw = ctx.measureText(game.toast).width + 30;
    panel(ctx, (view.w - tw) / 2, 92, tw, 38, 'rgba(16,14,12,0.85)');
    text(ctx, game.toast, view.w / 2, 117, 17, '#ffd34d', 'center', 'bold');
  }
  // Controls hint, bottom-left, early on.
  if (game.time < 25 && game.screen === 'play') {
    text(ctx, 'WASD move • E enter car • Click shoot • Space punch • Shift run • Esc pause', 16, view.h - 18, 13, 'rgba(255,255,255,0.75)');
  }
  drawMinimap(game, ctx, view);
}

// --- Shop menu ---------------------------------------------------------------
export function drawShop(game, ctx, view) {
  const shop = game.shop;
  if (!shop.open) return;
  const w = 460;
  const h = 300;
  const x = (view.w - w) / 2;
  const y = (view.h - h) / 2;
  panel(ctx, x, y, w, h, 'rgba(16,14,12,0.92)');
  text(ctx, shop.name, view.w / 2, y + 44, 26, '#ffd34d', 'center', 'bold');
  text(ctx, `Your cash: $ ${game.player.cash}`, view.w / 2, y + 72, 15, '#ffffff', 'center');
  const rows = shop.items;
  game.ui.buttons = [];
  rows.forEach((row, i) => {
    const ry = y + 100 + i * 52;
    const afford = game.player.cash >= row.price;
    ctx.fillStyle = afford ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(x + 24, ry, w - 48, 42);
    text(ctx, `${i + 1}. ${row.label}`, x + 38, ry + 27, 16, afford ? '#ffffff' : '#888888');
    text(ctx, `$${row.price}`, x + w - 38, ry + 27, 16, afford ? '#ffd34d' : '#888888', 'right', 'bold');
    game.ui.buttons.push({ id: `shop-${i}`, x: x + 24, y: ry, w: w - 48, h: 42 });
  });
  text(ctx, 'Press 1-3 to buy, or click. Esc to close.', view.w / 2, y + h - 18, 13, 'rgba(255,255,255,0.6)', 'center');
}

// --- Menus -------------------------------------------------------------------
function drawButtons(game, ctx, view, buttons, cy) {
  game.ui.buttons = [];
  const bw = 300;
  const bh = 52;
  buttons.forEach((b, i) => {
    const x = (view.w - bw) / 2;
    const y = cy + i * (bh + 12);
    const hover = game.ui.hover === b.id;
    ctx.fillStyle = hover ? 'rgba(255,211,77,0.92)' : 'rgba(255,211,77,0.16)';
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, b.label, view.w / 2, y + 34, 19, hover ? '#1d1a18' : '#ffd34d', 'center', 'bold');
    game.ui.buttons.push({ id: b.id, x, y, w: bw, h: bh });
  });
}

export function drawTitle(game, ctx, view) {
  // Dim the city backdrop so the title reads.
  ctx.fillStyle = 'rgba(10,12,18,0.55)';
  ctx.fillRect(0, 0, view.w, view.h);
  text(ctx, GAME_TITLE, view.w / 2, view.h * 0.32, 92, '#ffd34d', 'center', 'bold');
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(view.w / 2 - 180, view.h * 0.32 + 18);
  ctx.lineTo(view.w / 2 + 180, view.h * 0.32 + 18);
  ctx.stroke();
  text(ctx, GAME_SUBTITLE, view.w / 2, view.h * 0.32 + 52, 20, '#ffffff', 'center');
  text(ctx, 'An original city. No real places, no real brands.', view.w / 2, view.h * 0.32 + 80, 14, 'rgba(255,255,255,0.65)', 'center');
  const buttons = [{ id: 'new', label: 'NEW GAME' }];
  if (hasSave()) buttons.push({ id: 'continue', label: 'CONTINUE' });
  buttons.push({ id: 'how', label: 'HOW TO PLAY' });
  drawButtons(game, ctx, view, buttons, view.h * 0.52);
  text(ctx, 'WASD move • E enter / exit car • Mouse aim, click to shoot • Space punch / handbrake', view.w / 2, view.h - 64, 14, 'rgba(255,255,255,0.7)', 'center');
  text(ctx, 'Shift run • Esc pause • Near a shop, press E to buy ammo, health and repairs', view.w / 2, view.h - 40, 14, 'rgba(255,255,255,0.7)', 'center');
  if (game.ui.showHow) {
    panel(ctx, (view.w - 560) / 2, view.h * 0.30, 560, 300, 'rgba(16,14,12,0.94)');
    text(ctx, 'HOW TO PLAY', view.w / 2, view.h * 0.30 + 40, 22, '#ffd34d', 'center', 'bold');
    const lines = [
      'You are Raka, a driver new to Solmar.',
      'You owe Mara money. Six jobs will clear it.',
      'Steal cars with E. The police notice.',
      'Stars show how wanted you are — lay low and they fade.',
      'Finish jobs to earn cash. Spend it at shops.',
      'Gold markers show where the job is.',
    ];
    lines.forEach((line, i) => text(ctx, line, view.w / 2, view.h * 0.30 + 78 + i * 30, 15, '#ffffff', 'center'));
    text(ctx, 'Click anywhere to close', view.w / 2, view.h * 0.30 + 272, 13, 'rgba(255,255,255,0.6)', 'center');
  }
}

export function drawPause(game, ctx, view) {
  ctx.fillStyle = 'rgba(10,12,18,0.6)';
  ctx.fillRect(0, 0, view.w, view.h);
  text(ctx, 'PAUSED', view.w / 2, view.h * 0.3, 52, '#ffd34d', 'center', 'bold');
  const m = game.mission;
  if (m.active && m.def) {
    text(ctx, `Job ${m.index + 1}/${MISSION_COUNT}: ${m.def.title}`, view.w / 2, view.h * 0.3 + 40, 16, '#ffffff', 'center');
  }
  drawButtons(game, ctx, view, [
    { id: 'resume', label: 'RESUME' },
    { id: 'restart-mission', label: 'RESTART JOB' },
    { id: 'quit-title', label: 'SAVE & QUIT TO TITLE' },
  ], view.h * 0.44);
}

export function drawGameOver(game, ctx, view) {
  ctx.fillStyle = 'rgba(10,12,18,0.72)';
  ctx.fillRect(0, 0, view.w, view.h);
  const title = game.over.reason === 'busted' ? 'BUSTED' : 'TAKEN DOWN';
  text(ctx, title, view.w / 2, view.h * 0.3, 64, '#e5534b', 'center', 'bold');
  text(ctx, game.over.reason === 'busted'
    ? 'The Solmar police caught up with Raka.'
    : 'Raka did not make it out of that one.', view.w / 2, view.h * 0.3 + 44, 18, '#ffffff', 'center');
  text(ctx, `Cash kept: $ ${game.player.cash}  •  Jobs done: ${game.stats.missionsDone} of ${MISSION_COUNT}`, view.w / 2, view.h * 0.3 + 76, 15, 'rgba(255,255,255,0.75)', 'center');
  drawButtons(game, ctx, view, [
    { id: 'retry', label: 'TRY AGAIN' },
    { id: 'quit-title', label: 'QUIT TO TITLE' },
  ], view.h * 0.48);
}

export function drawComplete(game, ctx, view) {
  ctx.fillStyle = 'rgba(10,12,18,0.6)';
  ctx.fillRect(0, 0, view.w, view.h);
  text(ctx, 'DEBT PAID', view.w / 2, view.h * 0.3, 64, '#ffd34d', 'center', 'bold');
  text(ctx, 'Raka drove Mara to the safehouse. The debt is gone — Solmar is his now.', view.w / 2, view.h * 0.3 + 44, 18, '#ffffff', 'center');
  text(ctx, `Final cash: $ ${game.player.cash}  •  Cars stolen: ${game.stats.carsStolen}  •  Shots fired: ${game.stats.shotsFired}`, view.w / 2, view.h * 0.3 + 76, 15, 'rgba(255,255,255,0.75)', 'center');
  drawButtons(game, ctx, view, [
    { id: 'free-roam', label: 'KEEP EXPLORING SOLMAR' },
    { id: 'quit-title', label: 'QUIT TO TITLE' },
  ], view.h * 0.48);
}

// Which button (if any) sits under a click at screen point (x, y)?
export function buttonAt(game, x, y) {
  for (const b of game.ui.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}
