// The story: Raka, a driver new to Solmar, owes money and takes jobs from
// Mara, a fixer who runs the east-side garage. Six jobs, each with an
// on-screen objective, a map marker, dialogue and a cash reward.
// Completing a job unlocks the next; failing one lets the player retry.
import { CAR_TYPES } from './config.js';
import { createVehicle } from './vehicles.js';
import { addWanted } from './peds.js';
import { resolveBuildings } from './world.js';

export const MISSION_COUNT = 6;

function say(game, lines) {
  game.dialogue.lines = lines;
  game.dialogue.index = 0;
  game.dialogue.timer = 0;
}

// The six jobs. Targets are resolved against the city's locations when a job starts.
export const MISSION_DEFS = [
  {
    title: 'First Job',
    reward: 200,
    intro: [
      'MARA: Raka. You owe me, and Solmar owes you nothing.',
      'MARA: My sedan is parked by the taxi stand. Drive it to my garage, east side.',
      'RAKA: One job and we are even?',
      'MARA: One job and we start talking. Go.',
    ],
    objective: 'Get in Mara\'s sedan, then drive to the garage',
  },
  {
    title: 'Pizza Run',
    reward: 350,
    intro: [
      'MARA: The pizza place lost its driver. You are the driver now.',
      'MARA: Three drops, two and a half minutes. Cold pizza, no pay.',
    ],
    objective: 'Deliver to all 3 drop points before the timer ends',
  },
  {
    title: 'Hot Wheels',
    reward: 500,
    intro: [
      'MARA: A red sports car is parked at the beach lot. Bring it to me.',
      'MARA: The owner will not be happy. Lose the cops first — then come to the garage.',
    ],
    objective: 'Steal the red sports car, lose the cops, bring it to the garage',
  },
  {
    title: 'The Chase',
    reward: 600,
    intro: [
      'MARA: A blue sedan is carrying my package around the city. Stop it.',
      'MARA: Ram it three times to make it pull over, then grab the package.',
    ],
    objective: 'Ram the blue sedan 3 times, then pick up the package',
  },
  {
    title: 'Hold the Line',
    reward: 700,
    intro: [
      'MARA: Rivals want my park kiosk. They sent men with guns.',
      'MARA: Hold the kiosk. Make them regret it. I left a first-aid kit by the fountain.',
    ],
    objective: 'Defend the park kiosk — take down all the thugs',
  },
  {
    title: 'The Getaway',
    reward: 1000,
    intro: [
      'MARA: This is the last one, Raka. Pick me up at the pier.',
      'MARA: The whole city will be looking for us. Get me to the safehouse and the debt is gone.',
    ],
    objective: 'Pick up Mara at the pier, then reach the safehouse',
  },
];

function marker(game, x, y, label) {
  game.mission.target = { x, y, label };
}

export function startMission(game, index) {
  const def = MISSION_DEFS[index];
  const loc = game.city.locations;
  const m = game.mission;
  m.index = index;
  m.step = 0;
  m.active = true;
  m.done = false;
  m.failed = false;
  m.timer = 0;
  m.count = 0;
  m.def = def;
  m.target = null;
  say(game, def.intro);
  if (index === 0) {
    // Mara's sedan waits by the taxi stand, marked for the player.
    const car = createVehicle(game, 'sedan', 940, 1240, -Math.PI / 2, 'mission');
    car.color = '#3f7a4a';
    car.roof = '#2c5a36';
    car.missionCar = 'maras';
    game.cars.push(car);
    m.car = car;
    marker(game, car.x, car.y, "Mara's sedan");
  } else if (index === 1) {
    m.timer = 150;
    m.drops = [
      { x: 492, y: 940 },
      { x: 2732, y: 492 },
      { x: 2284, y: 2732 },
    ];
    m.dropIndex = 0;
    marker(game, m.drops[0].x, m.drops[0].y, 'Drop 1 of 3');
  } else if (index === 2) {
    const car = createVehicle(game, 'sports', loc.beachLot.x, loc.beachLot.y, 0, 'mission');
    car.missionCar = 'sports';
    game.cars.push(car);
    m.car = car;
    marker(game, car.x, car.y, 'Red sports car');
  } else if (index === 3) {
    const car = createVehicle(game, 'sedan', 1836, 940, 0, 'mission');
    car.color = '#3a6fd9';
    car.roof = '#2a55a8';
    car.missionCar = 'target';
    car.cruise = 150;
    game.cars.push(car);
    m.car = car;
    m.targetCar = car;
    marker(game, car.x, car.y, 'Blue sedan — ram it');
  } else if (index === 4) {
    // Two waves of thugs around the park kiosk.
    m.wave = 0;
    m.toSpawn = 3;
    spawnThugWave(game, loc.parkKiosk);
    marker(game, loc.parkKiosk.x, loc.parkKiosk.y, 'Defend the kiosk');
  } else if (index === 5) {
    marker(game, loc.pier.x, loc.pier.y, 'Pick up Mara');
  }
  game.events.push({ type: 'mission-started', index });
}

