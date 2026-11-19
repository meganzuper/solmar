// SOLMAR — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, paused, over, complete.
// ?seed=N fixes the city. ?shot=start|city|chase|mission|selftest stages a
// deterministic scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import { PRICES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { generateCity } from './world.js';
import { createPlayer, damagePlayer, exitCar, playerPunch, playerShoot, tryEnterCar, updatePlayerOnFoot } from './player.js';
import { spawnCityVehicles, updateVehicles } from './vehicles.js';
import { spawnCityPeds, updateBullets, updatePeds, updateWanted } from './peds.js';
import { MISSION_COUNT, failMission, retryMission, startMission, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { buttonAt, drawComplete, drawGameOver, drawHUD, drawPause, drawShop, drawTitle } from './hud.js';
import { createAudio } from './audio.js';
import { clearSave, hasSave, loadSave, saveGame } from './save.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

// --- Game state --------------------------------------------------------------
export function createGame(gameSeed) {
  const rng = createRandom(gameSeed);
  const city = generateCity(rng);
  const game = {
    seed: gameSeed,
    rng,
    time: 0,
    screen: 'title',
    city,
    player: createPlayer(city.locations.spawn.x, city.locations.spawn.y),
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    wanted: { stars: 0, heat: 0, quiet: 0, lastCrime: -99, lastSpawn: 0, lastCopSpawn: 0 },
    mission: { index: -1, step: 0, active: false, done: false, failed: false, timer: 0, count: 0, target: null, def: null, nextTimer: 0 },
    dialogue: { lines: [], index: 0, timer: 0 },
    toast: '',
    toastTimer: 0,
    shop: { open: false, name: '', kind: '', items: [] },
    camera: { x: city.locations.spawn.x, y: city.locations.spawn.y, zoom: 0.9, shake: 0 },
    over: { reason: 'down' },
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
    events: [],
    ui: { buttons: [], hover: null, showHow: false },
    saveTimer: 0,
    input: null,
    audio: null,
  };
  spawnCityVehicles(game);
  spawnCityPeds(game);
  return game;
}

// --- One fixed step of the living world --------------------------------------
export function stepGame(game, dt) {
  game.time += dt;
  const p = game.player;
  const input = game.input;
  const pressed = input.takePressed();
  const clicked = input.takeClicked();

  // Dialogue advances on its own clock, or on a click.
  if (game.dialogue.lines.length > 0) {
    game.dialogue.timer += dt;
    if (game.dialogue.timer > 4 || clicked) {
      game.dialogue.timer = 0;
      game.dialogue.index += 1;
      if (game.dialogue.index >= game.dialogue.lines.length) {
        game.dialogue.lines = [];
        game.dialogue.index = 0;
      }
    }
  }
  if (game.toastTimer > 0) game.toastTimer -= dt;
  if (game.camera.shake > 0) game.camera.shake = Math.max(0, game.camera.shake - 40 * dt);

  // The shop freezes the world while it is open.
  if (game.shop.open) {
    if (pressed.has('Escape') || pressed.has('KeyE')) {
      game.shop.open = false;
      game.audio.click();
    } else {
      handleShopInput(game, pressed, clicked);
    }
    return;
  }

  // Pause.
  if (pressed.has('Escape') || pressed.has('KeyP')) {
    game.screen = 'paused';
    game.audio.setEngine(0, false);
    return;
  }

  // Retry a failed job.
  if (game.mission.failed && pressed.has('KeyR')) {
    retryMission(game);
  }

  // Shops: E beside a shop opens it (on foot, when no car is closer).
  if (!p.inCar && pressed.has('KeyE')) {
    const shop = nearestShop(game, p.x, p.y, 80);
    if (shop && !nearestCarNear(game, p.x, p.y, 70)) {
      openShop(game, shop);
      return;
    }
  }

  // Enter / exit cars.
  if (pressed.has('KeyE')) {
    if (p.inCar) exitCar(game);
    else tryEnterCar(game);
  }

  // On-foot combat.
  if (!p.inCar) {
    if (pressed.has('Space')) playerPunch(game);
    if (clicked && !game.ui.clickedOnButton) {
      const wx = game.camera.x + (input.mouse.x - window.innerWidth / 2) / game.camera.zoom;
      const wy = game.camera.y + (input.mouse.y - window.innerHeight / 2) / game.camera.zoom;
      playerShoot(game, wx, wy);
    }
    updatePlayerOnFoot(game, dt);
  }

  updateVehicles(game, dt);
  updatePeds(game, dt);
  updateBullets(game, dt);
  updateMissions(game, dt);
  updateWanted(game, dt);

  // Particles and skid marks age.
  for (const pt of game.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
  for (const s of game.skids) s.life -= dt;
  game.skids = game.skids.filter((s) => s.life > 0);

  // The camera follows with a look-ahead in the direction of travel.
  const look = p.inCar && p.car ? Math.abs(p.car.speed) * 0.35 : 26;
  const tx = p.x + Math.cos(p.angle) * look;
  const ty = p.y + Math.sin(p.angle) * look;
  game.camera.x += (tx - game.camera.x) * Math.min(1, 4.5 * dt);
  game.camera.y += (ty - game.camera.y) * Math.min(1, 4.5 * dt);
  const targetZoom = p.inCar ? 0.72 : 0.9;
  game.camera.zoom += (targetZoom - game.camera.zoom) * Math.min(1, 2 * dt);

  game.audio.update(dt);

  // Autosave while playing, and on a finished job.
  game.saveTimer += dt;
  if (game.saveTimer > 15) {
    game.saveTimer = 0;
    saveGame(game);
  }

  // React to what happened this step, then clear the event list.
  for (const ev of game.events) {
    if (ev.type === 'player-down') {
      game.over.reason = 'down';
      game.screen = 'over';
      game.audio.setEngine(0, false);
      game.audio.siren(false);
    } else if (ev.type === 'busted') {
      game.over.reason = 'busted';
      game.screen = 'over';
      game.audio.setEngine(0, false);
      game.audio.siren(false);
    } else if (ev.type === 'story-complete') {
      game.screen = 'complete';
      game.audio.setEngine(0, false);
      game.audio.siren(false);
      clearSave();
    } else if (ev.type === 'mission-complete') {
      saveGame(game);
    }
  }
  game.events.length = 0;
}

function nearestCarNear(game, x, y, maxDist) {
  for (const car of game.cars) {
    if (car.kind === 'police') continue;
    const dx = car.x - x;
    const dy = car.y - y;
    if (dx * dx + dy * dy < maxDist * maxDist) return car;
  }
  return null;
}

function nearestShop(game, x, y, maxDist) {
  for (const s of game.city.shops) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < maxDist * maxDist) return s;
  }
  return null;
}

