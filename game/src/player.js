// Raka, the player: on foot he walks and runs, punches and shoots;
// near a car he can get in and drive it. Health, cash and ammo live here.
import { PLAYER_CFG } from './config.js';
import { isWaterAt, resolveBuildings } from './world.js';
import { nearestCar } from './vehicles.js';
import { addWanted, scarePedsNear } from './peds.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2, // facing up the street
    hp: PLAYER_CFG.maxHp,
    cash: 150,
    ammo: 24,
    inCar: false,
    car: null, // the vehicle he drives, when inCar
    speed: 0,
    invulnerable: 0,
    lastHurt: -99,
    punchTimer: 0,
    muzzle: 0, // frames left of the muzzle flash
  };
}

// Move on foot: WASD, Shift to run, blocked by buildings and water.
export function updatePlayerOnFoot(game, dt) {
  const p = game.player;
  const input = game.input;
  const move = input.moveVector();
  const speed = input.running() ? PLAYER_CFG.runSpeed : PLAYER_CFG.walkSpeed;
  if (move.x !== 0 || move.y !== 0) {
    p.angle = Math.atan2(move.y, move.x);
    let nx = p.x + move.x * speed * dt;
    let ny = p.y + move.y * speed * dt;
    // Step each axis separately so walls slide instead of sticking.
    const rx = resolveBuildings(game.city, nx, p.y, PLAYER_CFG.radius);
    nx = rx.x;
    const ry = resolveBuildings(game.city, nx, ny, PLAYER_CFG.radius);
    ny = ry.y;
    if (!isWaterAt(game.city, nx, ny)) {
      p.x = nx;
      p.y = ny;
    }
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  if (p.invulnerable > 0) p.invulnerable -= dt;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.muzzle > 0) p.muzzle -= dt;
  // Slow health recovery once the heat is off.
  if (game.time - p.lastHurt > 8 && p.hp < PLAYER_CFG.maxHp) {
    p.hp = Math.min(PLAYER_CFG.maxHp, p.hp + 1.2 * dt);
  }
}

// Get in the nearest car (E). Stealing a car that is not yours raises the wanted level.
export function tryEnterCar(game) {
  const p = game.player;
  if (p.inCar) return false;
  const car = nearestCar(game, p.x, p.y, 70);
  if (!car || car.disabled) return false;
  p.inCar = true;
  p.car = car;
  car.kind = 'player';
  car.driver = 'player';
  if (car.stolen !== true) {
    car.stolen = true;
    game.stats.carsStolen += 1;
    if (car.type !== 'mission') {
      addWanted(game, 1, 'stole a car');
      game.events.push({ type: 'stole-car', car });
    }
    game.audio.pickup();
  }
  return true;
}

export function exitCar(game) {
  const p = game.player;
  if (!p.inCar || !p.car) return false;
  const car = p.car;
  car.speed = 0;
  car.driver = null;
  // Step out beside the car, clear of buildings.
  const side = Math.PI / 2;
  const ox = car.x + Math.cos(car.angle + side) * 40;
  const oy = car.y + Math.sin(car.angle + side) * 40;
  const spot = resolveBuildings(game.city, ox, oy, PLAYER_CFG.radius);
  p.x = spot.x;
  p.y = spot.y;
  p.angle = car.angle;
  p.inCar = false;
  p.car = null;
  return true;
}

// Punch (Space): hurts the nearest person in front, scares the crowd.
export function playerPunch(game) {
  const p = game.player;
  if (p.inCar || p.punchTimer > 0) return;
  p.punchTimer = 0.35;
  game.audio.punch();
  const px = p.x + Math.cos(p.angle) * PLAYER_CFG.punchRange;
  const py = p.y + Math.sin(p.angle) * PLAYER_CFG.punchRange;
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    const dx = ped.x - px;
    const dy = ped.y - py;
    if (dx * dx + dy * dy < 30 * 30) {
      ped.hp -= PLAYER_CFG.punchDamage;
      ped.down = ped.hp <= 0 ? 2.5 : 1.2;
      ped.vx = Math.cos(p.angle) * 260;
      ped.vy = Math.sin(p.angle) * 260;
      ped.scared = 4;
      addWanted(game, 1, 'beat someone up');
      game.events.push({ type: 'punched', ped });
      break;
    }
  }
  scarePedsNear(game, p.x, p.y, 260);
}

// Shoot (click): a bullet toward the mouse, with a muzzle flash and noise.
export function playerShoot(game, wx, wy) {
  const p = game.player;
  if (p.inCar || p.ammo <= 0) {
    if (p.ammo <= 0) game.audio.click();
    return false;
  }
  p.ammo -= 1;
  p.muzzle = 0.07;
  const angle = Math.atan2(wy - p.y, wx - p.x);
  p.angle = angle;
  game.bullets.push({
    x: p.x + Math.cos(angle) * 22,
    y: p.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * PLAYER_CFG.bulletSpeed,
    vy: Math.sin(angle) * PLAYER_CFG.bulletSpeed,
    life: PLAYER_CFG.bulletRange / PLAYER_CFG.bulletSpeed,
    from: 'player',
    damage: PLAYER_CFG.pistolDamage,
  });
  game.audio.shot();
  game.stats.shotsFired += 1;
  game.events.push({ type: 'shot-fired', x: p.x, y: p.y });
  addWanted(game, 1, 'fired a gun');
  scarePedsNear(game, p.x, p.y, 420);
  return true;
}

export function damagePlayer(game, amount, cause) {
  const p = game.player;
  if (p.invulnerable > 0 || game.screen !== 'play') return;
  p.hp -= amount;
  p.lastHurt = game.time;
  game.camera.shake = Math.max(game.camera.shake, 6);
  if (p.hp <= 0) {
    p.hp = 0;
    game.events.push({ type: 'player-down', cause });
  }
}

export function healPlayer(game, amount) {
  game.player.hp = Math.min(PLAYER_CFG.maxHp, game.player.hp + amount);
}
