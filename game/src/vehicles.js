// Cars: driving physics for the player, lane-following traffic,
// parked cars to steal, and police cars that chase and ram.
// A car is a point with a heading, a speed and a type; collisions are
// circles at the nose and tail so corners do not snag on buildings.
import { CAR_TYPES, ROAD_CENTERS, ROAD_W } from './config.js';
import { buildingAt, isWaterAt, nearestRoadCenter, randomRoadPoint } from './world.js';
import { damagePlayer } from './player.js';

let nextCarId = 1;

export function createVehicle(game, type, x, y, angle, kind) {
  const def = CAR_TYPES[type];
  const car = {
    id: nextCarId,
    type,
    def,
    x, y, angle,
    speed: 0,
    kind, // 'traffic' | 'parked' | 'player' | 'police' | 'mission'
    driver: null,
    hp: 100,
    disabled: false,
    stolen: false,
    color: def.color,
    // traffic AI state
    axis: Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? 'h' : 'v',
    dir: Math.cos(angle) >= 0 ? 1 : -1,
    cruise: 120 + game.rng.range(0, 60),
    turnAt: 0,
    // police chase state
    chaseLost: 0,
    ramCooldown: 0,
  };
  nextCarId += 1;
  return car;
}

function angleOf(axis, dir) {
  if (axis === 'h') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

// Fill the city with traffic and parked cars. Mission cars are added by missions.js.
export function spawnCityVehicles(game) {
  const rng = game.rng;
  const types = ['sedan', 'taxi', 'van', 'sedan', 'taxi', 'sedan'];
  for (let i = 0; i < 26; i += 1) {
    const p = randomRoadPoint(rng, game.city);
    const type = rng.pick(types);
    const car = createVehicle(game, type, p.x, p.y, angleOf(p.axis, p.dir), 'traffic');
    car.axis = p.axis;
    car.dir = p.dir;
    car.speed = car.cruise;
    game.cars.push(car);
  }
  for (let i = 0; i < 14; i += 1) {
    const p = randomRoadPoint(rng, game.city);
    const type = rng.pick(types);
    // Parked along a roadside, facing along the road.
    const off = rng.chance(0.5) ? -34 : 34;
    const x = p.axis === 'v' ? p.x + off : p.x;
    const y = p.axis === 'h' ? p.y + off : p.y;
    if (isWaterAt(game.city, x, y)) continue;
    const car = createVehicle(game, type, x, y, angleOf(p.axis, p.dir), 'parked');
    game.cars.push(car);
  }
  // A taxi waiting by the spawn, so the first car is always close.
  const taxi = createVehicle(game, 'taxi', 940, 1330, -Math.PI / 2, 'parked');
  game.cars.push(taxi);
}

export function nearestCar(game, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of game.cars) {
    if (car.kind === 'police') continue;
    const dx = car.x - x;
    const dy = car.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function carPoints(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const half = car.def.l / 2 - 10;
  return [
    { x: car.x + fx * half, y: car.y + fy * half },
    { x: car.x - fx * half, y: car.y - fy * half },
    { x: car.x, y: car.y },
  ];
}

function hitsBuilding(game, car) {
  for (const pt of carPoints(car)) {
    if (buildingAt(game.city, pt.x, pt.y, 14)) return true;
  }
  return false;
}

function crashCar(game, car, hard) {
  car.hp -= hard ? 14 : 6;
  game.camera.shake = Math.max(game.camera.shake, hard ? 9 : 4);
  game.audio.crash();
  addSparks(game, car.x, car.y, 8);
  if (car.hp <= 0 && !car.disabled) {
    car.disabled = true;
    car.speed = 0;
    addSparks(game, car.x, car.y, 26);
    if (car.kind === 'player') {
      game.events.push({ type: 'car-wrecked', car });
    }
  }
}

export function addSparks(game, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    game.particles.push({
      kind: 'spark',
      x, y,
      vx: game.rng.range(-160, 160),
      vy: game.rng.range(-160, 160),
      life: game.rng.range(0.2, 0.5),
      max: 0.5,
      size: game.rng.range(2, 4),
    });
  }
}

function addDust(game, x, y) {
  game.particles.push({
    kind: 'dust', x, y,
    vx: game.rng.range(-20, 20), vy: game.rng.range(-20, 20),
    life: 0.6, max: 0.6, size: game.rng.range(4, 8),
  });
}

// --- Player driving ---------------------------------------------------------
// Arcade physics: accelerate, brake/reverse, steer harder at low speed,
// grip pulls the velocity back toward the heading; handbrake slides.
export function updatePlayerCar(game, dt) {
  const car = game.player.car;
  if (!car) return;
  const input = game.input;
  const move = input.moveVector();
  const def = car.def;
  const forward = move.y < 0 ? 1 : move.y > 0 ? -0.55 : 0; // W = gas, S = brake/reverse
  if (forward > 0) car.speed += def.accel * dt;
  else if (forward < 0) car.speed -= (car.speed > 10 ? def.brake : def.accel * 0.55) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  const handbrake = input.keys.has('Space');
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
  car.speed = Math.max(-140, Math.min(def.topSpeed, car.speed));

  const steer = move.x; // A/D
  const speedFactor = Math.min(1, Math.abs(car.speed) / 160);
  const turnRate = def.grip * speedFactor * (handbrake ? 1.5 : 1) * Math.sign(car.speed || 1);
  car.angle += steer * turnRate * dt;

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const nx = car.x + fx * car.speed * dt;
  const ny = car.y + fy * car.speed * dt;
  const test = { ...car, x: nx, y: ny };
  if (hitsBuilding(game, test) || isWaterAt(game.city, nx, ny)) {
    crashCar(game, car, Math.abs(car.speed) > 180);
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Skid marks while sliding or handbraking at speed.
  if ((handbrake || Math.abs(steer) > 0.5) && Math.abs(car.speed) > 200) {
    game.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 4 });
    if (game.skids.length > 220) game.skids.shift();
  }
  if (Math.abs(car.speed) > 240 && game.rng.chance(0.3)) addDust(game, car.x - fx * 30, car.y - fy * 30);
  if (car.ramCooldown > 0) car.ramCooldown -= dt;

  // Running over pedestrians in the player's car.
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy < 30 * 30 && Math.abs(car.speed) > 60) {
      ped.hp = 0;
      ped.down = 4;
      ped.vx = fx * 320;
      ped.vy = fy * 320;
      ped.scared = 5;
      game.stats.pedsHit += 1;
      game.events.push({ type: 'ped-hit', ped });
      game.audio.crash();
    }
  }
  // Ramming other cars.
  for (const other of game.cars) {
    if (other === car || other.disabled) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 52 && Math.abs(car.speed) > 120) {
      if (car.ramCooldown <= 0) {
        car.ramCooldown = 0.8;
        other.hp -= 18;
        other.speed = Math.max(0, other.speed - 60);
        crashCar(game, car, false);
        game.events.push({ type: 'rammed', target: other, by: car });
      }
    }
  }
  game.player.x = car.x;
  game.player.y = car.y;
  game.player.angle = car.angle;
  game.audio.setEngine(Math.abs(car.speed) / def.topSpeed, true);
}