function openShop(game, shop) {
  const specialty = shop.kind;
  const price = (kind, base) => (kind === specialty ? Math.round(base * 0.8) : base);
  game.shop = {
    open: true,
    name: shop.name,
    kind: shop.kind,
    items: [
      { label: `Ammo — ${PRICES.ammoAmount} bullets`, price: price('ammo', PRICES.ammo), apply: () => { game.player.ammo += PRICES.ammoAmount; } },
      { label: 'Full heal', price: price('clinic', PRICES.heal), apply: () => { game.player.hp = 100; } },
      { label: 'Repair your car', price: price('garage', PRICES.repair), apply: () => {
        if (game.player.car) { game.player.car.hp = 100; game.player.car.disabled = false; }
      } },
    ],
  };
  game.audio.click();
}

function handleShopInput(game, pressed, clicked) {
  const shop = game.shop;
  let buy = -1;
  if (pressed.has('Digit1')) buy = 0;
  else if (pressed.has('Digit2')) buy = 1;
  else if (pressed.has('Digit3')) buy = 2;
  else if (clicked) {
    const id = buttonAt(game, game.input.mouse.x, game.input.mouse.y);
    if (id && id.startsWith('shop-')) buy = Number.parseInt(id.slice(5), 10);
  }
  if (buy >= 0 && buy < shop.items.length) {
    const item = shop.items[buy];
    if (buy === 2 && !game.player.car) {
      game.toast = 'You need a car to repair';
      game.toastTimer = 2;
      return;
    }
    if (game.player.cash >= item.price) {
      game.player.cash -= item.price;
      item.apply();
      game.audio.pickup();
      game.toast = 'Bought: ' + item.label;
      game.toastTimer = 2;
    } else {
      game.audio.click();
      game.toast = 'Not enough cash';
      game.toastTimer = 2;
    }
  }
}

// --- Starting and respawning ---------------------------------------------------
function startNewGame(game) {
  const fresh = createGame(game.seed);
  fresh.input = game.input;
  fresh.audio = game.audio;
  Object.assign(game, fresh);
  game.screen = 'play';
  game.audio.unlock();
  game.audio.startMusic();
  startMission(game, 0);
}

function continueGame(game) {
  const save = loadSave();
  if (!save) {
    startNewGame(game);
    return;
  }
  const fresh = createGame(game.seed);
  fresh.input = game.input;
  fresh.audio = game.audio;
  Object.assign(game, fresh);
  const p = game.player;
  p.x = save.x;
  p.y = save.y;
  p.hp = save.hp;
  p.cash = save.cash;
  p.ammo = save.ammo;
  game.stats.missionsDone = save.missionsDone || 0;
  game.wanted.stars = 0;
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.screen = 'play';
  game.audio.unlock();
  game.audio.startMusic();
  const next = Math.min(save.missionIndex >= 0 ? save.missionIndex : 0, MISSION_COUNT - 1);
  startMission(game, next);
}