function spawnThugWave(game, at) {
  const rng = game.rng;
  for (let i = 0; i < 3; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(220, 340);
    let x = at.x + Math.cos(angle) * dist;
    let y = at.y + Math.sin(angle) * dist;
    // Never spawn inside a building: push out to the nearest open spot.
    const spot = resolveBuildings(game.city, x, y, 12);
    x = spot.x;
    y = spot.y;
    const ped = {
      id: 9000 + game.mission.wave * 10 + i,
      kind: 'thug',
      x, y,
      angle: Math.atan2(at.y - y, at.x - x),
      speed: 0,
      hp: 60,
      down: 0,
      scared: 0,
      vx: 0, vy: 0,
      walkPhase: 0,
      target: null,
      shootTimer: rng.range(0.4, 1.2),
      shirt: '#3a3a3a',
      skin: '#c98d5f',
      hat: false,
      thug: true,
    };
    game.peds.push(ped);
  }
  game.mission.wave += 1;
}

function completeMission(game) {
  const m = game.mission;
  m.active = false;
  m.done = true;
  game.player.cash += m.def.reward;
  game.stats.missionsDone += 1;
  game.audio.missionDone();
  game.toast = `Job done: ${m.def.title} — +$${m.def.reward}`;
  game.toastTimer = 4;
  say(game, [`MARA: Good work, Raka. $${m.def.reward} is yours.`]);
  game.events.push({ type: 'mission-complete', index: m.index });
  // The next job starts after the player has a breath.
  m.nextTimer = 5;
}

export function failMission(game, reason) {
  const m = game.mission;
  m.active = false;
  m.failed = true;
  game.toast = `Job failed: ${reason} — press R to retry`;
  game.toastTimer = 5;
  say(game, ['MARA: That was not the plan. Try again, Raka.']);
  game.events.push({ type: 'mission-failed', index: m.index, reason });
}

export function retryMission(game) {
  const m = game.mission;
  if (m.index >= 0) startMission(game, m.index);
}

function near(game, x, y, radius) {
  const p = game.player;
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy < radius * radius;
}

