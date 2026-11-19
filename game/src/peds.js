// People: pedestrians on the sidewalks, foot police, armed thugs, and the
// wanted system that brings the police after the player.
import { PLAYER_CFG } from './config.js';
import { isWaterAt, randomSidewalkPoint, resolveBuildings, roadPointFarFrom } from './world.js';
import { damagePlayer } from './player.js';
import { spawnPoliceCar } from './vehicles.js';

let nextPedId = 1;

export function createPed(game, x, y, kind) {
  const ped = {
    id: nextPedId,
    kind, // 'civilian' | 'cop' | 'thug'
    x, y,
    angle: game.rng.range(0, Math.PI * 2),
    speed: 0,
    hp: kind === 'thug' ? 60 : 30,
    down: 0, // seconds spent knocked down
    scared: 0, // seconds left of fleeing
    vx: 0, vy: 0, // knockback velocity
    walkPhase: game.rng.range(0, Math.PI * 2),
    target: null, // sidewalk waypoint
    shootTimer: game.rng.range(0.5, 1.5),
    shirt: game.rng.pick(['#e8e4da', '#c96a4a', '#5d7d8a', '#d9a441', '#7a5d8a', '#4a7a5d']),
    skin: game.rng.pick(['#e8b88a', '#c98d5f', '#8a5a3b', '#f0c8a0']),
    hat: kind === 'cop',
  };
  nextPedId += 1;
  return ped;
}

export function spawnCityPeds(game) {
  for (let i = 0; i < 34; i += 1) {
    const p = randomSidewalkPoint(game.rng, game.city);
    if (isWaterAt(game.city, p.x, p.y)) continue;
    game.peds.push(createPed(game, p.x, p.y, 'civilian'));
  }
}

// Everyone nearby runs from a gunshot, a punch or a speeding car.
export function scarePedsNear(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.kind !== 'civilian' || ped.down > 0) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (dx * dx + dy * dy < radius * radius) {
      ped.scared = 4;
      ped.angle = Math.atan2(dy, dx);
    }
  }
}

// --- Wanted -----------------------------------------------------------------
// Crimes add stars (0–5). Stars fall when the player stays out of trouble
// and no police can see him; the police keep coming while stars are up.
export function addWanted(game, stars, reason) {
  const w = game.wanted;
  const before = w.stars;
  w.stars = Math.min(5, w.stars + stars);
  w.quiet = 0;
  w.lastCrime = game.time;
  if (w.stars > before && w.stars >= 1) {
    game.events.push({ type: 'wanted-up', stars: w.stars, reason });
    game.audio.siren(true);
  }
}

export function updateWanted(game, dt) {
  const w = game.wanted;
  const p = game.player;
  if (w.stars === 0) {
    game.audio.siren(false);
    return;
  }
  // How close is the nearest police?
  let nearest = Infinity;
  for (const car of game.cars) {
    if (car.kind !== 'police') continue;
    nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
  }
  for (const ped of game.peds) {
    if (ped.kind !== 'cop') continue;
    nearest = Math.min(nearest, Math.hypot(ped.x - p.x, ped.y - p.y));
  }
  const seen = nearest < 520;
  if (!seen && game.time - w.lastCrime > 6) w.quiet += dt;
  else w.quiet = 0;
  if (w.quiet > 6) {
    w.stars -= 1;
    w.quiet = 0;
    game.events.push({ type: 'wanted-down', stars: w.stars });
    if (w.stars === 0) game.audio.siren(false);
  }
  // Keep the right number of police cars on the road.
  const wantCars = Math.min(3, w.stars);
  const haveCars = game.cars.filter((c) => c.kind === 'police').length;
  if (haveCars < wantCars && game.time - (w.lastSpawn || 0) > 2.5) {
    w.lastSpawn = game.time;
    spawnPoliceCar(game);
  }
  // At 3 stars and up, foot police join the chase.
  const wantCops = w.stars >= 3 ? Math.min(3, w.stars - 2) : 0;
  const haveCops = game.peds.filter((d) => d.kind === 'cop').length;
  if (haveCops < wantCops && game.time - (w.lastCopSpawn || 0) > 3) {
    w.lastCopSpawn = game.time;
    const spot = roadPointFarFrom(game.rng, game.city, p.x, p.y, 420);
    game.peds.push(createPed(game, spot.x, spot.y, 'cop'));
  }
  if (w.stars === 0) {
    // The heat is off: foot police give up and walk away.
    for (const ped of game.peds) {
      if (ped.kind === 'cop') ped.kind = 'civilian';
    }
  }
}

// --- Pedestrian behaviour ---------------------------------------------------
function updateCivilian(game, ped, dt) {
  if (ped.down > 0) {
    ped.down -= dt;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.vx *= 0.86;
    ped.vy *= 0.86;
    return;
  }
  if (ped.scared > 0) {
    ped.scared -= dt;
    const speed = 250;
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const spot = resolveBuildings(game.city, nx, ny, 10);
    if (!isWaterAt(game.city, spot.x, spot.y)) {
      ped.x = spot.x;
      ped.y = spot.y;
    } else {
      ped.angle += Math.PI / 2;
    }
    ped.walkPhase += dt * 12;
    return;
  }
  // Amble along the sidewalk toward a waypoint, then pick a new one.
  if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
    ped.target = randomSidewalkPoint(game.rng, game.city);
  }
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  ped.angle = Math.atan2(dy, dx);
  const speed = 55;
  const nx = ped.x + (dx / d) * speed * dt;
  const ny = ped.y + (dy / d) * speed * dt;
  const spot = resolveBuildings(game.city, nx, ny, 10);
  if (!isWaterAt(game.city, spot.x, spot.y)) {
    ped.x = spot.x;
    ped.y = spot.y;
  }
  ped.walkPhase += dt * 6;
}

