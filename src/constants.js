// Tile types
export const TILE = {
  WALL: 0,
  FLOOR: 1,
  CORRIDOR: 2,
  DOOR: 3,
  STAIRS_DOWN: 4,
  STAIRS_UP: 5,
  LAVA: 6,
  ICE: 7,
  SPIKE_TRAP: 8
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
  ARCHER: '#d4a574',
  ELITE_SKELETON: '#e8d5cc',
  ELITE_GOBLIN: '#2d8a5e',
  ELITE_TROLL: '#8b3a2a',
  ELITE_ARCHER: '#e8c090',
  ITEM_WEAPON: '#90e0ef',
  ITEM_POTION: '#e63946',
  ITEM_SCROLL: '#b185db',
  ITEM_ARMOR: '#c0c0c0',
  ITEM_GOLD: '#f4d35e',
  ITEM_WARDING: '#b8c0ff',
  ITEM_SWIFT: '#4cc9f0',
  STAIRS: '#ffc300',
  STAIRS_LOCKED: '#666666',
  KEY: '#ffd700',
  LAVA: '#cc3300',
  LAVA_GLOW: '#ff6600',
  ICE: '#a8d8ea',
  SPIKE_TRAP: '#888888',
  ROOM_VAULT: '#d6b85a',
  ROOM_GUARDPOST: '#b25c5c',
  ROOM_SANCTUARY: '#4cc9b0',
  FEATURE_FOUNTAIN: '#6ee7ff',
  FEATURE_SHRINE: '#ffd166',
  FEATURE_MERCHANT: '#7bd389',
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
  SKELETON_MOVE_MS: 500,
  GOBLIN_MOVE_MS: 300,
  TROLL_MOVE_MS: 700,
  MAX_FLOORS: 5,
  MAX_PLAYER_LEVEL: 7,
  XP_THRESHOLDS: [0, 10, 25, 45, 70, 100, 140],
  CAMERA_LERP: 0.15,
  HUD_HEIGHT: 68,
  MINIMAP_WIDTH: 400,
  MINIMAP_HEIGHT: 260,
  MINIMAP_SCALE: 5,
  MOVE_COOLDOWN_MS: 70,
  MIN_MOVE_COOLDOWN_MS: 38,
  MAX_MOVE_COOLDOWN_MS: 120,
  MESSAGE_DISPLAY_TIME: 4000,
  MAX_MESSAGES: 5,
  ENEMY_FOV_RANGE: 6,
  PATHFIND_RANGE: 15,
  MAX_PATH_LENGTH: 20,
  PATHFIND_INTERVAL: 500,
  HIT_CHANCE: 0.85,
  LOOT_DROP_CHANCE: 0.30,
  POTION_HEAL: 20,
  BLIND_DURATION: 5000,
  ROOM_BANNER_MS: 2800,
  WARD_BLOCK_VALUE: 2,
  FOUNTAIN_WARD_CHARGES: 2
};

// Difficulty scaling per floor
export const FLOOR_CONFIG = [
  null, // index 0 unused
  { enemyMin: 5, enemyMax: 8, types: ['skeleton', 'goblin'], itemDensity: 'high', keysRequired: 1, miniBossChance: 0 },
  { enemyMin: 8, enemyMax: 12, types: ['skeleton', 'goblin', 'archer'], archerMax: 2, itemDensity: 'medium', keysRequired: 1, miniBossChance: 0.10 },
  { enemyMin: 10, enemyMax: 15, types: ['skeleton', 'goblin', 'archer', 'troll'], trollMax: 2, archerMax: 3, itemDensity: 'medium', keysRequired: 2, miniBossChance: 0.15 },
  { enemyMin: 12, enemyMax: 18, types: ['skeleton', 'goblin', 'archer', 'troll'], trollMax: 4, archerMax: 4, itemDensity: 'low', keysRequired: 2, miniBossChance: 0.20 },
  { enemyMin: 15, enemyMax: 20, types: ['skeleton', 'goblin', 'archer', 'troll'], trollMax: 6, archerMax: 5, boss: true, itemDensity: 'low', keysRequired: 3, miniBossChance: 0.25 }
];

// Enemy stats
export const ENEMY_STATS = {
  skeleton: {
    name: 'Skeleton',
    hp: 42,
    damage: 4,
    xp: 5,
    gold: 4,
    defense: 1,
    moveMs: 520,
    color: COLORS.SKELETON,
    flees: false,
    hazardCosts: { lava: 10, ice: 2, spikes: 5 },
    spikeDamageMult: 1.2,
    role: 'anchor'
  },
  goblin: {
    name: 'Goblin',
    hp: 15,
    damage: 3,
    xp: 3,
    gold: 3,
    defense: 0,
    moveMs: 285,
    color: COLORS.GOBLIN,
    flees: true,
    hazardCosts: { lava: 8, ice: 1, spikes: 2 },
    slidesOnIce: true,
    role: 'skirmisher'
  },
  troll: {
    name: 'Troll',
    hp: 82,
    damage: 11,
    xp: 12,
    gold: 8,
    defense: 2,
    moveMs: 720,
    color: COLORS.TROLL,
    flees: false,
    hazardCosts: { lava: 1, ice: 1, spikes: 1 },
    lavaAffinity: true,
    spikeDamageMult: 0.25,
    role: 'juggernaut'
  },
  archer: {
    name: 'Archer',
    hp: 24,
    damage: 5,
    xp: 7,
    gold: 5,
    defense: 0,
    moveMs: 580,
    color: COLORS.ARCHER,
    flees: true,
    ranged: true,
    range: 6,
    hazardCosts: { lava: 14, ice: 4, spikes: 8 },
    prefersHazardBuffer: true,
    role: 'controller'
  }
};