export function updateMissions(game, dt) {
  const m = game.mission;
  // Count down to the next job after one is finished.
  if (!m.active && m.done && m.nextTimer !== undefined && m.nextTimer > 0) {
    m.nextTimer -= dt;
    if (m.nextTimer <= 0) {
      m.nextTimer = 0;
      if (m.index + 1 < MISSION_COUNT) startMission(game, m.index + 1);
      else game.events.push({ type: 'story-complete' });
    }
    return;
  }
  if (!m.active) return;
  const loc = game.city.locations;
  const p = game.player;

  if (m.index === 0) {
    if (m.step === 0) {
      // Wait until the player is in Mara's sedan.
      if (p.inCar && p.car && p.car.missionCar === 'maras') {
        m.step = 1;
        marker(game, loc.marasGarage.x, loc.marasGarage.y, "Mara's garage");
        say(game, ['MARA: Good. Now east side — my garage, by the big road.']);
      }
    } else if (near(game, loc.marasGarage.x, loc.marasGarage.y, 70)) {
      completeMission(game);
    }
  } else if (m.index === 1) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(game, 'the pizzas went cold');
      return;
    }
    if (near(game, m.drops[m.dropIndex].x, m.drops[m.dropIndex].y, 60)) {
      game.player.cash += 40;
      game.audio.pickup();
      m.dropIndex += 1;
      if (m.dropIndex >= m.drops.length) completeMission(game);
      else marker(game, m.drops[m.dropIndex].x, m.drops[m.dropIndex].y, `Drop ${m.dropIndex + 1} of 3`);
    }
  } else if (m.index === 2) {
    if (m.step === 0) {
      if (p.inCar && p.car && p.car.missionCar === 'sports') {
        m.step = 1;
        addWanted(game, 1, 'stole the sports car');
        say(game, ['MARA: That is the one. Now shake the cops, then bring it to my garage.']);
      }
    } else if (m.step === 1) {
      if (game.wanted.stars === 0) {
        m.step = 2;
        marker(game, loc.marasGarage.x, loc.marasGarage.y, "Mara's garage");
        say(game, ['MARA: Clean. Now the garage, east side.']);
      }
    } else if (p.inCar && p.car && p.car.missionCar === 'sports' && near(game, loc.marasGarage.x, loc.marasGarage.y, 70)) {
      completeMission(game);
    }
  } else if (m.index === 3) {
    const car = m.targetCar;
    if (car && car.hp <= 0 && !car.disabled) {
      car.disabled = true;
      car.speed = 0;
    }
    if (m.step === 0 && car) {
      // Keep the marker glued to the moving target sedan.
      marker(game, car.x, car.y, 'Blue sedan — ram it');
    }
    if (m.step === 1 && near(game, m.package.x, m.package.y, 50)) {
      completeMission(game);
    }
  } else if (m.index === 4) {
    const alive = game.peds.filter((d) => d.kind === 'thug' && d.hp > 0).length;
    if (alive === 0 && m.wave === 1 && m.step === 0) {
      m.step = 1;
      spawnThugWave(game, loc.parkKiosk);
      say(game, ['MARA: More of them, from the north path!']);
    } else if (alive === 0 && m.wave === 2) {
      completeMission(game);
    }
  } else if (m.index === 5) {
    if (m.step === 0) {
      if (near(game, loc.pier.x, loc.pier.y, 60)) {
        m.step = 1;
        addWanted(game, 3, 'the getaway');
        marker(game, loc.safehouse.x, loc.safehouse.y, 'Safehouse');
        say(game, [
          'MARA: Get in, Raka. Drive!',
          'MARA: Three stars already. The safehouse is north-east. Do not stop.',
        ]);
        game.audio.siren(true);
      }
    } else if (near(game, loc.safehouse.x, loc.safehouse.y, 70)) {
      completeMission(game);
      game.events.push({ type: 'story-complete' });
    }
  }

  // Mission 3: count rams on the target sedan.
  for (const ev of game.events) {
    if (ev.type === 'rammed' && m.index === 3 && m.step === 0 && ev.target === m.targetCar) {
      m.count += 1;
      game.toast = `Ram ${m.count} of 3`;
      game.toastTimer = 2;
      if (m.count >= 3) {
        m.step = 1;
        m.targetCar.disabled = true;
        m.targetCar.speed = 0;
        m.package = { x: m.targetCar.x + 40, y: m.targetCar.y + 40 };
        marker(game, m.package.x, m.package.y, 'Grab the package');
        say(game, ['MARA: It stopped! Grab the package and go.']);
      }
    }
  }
}

export function missionObjectiveText(game) {
  const m = game.mission;
  if (!m.active || !m.def) return '';
  let text = m.def.objective;
  if (m.index === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (m.index === 3 && m.step === 0) text += ` — ${m.count}/3 rams`;
  if (m.index === 4) {
    const alive = game.peds.filter((d) => d.kind === 'thug' && d.hp > 0).length;
    text += ` — ${alive} left`;
  }
  return text;
}
