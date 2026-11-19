// Deterministic scenes for screenshots: each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by
// scripted input, so the frame is what a short game really looks like and
// the same seed always gives the same frame. Also a scripted self-test
// (?shot=selftest) that exercises moving, driving, shooting, a mission,
// the wanted level and saving, and reports the results in the document.
import { STEP } from './config.js';
import { createGame, stepGame } from './main.js';
import { startMission } from './missions.js';
import { createVehicle } from './vehicles.js';
import { updatePeds, updateWanted } from './peds.js';
import { updateVehicles } from './vehicles.js';
import { addWanted } from './peds.js';
import { loadSave, saveGame } from './save.js';

const SAMPLE = STEP;

function freshGame(game) {
  const next = createGame(game.seed);
  next.input = game.input;
  next.audio = game.audio;
  Object.assign(game, next);
  return game;
}

function holdKey(game, code, seconds) {
  game.input.keys.add(code);
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) stepGame(game, SAMPLE);
  game.input.keys.delete(code);
}

function pressKey(game, code) {
  game.input.pressed.add(code);
  stepGame(game, SAMPLE);
}

function ambient(game, seconds) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    game.time += SAMPLE;
    updateVehicles(game, SAMPLE);
    updatePeds(game, SAMPLE);
    updateWanted(game, SAMPLE);
  }
}

function putPlayerInCar(game, car) {
  game.player.x = car.x;
  game.player.y = car.y;
  game.player.inCar = true;
  game.player.car = car;
  car.kind = 'player';
  car.driver = 'player';
}

export function stageShot(name, game, renderer) {
  freshGame(game);
  const input = game.input;
  input.keys.clear();
  input.pressed.clear();

  if (name === 'city') {
    game.screen = 'play';
    startMission(game, 0);
    // Walk the streets on foot: north, east, south, west, past traffic.
    holdKey(game, 'KeyW', 3);
    holdKey(game, 'KeyD', 3);
    holdKey(game, 'KeyS', 3);
    holdKey(game, 'KeyA', 2);
    holdKey(game, 'KeyW', 3);
    return { screen: 'play' };
  }

  if (name === 'chase') {
    game.screen = 'play';
    startMission(game, 5); // The Getaway: wanted, pier, safehouse.
    const car = createVehicle(game, 'sports', 1836, 2284, -Math.PI / 2, 'mission');
    game.cars.push(car);
    putPlayerInCar(game, car);
    game.wanted.stars = 3;
    game.wanted.lastCrime = game.time;
    // Three police cars trailing close behind on the same road.
    for (let i = 0; i < 3; i += 1) {
      const pc = createVehicle(game, 'police', 1836 + (i - 1) * 40, 2460 + i * 70, -Math.PI / 2, 'police');
      pc.speed = 310 + i * 20;
      game.cars.push(pc);
    }
    game.audio.siren(true);
    // Straight up the road, still moving fast when the frame is taken.
    holdKey(game, 'KeyW', 3.8);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    game.screen = 'play';
    startMission(game, 4); // Hold the Line at the park kiosk.
    const k = game.city.locations.parkKiosk;
    game.player.x = k.x;
    game.player.y = k.y + 120;
    game.player.ammo = 48;
    // Shoot at the nearest thug a few times.
    for (let round = 0; round < 5; round += 1) {
      const thug = game.peds.find((d) => d.kind === 'thug' && d.hp > 0);
      if (!thug) break;
      input.mouse.x = window.innerWidth / 2 + (thug.x - game.camera.x) * game.camera.zoom;
      input.mouse.y = window.innerHeight / 2 + (thug.y - game.camera.y) * game.camera.zoom;
      input.mouse.clicked = true;
      stepGame(game, SAMPLE);
      for (let i = 0; i < 20; i += 1) stepGame(game, SAMPLE);
    }
    return { screen: 'play' };
  }

  if (name === 'selftest') {
    const results = runSelfTest(game);
    const text = JSON.stringify(results);
    window.__testResult = text;
    document.title = `SELFTEST ${results.passed}/${results.total}`;
    const status = document.getElementById('status');
    if (status) status.textContent = text;
    game.screen = 'play';
    return { screen: 'play' };
  }

  // Default: the start screen over a living city.
  game.screen = 'title';
  ambient(game, 5);
  game.camera.x = 1836;
  game.camera.y = 1388;
  game.camera.zoom = 0.62;
  return { screen: 'title' };
}