// --- Traffic ----------------------------------------------------------------
// A traffic car holds its lane, slows for the car ahead, and at each junction
// picks a new direction (mostly straight on).
function updateTrafficCar(game, car, dt) {
  const rng = game.rng;
  // Slow down for a car ahead in the same lane.
  let ahead = Infinity;
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = car.axis === 'v' ? dy * car.dir : dx * car.dir;
    const across = car.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
    if (along > 0 && along < 90 && across < 40) ahead = Math.min(ahead, along);
  }
  const target = ahead < 70 ? 0 : car.cruise;
  car.speed += Math.max(-260 * dt, Math.min(160 * dt, target - car.speed));

  // At a junction centre, maybe turn.
  const cx = nearestRoadCenter(car.x);
  const cy = nearestRoadCenter(car.y);
  const onJunction = Math.abs(car.x - cx) < 26 && Math.abs(car.y - cy) < 26;
  if (onJunction && game.time > car.turnAt) {
    car.turnAt = game.time + 0.6;
    const roll = rng.next();
    if (roll < 0.16) {
      // Turn left or right: swap axis at the junction.
      const newAxis = car.axis === 'v' ? 'h' : 'v';
      const newDir = rng.chance(0.5) ? 1 : -1;
      car.axis = newAxis;
      car.dir = newDir;
      car.angle = angleOf(newAxis, newDir);
      car.x = cx;
      car.y = cy;
    } else if (roll < 0.2) {
      car.dir *= -1;
      car.angle = angleOf(car.axis, car.dir);
    }
  }
  // Ease back onto the lane centre after a turn.
  const laneTarget = car.axis === 'v' ? cx + (car.dir > 0 ? -22 : 22) : cy + (car.dir > 0 ? 22 : -22);
  if (car.axis === 'v') car.x += (laneTarget - car.x) * Math.min(1, 3 * dt);
  else car.y += (laneTarget - car.y) * Math.min(1, 3 * dt);
  car.angle = angleOf(car.axis, car.dir);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;
  // Keep traffic inside the city.
  if (car.x < 60 || car.x > 3524 || car.y < 60 || car.y > 3524) {
    car.dir *= -1;
    car.angle = angleOf(car.axis, car.dir);
  }
}