// A foot cop runs at the player and tries to grab him; held for a moment, the player is busted.
function updateCop(game, ped, dt) {
  const p = game.player;
  if (ped.down > 0) {
    ped.down -= dt;
    return;
  }
  const dx = p.x - ped.x;
  const dy = p.y - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  ped.angle = Math.atan2(dy, dx);
  const speed = 235;
  const nx = ped.x + (dx / d) * speed * dt;
  const ny = ped.y + (dy / d) * speed * dt;
  const spot = resolveBuildings(game.city, nx, ny, 10);
  ped.x = spot.x;
  ped.y = spot.y;
  ped.walkPhase += dt * 10;
  if (d < 26) {
    if (!p.inCar) {
      ped.grab = (ped.grab || 0) + dt;
      damagePlayer(game, 6 * dt, 'grabbed by police');
      if (ped.grab > 1.6) {
        game.events.push({ type: 'busted' });
      }
    } else {
      ped.grab = 0;
    }
  } else {
    ped.grab = 0;
  }
}

// A thug stands his ground and shoots at the player when close.
// A thug whose health is gone stays down: he does not get back up.
function updateThug(game, ped, dt) {
  const p = game.player;
  if (ped.down > 0) {
    if (ped.hp > 0) ped.down -= dt;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.vx *= 0.86;
    ped.vy *= 0.86;
    return;
  }
  const dx = p.x - ped.x;
  const dy = p.y - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  ped.angle = Math.atan2(dy, dx);
  ped.shootTimer -= dt;
  if (d < 520 && ped.shootTimer <= 0) {
    ped.shootTimer = game.rng.range(0.7, 1.3);
    const spread = game.rng.range(-0.12, 0.12);
    const a = Math.atan2(dy, dx) + spread;
    game.bullets.push({
      x: ped.x + Math.cos(a) * 20,
      y: ped.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 700,
      vy: Math.sin(a) * 700,
      life: 0.8,
      from: 'thug',
      damage: 7,
    });
    game.audio.shot();
    game.events.push({ type: 'shot-fired', x: ped.x, y: ped.y });
  }
  // Keep a little distance: step back if the player rushes in.
  if (d < 120) {
    const nx = ped.x - (dx / d) * 90 * dt;
    const ny = ped.y - (dy / d) * 90 * dt;
    const spot = resolveBuildings(game.city, nx, ny, 10);
    ped.x = spot.x;
    ped.y = spot.y;
  }
}

export function updatePeds(game, dt) {
  for (const ped of game.peds) {
    if (ped.kind === 'civilian') updateCivilian(game, ped, dt);
    else if (ped.kind === 'cop') updateCop(game, ped, dt);
    else updateThug(game, ped, dt);
  }
  // The crowd thins far from the player and refills near him.
  if (game.peds.filter((d) => d.kind === 'civilian').length < 28 && game.rng.chance(0.02)) {
    const p = randomSidewalkPoint(game.rng, game.city);
    if (Math.hypot(p.x - game.player.x, p.y - game.player.y) < 900) {
      game.peds.push(createPed(game, p.x, p.y, 'civilian'));
    }
  }
}

// Bullets fly, hit buildings, cars and people, then fade.
export function updateBullets(game, dt) {
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    // Buildings stop bullets.
    if (game.city.buildings.some((bd) => b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h)) {
      b.life = 0;
      game.particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 3 });
      continue;
    }
    if (b.from === 'player') {
      // Hit a person?
      for (const ped of game.peds) {
        if (ped.down > 0) continue;
        const dx = ped.x - b.x;
        const dy = ped.y - b.y;
        if (dx * dx + dy * dy < 16 * 16) {
          ped.hp -= b.damage;
          ped.down = ped.hp <= 0 ? 3 : 1;
          ped.vx = b.vx * 0.2;
          ped.vy = b.vy * 0.2;
          ped.scared = 5;
          b.life = 0;
          game.events.push({ type: 'ped-shot', ped });
          if (ped.kind === 'civilian') addWanted(game, 1, 'shot a pedestrian');
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a car?
      for (const car of game.cars) {
        if (car.kind === 'player') continue;
        const dx = car.x - b.x;
        const dy = car.y - b.y;
        if (dx * dx + dy * dy < 30 * 30) {
          car.hp -= b.damage;
          b.life = 0;
          game.particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 4 });
          if (car.hp <= 0 && !car.disabled) {
            car.disabled = true;
            car.speed = 0;
          }
          break;
        }
      }
    } else {
      // An enemy bullet: only the player can be hit.
      const p = game.player;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy < 15 * 15) {
        damagePlayer(game, b.damage, 'shot');
        b.life = 0;
      }
    }
  }
  game.bullets = game.bullets.filter((b) => b.life > 0);
}
