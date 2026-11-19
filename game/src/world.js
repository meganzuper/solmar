// The city of Solmar: a seeded grid of roads, blocks and buildings, a park,
// a plaza, a beach and sea along the south edge, a river along the west edge
// crossed by one bridge, a pier, and the shops and story locations.
// Pure data and queries here — no drawing, no browser.
import { BLOCK, COLORS, PITCH, ROAD_CENTERS, ROAD_W, WORLD_SIZE } from './config.js';

// West river: x in [0, 150], except the bridge band on the road at y = 1388.
const RIVER_X1 = 150;
const BRIDGE_Y = 1388;
const BRIDGE_HALF = 44;
// South sea: y past SEA_Y0 is water; SAND_Y0..SEA_Y0 is beach.
const SAND_Y0 = 3224;
const SEA_Y0 = 3460;

function blockOrigin(index) {
  return ROAD_W + index * PITCH;
}

// One building inside a block: a solid box the player and cars bump into.
function makeBuilding(rng, bx, by, bw, bh) {
  const w = rng.range(90, Math.min(200, bw - 40));
  const h = rng.range(90, Math.min(200, bh - 40));
  const x = bx + rng.range(20, bw - w - 20);
  const y = by + rng.range(20, bh - h - 20);
  return {
    x, y, w, h,
    height: rng.int(14, 46),
    roof: rng.pick(COLORS.buildingRoof),
    wall: rng.pick(COLORS.buildingWall),
  };
}

export function generateCity(rng) {
  const blocks = [];
  const buildings = [];
  const trees = [];
  // Park block (col 4, row 3) and plaza block (col 3, row 4); the bottom row is beach.
  const park = { col: 4, row: 3 };
  const plaza = { col: 3, row: 4 };
  for (let col = 0; col < 8; col += 1) {
    for (let row = 0; row < 8; row += 1) {
      const bx = blockOrigin(col);
      const by = blockOrigin(row);
      let kind = 'normal';
      if (row === 7) kind = 'beach';
      else if (col === park.col && row === park.row) kind = 'park';
      else if (col === plaza.col && row === plaza.row) kind = 'plaza';
      const block = { col, row, x: bx, y: by, w: BLOCK, h: BLOCK, kind, buildings: [] };
      if (kind === 'normal') {
        // The first column of blocks borders the river: keep buildings east of it.
        const bx2 = col === 0 ? bx + 90 : bx;
        const bw2 = col === 0 ? BLOCK - 90 : BLOCK;
        const count = rng.int(1, 3);
        for (let i = 0; i < count; i += 1) {
          const b = makeBuilding(rng, bx2, by, bw2, BLOCK);
          // Keep buildings from overlapping each other.
          if (block.buildings.some((o) => b.x < o.x + o.w + 16 && b.x + b.w + 16 > o.x && b.y < o.y + o.h + 16 && b.y + b.h + 16 > o.y)) continue;
          block.buildings.push(b);
          buildings.push(b);
        }
        if (block.buildings.length === 0) {
          const b = makeBuilding(rng, bx2, by, bw2, BLOCK);
          block.buildings.push(b);
          buildings.push(b);
        }
      } else if (kind === 'park') {
        for (let i = 0; i < 14; i += 1) {
          trees.push({ x: bx + rng.range(30, BLOCK - 30), y: by + rng.range(30, BLOCK - 30), r: rng.range(14, 24) });
        }
      }
      blocks.push(block);
    }
  }

  // Beach umbrellas and palms along the sand.
  const umbrellas = [];
  for (let i = 0; i < 10; i += 1) {
    umbrellas.push({ x: 200 + rng.range(0, WORLD_SIZE - 400), y: SAND_Y0 + rng.range(40, 160) });
  }

  // Shops on sidewalk corners, and the story locations (all on roads or sidewalks).
  const shops = [
    { id: 'ammo', kind: 'ammo', name: 'AMMO', x: 940, y: 900, label: 'Ammo Store — buy bullets' },
    { id: 'clinic', kind: 'clinic', name: 'CLINIC', x: 2284, y: 1344, label: 'Clinic — heal up' },
    { id: 'garage', kind: 'garage', name: 'GARAGE', x: 2732, y: 2240, label: 'Garage — repair your car' },
  ];
  const locations = {
    spawn: { x: 940, y: 1388 }, // Raka starts on the road by the park
    marasGarage: { x: 3180, y: 2284 }, // Mara's garage, east side
    safehouse: { x: 3180, y: 492 }, // the safehouse, north-east
    beachLot: { x: 1836, y: 3300 }, // beach car park where the sports car waits
    parkKiosk: { x: 1836 + 180, y: 1388 + 180 }, // kiosk inside the park block
    pier: { x: 1836, y: 3440 }, // end of the pier, over the sea
    marina: { x: 492, y: 3300 },
  };

  return {
    size: WORLD_SIZE,
    roadsV: ROAD_CENTERS.slice(),
    roadsH: ROAD_CENTERS.slice(),
    blocks,
    buildings,
    trees,
    umbrellas,
    shops,
    locations,
    park: { x: blockOrigin(park.col), y: blockOrigin(park.row), w: BLOCK, h: BLOCK },
    plaza: { x: blockOrigin(plaza.col), y: blockOrigin(plaza.row), w: BLOCK, h: BLOCK },
  };
}