// Scripted play-through checks. Each check returns true or a failure string.
function runSelfTest(game) {
  const checks = [];
  function check(label, fn) {
    try {
      const ok = fn();
      checks.push({ label, ok: ok === true ? true : String(ok) });
    } catch (error) {
      checks.push({ label, ok: `threw ${error.message}` });
    }
  }
  game.screen = 'play';
  const p = game.player;

  check('player walks north', () => {
    const y0 = p.y;
    holdKey(game, 'KeyW', 1);
    return p.y < y0 - 50 || `y moved only ${y0 - p.y}`;
  });

  check('player enters a parked car with E', () => {
    const car = createVehicle(game, 'sedan', p.x + 40, p.y, 0, 'parked');
    game.cars.push(car);
    p.x = car.x - 30;
    p.y = car.y;
    pressKey(game, 'KeyE');
    return p.inCar === true && p.car === car ? true : 'not in car';
  });

  check('car accelerates', () => {
    holdKey(game, 'KeyW', 2);
    return Math.abs(p.car.speed) > 100 || `speed ${p.car.speed}`;
  });

  check('player exits the car with E', () => {
    pressKey(game, 'KeyE');
    return p.inCar === false ? true : 'still in car';
  });

  check('shooting spends ammo and fires a bullet', () => {
    const ammo0 = p.ammo;
    game.input.mouse.x = window.innerWidth / 2 + 100;
    game.input.mouse.y = window.innerHeight / 2;
    game.input.mouse.clicked = true;
    stepGame(game, SAMPLE);
    return p.ammo === ammo0 - 1 && game.bullets.length >= 1 ? true : `ammo ${ammo0} -> ${p.ammo}, bullets ${game.bullets.length}`;
  });

  check('mission 1 starts, advances and completes', () => {
    startMission(game, 0);
    if (!game.mission.active) return 'mission not active';
    const car = game.mission.car;
    putPlayerInCar(game, car);
    stepGame(game, SAMPLE);
    if (game.mission.step !== 1) return `step is ${game.mission.step}`;
    const g = game.city.locations.marasGarage;
    car.x = g.x;
    car.y = g.y;
    p.x = g.x;
    p.y = g.y;
    const cash0 = p.cash;
    stepGame(game, SAMPLE);
    return game.mission.done === true && p.cash === cash0 + 200 ? true : `done=${game.mission.done} cash ${cash0} -> ${p.cash}`;
  });

  check('stealing raises wanted and police cars spawn', () => {
    game.wanted.stars = 0;
    addWanted(game, 2, 'test');
    for (let i = 0; i < 240; i += 1) stepGame(game, SAMPLE);
    const cops = game.cars.filter((c) => c.kind === 'police').length;
    return game.wanted.stars >= 2 && cops >= 1 ? true : `stars ${game.wanted.stars}, police cars ${cops}`;
  });

  check('mission 5 spawns two thug waves and completes', () => {
    startMission(game, 4);
    const wave1 = game.peds.filter((d) => d.kind === 'thug').length;
    if (wave1 !== 3) return `wave 1 has ${wave1} thugs`;
    for (const d of game.peds) if (d.kind === 'thug') { d.hp = 0; d.down = 3; }
    stepGame(game, SAMPLE);
    const wave2 = game.peds.filter((d) => d.kind === 'thug' && d.hp > 0).length;
    if (wave2 !== 3) return `wave 2 has ${wave2} thugs`;
    for (const d of game.peds) if (d.kind === 'thug') { d.hp = 0; d.down = 3; }
    stepGame(game, SAMPLE);
    return game.mission.done === true ? true : 'mission 5 not done';
  });

  check('save and load round-trip', () => {
    p.cash = 777;
    saveGame(game);
    const loaded = loadSave();
    return loaded && loaded.cash === 777 ? true : `loaded ${loaded ? loaded.cash : 'null'}`;
  });

  check('no console errors recorded by the game', () => (window.__gameErrors || 0) === 0 || `${window.__gameErrors} errors`);

  const passed = checks.filter((c) => c.ok === true).length;
  return { passed, total: checks.length, checks };
}