// Weapon definitions
export const WEAPONS = {
  fists: { name: 'Fists', minDamage: 1, maxDamage: 2, speedBonus: 0, hitBonus: 0, reach: 1, minFloor: 1 },
  dagger: { name: 'Dagger', minDamage: 2, maxDamage: 5, speedBonus: 2, hitBonus: 0.03, reach: 1, minFloor: 1 },
  rapier: { name: 'Rapier', minDamage: 2, maxDamage: 5, speedBonus: 3, hitBonus: 0.10, reach: 1, minFloor: 1, rare: true },
  shortsword: { name: 'Shortsword', minDamage: 2, maxDamage: 6, speedBonus: 0, hitBonus: 0.04, reach: 1, minFloor: 1 },
  longsword: { name: 'Longsword', minDamage: 3, maxDamage: 8, speedBonus: 0, hitBonus: 0.06, reach: 1, minFloor: 2 },
  warspear: { name: 'War Spear', minDamage: 3, maxDamage: 7, speedBonus: -1, hitBonus: 0.02, reach: 2, minFloor: 2, rare: true },
  battleaxe: { name: 'Battle Axe', minDamage: 5, maxDamage: 12, speedBonus: -2, hitBonus: -0.04, reach: 1, armorPierce: 1, minFloor: 3 },
  maul: { name: 'War Maul', minDamage: 6, maxDamage: 10, speedBonus: -3, hitBonus: -0.06, reach: 1, armorPierce: 2, minFloor: 3, rare: true },
  cursed_blade: { name: 'Cursed Blade', minDamage: 6, maxDamage: 14, speedBonus: 1, hitBonus: 0.08, reach: 1, minFloor: 2, cursed: true, hpDrain: 2, rare: true }
};

// Armor definitions
export const ARMORS = {
  leather: { name: 'Leather Armor', defense: 1, moveBonus: 1, minFloor: 1 },
  chainmail: { name: 'Chainmail', defense: 2, moveBonus: 0, minFloor: 2 },
  brigandine: { name: 'Brigandine', defense: 2, moveBonus: 1, minFloor: 2, rare: true },
  plate: { name: 'Plate Armor', defense: 4, moveBonus: -1, minFloor: 3 },
  dragonscale: { name: 'Dragonscale Armor', defense: 4, moveBonus: 1, lavaWard: true, minFloor: 4, rare: true }
};

export const POTIONS = {
  health: {
    name: 'Health Potion',
    healAmount: CONFIG.POTION_HEAL,
    color: COLORS.ITEM_POTION,
    description: `Restore ${CONFIG.POTION_HEAL} HP`,
    minFloor: 1
  },
  warding: {
    name: 'Warding Elixir',
    wardCharges: 2,
    color: COLORS.ITEM_WARDING,
    description: 'Gain 2 ward charges',
    minFloor: 1,
    rare: true
  },
  quickstep: {
    name: 'Quickstep Elixir',
    speedBonus: 1,
    color: COLORS.ITEM_SWIFT,
    description: 'Gain +1 speed until the next floor',
    minFloor: 2,
    rare: true
  }
};

export const SCROLLS = {
  blinding: {
    name: 'Scroll of Blinding',
    duration: CONFIG.BLIND_DURATION,
    color: COLORS.ITEM_SCROLL,
    description: 'Blind the nearest visible enemy',
    minFloor: 1
  }
};

// Difficulty presets
export const DIFFICULTY = {
  easy: { label: 'Easy', enemyHpMult: 0.7, enemyDmgMult: 0.7, itemMult: 1.3, xpMult: 1.2 },
  normal: { label: 'Normal', enemyHpMult: 1.0, enemyDmgMult: 1.0, itemMult: 1.0, xpMult: 1.0 },
  hard: { label: 'Hard', enemyHpMult: 1.4, enemyDmgMult: 1.3, itemMult: 0.7, xpMult: 0.8 }
};

// Game states
export const STATE = {
  MAIN_MENU: 'MAIN_MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  INTERACT_MENU: 'INTERACT_MENU',
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
  RANGED_ATTACK: 'RANGED_ATTACK',
  FLEEING: 'FLEEING'
};