// --- Police cars ------------------------------------------------------------
// A police car drives straight at the player, steering at junctions toward
// the road that closes the gap, and rams the player's car (or the player).
function updatePoliceCar(game, car, dt) {
  const p = game.player;
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  car.chaseLost = dist < 700 ? 0 : car.chaseLost + dt;
  // Despawn if it lost the player for a long while and the heat is off.
  if (car.chaseLost > 14 && game.wanted.stars === 0) {
    car.gone = true;
    return;
  }
  const targetSpeed = Math.min(car.def.topSpeed, 240 + game.wanted.stars * 30);
  car.speed += Math.max(-300 * dt, Math.min(280 * dt, targetSpeed - car.speed));
  // Steer toward the player, with a little wobble so it looks human.
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const nx = car.x + fx * car.speed * dt;
  const ny = car.y + fy * car.speed * dt;
  const test = { ...car, x: nx, y: ny };
  if (hitsBuilding(game, test) || isWaterAt(game.city, nx, ny)) {
    car.angle += Math.PI / 2;
    car.speed *= 0.5;
  } else {
    car.x = nx;
    car.y = ny;
  }
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
  // Ram the player's car, or knock the player down on foot.
  if (dist < 58 && car.ramCooldown <= 0) {
    car.ramCooldown = 1.1;
    if (p.inCar && p.car) {
      p.car.hp -= 12;
      game.camera.shake = Math.max(game.camera.shake, 10);
      game.audio.crash();
      addSparks(game, car.x, car.y, 10);
      if (p.car.hp <= 0 && !p.car.disabled) {
        p.car.disabled = true;
        p.car.speed = 0;
        game.events.push({ type: 'car-wrecked', car: p.car });
      }
    } else {
      damagePlayer(game, 14, 'rammed by a police car');
    }
  }
}

export function updateVehicles(game, dt) {
  for (const car of game.cars) {
    if (car.gone || car.disabled) continue;
    if (car.kind === 'player') {
      if (game.player.inCar) updatePlayerCar(game, dt);
    } else if (car.kind === 'police') {
      updatePoliceCar(game, car, dt);
    } else if (car.kind === 'traffic') {
      updateTrafficCar(game, car, dt);
    } else if (car.kind === 'mission' && car.missionCar === 'target' && !car.disabled) {
      // The mission-3 target sedan drives its loop like traffic until stopped.
      updateTrafficCar(game, car, dt);
    }
  }
  // Remove despawned police cars; keep traffic topped up near the player.
  game.cars = game.cars.filter((c) => !c.gone);
  // Keep traffic cars from overlapping each other at junctions.
  for (let i = 0; i < game.cars.length; i += 1) {
    const a = game.cars[i];
    if (a.kind !== 'traffic') continue;
    for (let j = i + 1; j < game.cars.length; j += 1) {
      const b = game.cars[j];
      if (b.kind !== 'traffic') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 50 * 50 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (50 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
  const traffic = game.cars.filter((c) => c.kind === 'traffic').length;
  if (traffic < 22) {
    const p = randomRoadPoint(game.rng, game.city);
    const car = createVehicle(game, game.rng.pick(['sedan', 'taxi', 'van']), p.x, p.y, angleOf(p.axis, p.dir), 'traffic');
    car.axis = p.axis;
    car.dir = p.dir;
    car.speed = car.cruise;
    game.cars.push(car);
  }
  // Smoke from wrecked cars.
  for (const car of game.cars) {
    if (car.disabled && car.hp <= 0 && game.rng.chance(0.1)) {
      game.particles.push({
        kind: 'smoke', x: car.x + game.rng.range(-10, 10), y: car.y + game.rng.range(-10, 10),
        vx: 0, vy: -30, life: 1.2, max: 1.2, size: game.rng.range(6, 12),
      });
    }
  }
}

// A police car appears on a road some distance from the player.
export function spawnPoliceCar(game) {
  const rng = game.rng;
  const p = randomRoadPoint(rng, game.city);
  // Prefer a road point not too close and not too far.
  let best = p;
  let bestScore = -1;
  for (let i = 0; i < 8; i += 1) {
    const q = randomRoadPoint(rng, game.city);
    const d = Math.hypot(q.x - game.player.x, q.y - game.player.y);
    const score = d > 500 && d < 1100 ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  const car = createVehicle(game, 'police', best.x, best.y, Math.atan2(game.player.y - best.y, game.player.x - best.x), 'police');
  car.speed = 200;
  game.cars.push(car);
  game.audio.siren(true);
  return car;
}