function respawn(game) {
  const p = game.player;
  const clinic = game.city.shops.find((s) => s.kind === 'clinic');
  if (p.inCar && p.car) {
    p.car.kind = 'parked';
    p.car.driver = null;
    p.inCar = false;
    p.car = null;
  }
  p.x = clinic.x;
  p.y = clinic.y + 60;
  p.hp = 100;
  p.cash = Math.max(0, p.cash - 200);
  p.ammo = Math.max(p.ammo, 12);
  game.wanted.stars = 0;
  game.wanted.quiet = 0;
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.screen = 'play';
  const m = game.mission;
  if (m.index >= 0) startMission(game, m.index);
}

// --- Boot ----------------------------------------------------------------------
// Count page errors so the self-test can report them.
window.__gameErrors = 0;
window.addEventListener('error', () => {
  window.__gameErrors += 1;
});

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
game.input = createInput(canvas);
game.input.attach();
game.audio = createAudio();
window.__game = game;

const renderer = createRenderer(canvas);
const ctx = renderer.ctx;
const view = renderer.view;

function announce(message) {
  status.textContent = message;
}

function handleMenuClick(x, y) {
  const id = buttonAt(game, x, y);
  game.ui.clickedOnButton = true;
  if (game.screen === 'title') {
    if (game.ui.showHow) {
      game.ui.showHow = false;
      return;
    }
    if (id === 'new') startNewGame(game);
    else if (id === 'continue') continueGame(game);
    else if (id === 'how') game.ui.showHow = true;
  } else if (game.screen === 'paused') {
    if (id === 'resume') game.screen = 'play';
    else if (id === 'restart-mission') {
      game.screen = 'play';
      retryMission(game);
    } else if (id === 'quit-title') {
      saveGame(game);
      game.screen = 'title';
    }
  } else if (game.screen === 'over') {
    if (id === 'retry') respawn(game);
    else if (id === 'quit-title') game.screen = 'title';
  } else if (game.screen === 'complete') {
    if (id === 'free-roam') {
      game.screen = 'play';
      game.mission.active = false;
    } else if (id === 'quit-title') game.screen = 'title';
  }
}

function runShot(name) {
  import('./shots.js').then(({ stageShot }) => {
    const scene = stageShot(name, game, renderer);
    let painted = 0;
    function paint() {
      renderer.drawWorld(game);
      if (scene.screen === 'title') drawTitle(game, ctx, view);
      else {
        drawHUD(game, ctx, view);
        if (scene.screen === 'over') drawGameOver(game, ctx, view);
      }
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  });
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const pressed = game.input.pressed;
    const clicked = game.input.takeClicked();
    game.ui.clickedOnButton = false;
    if (game.screen === 'title') {
      if (clicked) handleMenuClick(game.input.mouse.x, game.input.mouse.y);
      if (pressed.has('Enter') || pressed.has('Space')) {
        game.input.takePressed();
        startNewGame(game);
      }
      return;
    }
    if (game.screen === 'paused' || game.screen === 'over' || game.screen === 'complete') {
      if (clicked) handleMenuClick(game.input.mouse.x, game.input.mouse.y);
      if (pressed.has('Escape') && game.screen === 'paused') game.screen = 'play';
      if ((pressed.has('Enter') || pressed.has('Space')) && game.screen === 'over') respawn(game);
      game.input.takePressed();
      return;
    }
    // Play: the click is for shooting, unless it lands on a HUD button.
    if (clicked) {
      game.input.mouse.clicked = true; // hand the click back to stepGame
    }
  }

  function ambient(dt) {
    // The title screen's living backdrop: traffic and crowds, no player.
    game.time += dt;
    updateVehicles(game, dt);
    updatePeds(game, dt);
    for (const pt of game.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    game.particles = game.particles.filter((pt) => pt.life > 0);
    game.camera.x = 1836 + Math.cos(game.time * 0.05) * 500;
    game.camera.y = 1388 + Math.sin(game.time * 0.04) * 400;
    game.camera.zoom = 0.62;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === 'title') {
      while (accumulator >= STEP) {
        ambient(STEP);
        accumulator -= STEP;
      }
    } else if (game.screen === 'play') {
      while (accumulator >= STEP && game.screen === 'play') {
        stepGame(game, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.drawWorld(game);
    if (game.screen === 'title') drawTitle(game, ctx, view);
    else {
      drawHUD(game, ctx, view);
      if (game.shop.open) drawShop(game, ctx, view);
      if (game.screen === 'paused') drawPause(game, ctx, view);
      else if (game.screen === 'over') drawGameOver(game, ctx, view);
      else if (game.screen === 'complete') drawComplete(game, ctx, view);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'play') {
      game.screen = 'paused';
      announce('Paused.');
    }
  });
  // First interaction unlocks sound.
  window.addEventListener('pointerdown', () => game.audio.unlock(), { once: true });
  window.addEventListener('keydown', () => game.audio.unlock(), { once: true });

  announce('SOLMAR. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
