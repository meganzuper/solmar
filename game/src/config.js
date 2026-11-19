// SOLMAR — configuration: every tunable number of the game in one place.
// A sun-soaked coastal city, an original open world: no real places, no real brands.
export const STEP = 1 / 60;

// The city is a grid: roads every PITCH px, ROAD_W wide, blocks of BLOCK between them.
export const WORLD_SIZE = 3584;
export const PITCH = 448;
export const ROAD_W = 88;
export const BLOCK = 360;
export const ROAD_CENTERS = [492, 940, 1388, 1836, 2284, 2732, 3180]; // 7 roads; west of the first is the river
export const LANE = 22; // lane offset from a road's centre (right-hand traffic)

// Palette: warm Mediterranean sun, teal sea, terracotta roofs.
export const COLORS = {
  grass: '#7fae62',
  grassDark: '#74a258',
  sand: '#e8d29a',
  sea: '#2f7fa8',
  seaDeep: '#256b8f',
  road: '#3d3a38',
  roadEdge: '#57524e',
  sidewalk: '#b9b2a4',
  laneMark: '#e8d76a',
  park: '#5d9b4a',
  parkPath: '#cbb98d',
  buildingRoof: ['#b5543c', '#c97a4a', '#8a6f4d', '#5d7d8a', '#a34a52', '#d9a441'],
  buildingWall: ['#e8dcc8', '#dcc7a8', '#f0e6d2', '#cbb79a'],
  plaza: '#cfc3ab',
  pier: '#8a6a48',
};

export const PLAYER_CFG = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 13,
  maxHp: 100,
  punchDamage: 20,
  punchRange: 34,
  pistolDamage: 26,
  bulletSpeed: 950,
  bulletRange: 560,
};

// Cars: length runs along the heading, width across it.
export const CAR_TYPES = {
  sedan: { name: 'Sedan', topSpeed: 330, accel: 215, brake: 430, grip: 2.7, color: '#c94f43', roof: '#a83a30', w: 46, l: 84 },
  taxi: { name: 'Taxi', topSpeed: 320, accel: 205, brake: 430, grip: 2.7, color: '#e8b93b', roof: '#c79a24', w: 46, l: 84 },
  van: { name: 'Van', topSpeed: 260, accel: 150, brake: 380, grip: 2.2, color: '#7d8a99', roof: '#66727f', w: 50, l: 98 },
  sports: { name: 'Sports', topSpeed: 440, accel: 310, brake: 490, grip: 3.5, color: '#d21f3c', roof: '#a3122a', w: 44, l: 82 },
  police: { name: 'Police', topSpeed: 385, accel: 285, brake: 470, grip: 3.3, color: '#2b4a8f', roof: '#1d3566', w: 46, l: 86 },
};

export const PRICES = {
  ammo: 50, ammoAmount: 24,
  heal: 80,
  repair: 100,
};

export const SAVE_KEY = 'solmar-save-v1';
export const GAME_TITLE = 'SOLMAR';
export const GAME_SUBTITLE = 'A coastal city. A debt to pay. Six jobs.';
