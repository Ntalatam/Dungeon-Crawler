// Tile types
export const TILE = {
  WALL: 0,
  FLOOR: 1,
  CORRIDOR: 2,
  DOOR: 3,
  STAIRS_DOWN: 4,
  STAIRS_UP: 5
};

// Color palette
export const COLORS = {
  BG: '#1a1a2e',
  WALL: '#4a4e69',
  WALL_TOP: '#6a6e8a',
  FLOOR: '#22223b',
  FLOOR_LIT: '#f2e9e4',
  CORRIDOR: '#2d2d44',
  CORRIDOR_LIT: '#d4c5b9',
  DOOR: '#8b6914',
  PLAYER: '#ffd60a',
  PLAYER_GLOW: 'rgba(255, 214, 10, 0.3)',
  SKELETON: '#c9ada7',
  GOBLIN: '#52b788',
  TROLL: '#6d4c41',
  ELITE_SKELETON: '#e8d5cc',
  ELITE_GOBLIN: '#2d8a5e',
  ELITE_TROLL: '#8b3a2a',
  ITEM_WEAPON: '#90e0ef',
  ITEM_POTION: '#e63946',
  ITEM_SCROLL: '#b185db',
  STAIRS: '#ffc300',
  STAIRS_LOCKED: '#666666',
  KEY: '#ffd700',
  HUD_BG: '#0d0d1a',
  HUD_TEXT: '#f2e9e4',
  HP_BAR: '#e63946',
  HP_BAR_BG: '#4a1a1a',
  XP_BAR: '#ffd60a',
  XP_BAR_BG: '#4a4a1a',
  MINIMAP_BG: 'rgba(13, 13, 26, 0.8)',
  DAMAGE_TEXT: '#e63946',
  HEAL_TEXT: '#06d6a0',
  LEVEL_UP_TEXT: '#ffd60a'
};

// Game configuration
export const CONFIG = {
  TILE_SIZE: 32,
  FOV_RADIUS: 8,
  MAP_WIDTH: 80,
  MAP_HEIGHT: 50,
  MIN_PARTITION_SIZE: 10,
  MIN_ROOM_SIZE: 6,
  MAX_BSP_DEPTH: 5,
  GAME_TICK_MS: 100,
  SKELETON_MOVE_MS: 600,
  GOBLIN_MOVE_MS: 300,
  TROLL_MOVE_MS: 900,
  MAX_FLOORS: 5,
  MAX_PLAYER_LEVEL: 7,
  XP_THRESHOLDS: [0, 10, 25, 45, 70, 100, 140],
  CAMERA_LERP: 0.15,
  HUD_HEIGHT: 68,
  MINIMAP_WIDTH: 400,
  MINIMAP_HEIGHT: 260,
  MINIMAP_SCALE: 5,
  MOVE_COOLDOWN_MS: 85,
  MESSAGE_DISPLAY_TIME: 3000,
  MAX_MESSAGES: 3,
  ENEMY_FOV_RANGE: 6,
  PATHFIND_RANGE: 15,
  MAX_PATH_LENGTH: 20,
  PATHFIND_INTERVAL: 500,
  HIT_CHANCE: 0.85,
  LOOT_DROP_CHANCE: 0.20,
  POTION_HEAL: 15,
  BLIND_DURATION: 5000
};

// Difficulty scaling per floor
export const FLOOR_CONFIG = [
  null, // index 0 unused
  { enemyMin: 5, enemyMax: 8, types: ['skeleton', 'goblin'], itemDensity: 'high', keysRequired: 1, miniBossChance: 0 },
  { enemyMin: 8, enemyMax: 12, types: ['skeleton', 'goblin'], itemDensity: 'medium', keysRequired: 1, miniBossChance: 0.10 },
  { enemyMin: 10, enemyMax: 15, types: ['skeleton', 'goblin', 'troll'], trollMax: 2, itemDensity: 'medium', keysRequired: 2, miniBossChance: 0.15 },
  { enemyMin: 12, enemyMax: 18, types: ['skeleton', 'goblin', 'troll'], trollMax: 4, itemDensity: 'low', keysRequired: 2, miniBossChance: 0.20 },
  { enemyMin: 15, enemyMax: 20, types: ['skeleton', 'goblin', 'troll'], trollMax: 6, boss: true, itemDensity: 'low', keysRequired: 3, miniBossChance: 0.25 }
];

// Enemy stats
export const ENEMY_STATS = {
  skeleton: { name: 'Skeleton', hp: 38, damage: 4, xp: 5, moveMs: 600, color: COLORS.SKELETON, flees: false },
  goblin: { name: 'Goblin', hp: 15, damage: 3, xp: 3, moveMs: 300, color: COLORS.GOBLIN, flees: true },
  troll: { name: 'Troll', hp: 75, damage: 8, xp: 12, moveMs: 900, color: COLORS.TROLL, flees: false }
};

// Weapon definitions
export const WEAPONS = {
  fists: { name: 'Fists', minDamage: 1, maxDamage: 2, speedBonus: 0, minFloor: 1 },
  dagger: { name: 'Dagger', minDamage: 1, maxDamage: 4, speedBonus: 1, minFloor: 1 },
  shortsword: { name: 'Shortsword', minDamage: 2, maxDamage: 6, speedBonus: 0, minFloor: 1 },
  longsword: { name: 'Longsword', minDamage: 3, maxDamage: 8, speedBonus: 0, minFloor: 2 },
  battleaxe: { name: 'Battle Axe', minDamage: 5, maxDamage: 12, speedBonus: -1, minFloor: 3 }
};

// Game states
export const STATE = {
  MAIN_MENU: 'MAIN_MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_TRANSITION: 'LEVEL_TRANSITION',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY'
};

// AI states
export const AI_STATE = {
  IDLE: 'IDLE',
  PATROL: 'PATROL',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  FLEEING: 'FLEEING'
};