// --- Queries ---------------------------------------------------------------

export function isWaterAt(city, x, y) {
  if (y >= SEA_Y0) return true;
  if (x < RIVER_X1 && Math.abs(y - BRIDGE_Y) > BRIDGE_HALF) return true;
  return false;
}

export function isBeachAt(city, x, y) {
  return y >= SAND_Y0 && y < SEA_Y0;
}

export function isRoadAt(city, x, y) {
  for (const c of city.roadsV) if (Math.abs(x - c) <= ROAD_W / 2) return true;
  for (const c of city.roadsH) if (Math.abs(y - c) <= ROAD_W / 2) return true;
  return false;
}

export function nearestRoadCenter(value) {
  let best = ROAD_CENTERS[0];
  for (const c of ROAD_CENTERS) if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  return best;
}

// The building (if any) whose box a circle at (x, y) with radius r touches.
export function buildingAt(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps; returns the corrected point.
export function resolveBuildings(city, x, y, r) {
  for (let pass = 0; pass < 2; pass += 1) {
    const b = buildingAt(city, x, y, r);
    if (!b) break;
    const dxLeft = x + r - b.x;
    const dxRight = b.x + b.w + r - x;
    const dyTop = y + r - b.y;
    const dyBottom = b.y + b.h + r - y;
    const m = Math.min(dxLeft, dxRight, dyTop, dyBottom);
    if (m === dxLeft) x = b.x - r;
    else if (m === dxRight) x = b.x + b.w + r;
    else if (m === dyTop) y = b.y - r;
    else y = b.y + b.h + r;
  }
  return { x, y };
}

// A point on a random road, with its axis and driving direction.
export function randomRoadPoint(rng, city) {
  if (rng.chance(0.5)) {
    const cx = rng.pick(city.roadsV);
    return { x: cx + (rng.chance(0.5) ? -22 : 22), y: rng.range(80, WORLD_SIZE - 80), axis: 'v', dir: rng.chance(0.5) ? 1 : -1 };
  }
  const cy = rng.pick(city.roadsH);
  return { x: rng.range(80, WORLD_SIZE - 80), y: cy + (rng.chance(0.5) ? -22 : 22), axis: 'h', dir: rng.chance(0.5) ? 1 : -1 };
}

// A point on a sidewalk beside a random road (where pedestrians walk).
export function randomSidewalkPoint(rng, city) {
  if (rng.chance(0.5)) {
    const cx = rng.pick(city.roadsV);
    return { x: cx + (rng.chance(0.5) ? -56 : 56), y: rng.range(80, WORLD_SIZE - 80) };
  }
  const cy = rng.pick(city.roadsH);
  return { x: rng.range(80, WORLD_SIZE - 80), y: cy + (rng.chance(0.5) ? -56 : 56) };
}

// A road point at least `minDist` from (x, y) — where police cars appear.
export function roadPointFarFrom(rng, city, x, y, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const p = randomRoadPoint(rng, city);
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy > minDist * minDist) return p;
  }
  return randomRoadPoint(rng, city);
}
