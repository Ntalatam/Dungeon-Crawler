// Entity System - Player, Enemy, Item classes
import { CONFIG, COLORS, ENEMY_STATS, WEAPONS, ARMORS, POTIONS, SCROLLS, AI_STATE, FLOOR_CONFIG, TILE } from './constants.js';
import { isWalkable } from './dungeon.js';

// Player class
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.renderX = x;
    this.renderY = y;
    this.hitFlash = 0;
    this.hp = 30;
    this.maxHp = 30;
    this.xp = 0;
    this.level = 1;
    this.strength = 2;
    this.weapon = { ...WEAPONS.fists };
    this.armor = null; // { name, defense }
    this.defense = 0;
    this.kills = 0;
    this.causeOfDeath = '';
    this.lastDamageTime = 0;
    this.gold = 0;
    this.wardCharges = 0;
    this.moveBonus = 0;
    this.floorMoveBonus = 0;
    this.hitChanceBonus = 0;
    this.bonusDefense = 0;
  }

  get isAlive() {
    return this.hp > 0;
  }

  // Check if player can level up
  checkLevelUp() {
    if (this.level >= CONFIG.MAX_PLAYER_LEVEL) return false;
    const threshold = CONFIG.XP_THRESHOLDS[this.level];
    if (this.xp >= threshold) {
      this.level++;
      this.maxHp += 5;
      this.strength += 1;
      this.hp = this.maxHp; // Full heal on level up
      return true;
    }
    return false;
  }

  // Get XP progress to next level
  get xpProgress() {
    if (this.level >= CONFIG.MAX_PLAYER_LEVEL) return 1;
    const current = this.level > 1 ? CONFIG.XP_THRESHOLDS[this.level - 1] : 0;
    const next = CONFIG.XP_THRESHOLDS[this.level];
    return (this.xp - current) / (next - current);
  }
}

// Enemy class
export class Enemy {
  constructor(x, y, type) {
    const stats = ENEMY_STATS[type];
    this.x = x;
    this.y = y;
    this.renderX = x;
    this.renderY = y;
    this.hitFlash = 0;
    this.type = type;
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.baseDamage = stats.damage;
    this.xpValue = stats.xp;
    this.goldValue = stats.gold || 0;
    this.defense = stats.defense || 0;
    this.moveMs = stats.moveMs;
    this.color = stats.color;
    this.canFlee = stats.flees;
    this.state = AI_STATE.IDLE;
    this.path = [];
    this.lastMoveTime = performance.now();
    this.lastPathTime = performance.now();
    this.attackCooldown = 0;
    this.patrolTarget = null;
    this.blindUntil = 0; // Timestamp when blind expires
    this.spawnRoom = null;
    this.isRanged = stats.ranged || false;
    this.attackRange = stats.range || 1;
    this.lastRangedAttack = 0;
    this.hazardCosts = { ...(stats.hazardCosts || {}) };
    this.slidesOnIce = !!stats.slidesOnIce;
    this.lavaAffinity = !!stats.lavaAffinity;
    this.spikeDamageMult = stats.spikeDamageMult ?? 1;
    this.prefersHazardBuffer = !!stats.prefersHazardBuffer;
    this.role = stats.role || 'standard';
    this.empoweredAttacks = 0;
    this.hazardTrail = false;
  }

  get isAlive() {
    return this.hp > 0;
  }

  get fovRange() {
    if (this.blindUntil > 0 && performance.now() < this.blindUntil) return 1;
    return CONFIG.ENEMY_FOV_RANGE;
  }
}

// Boss enemy (special Troll on floor 5) with phase system
export class BossEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, 'troll');
    this.name = 'The Ancient One';
    this.hp = 120;
    this.maxHp = 120;
    this.baseDamage = 12;
    this.xpValue = 50;
    this.goldValue = 25;
    this.defense = 2;
    this.isBoss = true;
    this.phase = 1;
    this.baseMovMs = 700;
    this.lavaAffinity = true;
    this.hazardCosts = { lava: 1, ice: 1, spikes: 1 };
  }

  // Update boss phase based on HP thresholds
  updatePhase() {
    const hpRatio = this.hp / this.maxHp;
    let newPhase;
    if (hpRatio > 0.75) newPhase = 1;
    else if (hpRatio > 0.50) newPhase = 2;
    else if (hpRatio > 0.25) newPhase = 3;
    else newPhase = 4;

    if (newPhase !== this.phase) {
      this.phase = newPhase;
      switch (newPhase) {
        case 2: // Faster
          this.moveMs = Math.round(this.baseMovMs * 0.8);
          this.baseDamage = 14;
          this.isRanged = true;
          this.attackRange = 3;
          this.name = 'The Ancient One (Awakened)';
          break;
        case 3: // Stronger + faster
          this.moveMs = Math.round(this.baseMovMs * 0.65);
          this.baseDamage = 16;
          this.hazardTrail = true;
          this.name = 'The Ancient One (Furious)';
          break;
        case 4: // Desperate - very fast, max damage
          this.moveMs = Math.round(this.baseMovMs * 0.4);
          this.baseDamage = 20;
          this.isRanged = true;
          this.attackRange = 4;
          this.hazardTrail = true;
          this.name = 'The Ancient One (Desperate)';
          break;
      }
      return true; // Phase changed
    }
    return false;
  }
}

// Promote a regular enemy to mini-boss (in-place)
function promoteToMiniBoss(enemy) {
  enemy.isMiniBoss = true;
  enemy.name = `Elite ${enemy.name}`;
  enemy.hp = Math.round(enemy.hp * 1.5);
  enemy.maxHp = enemy.hp;
  enemy.baseDamage = Math.round(enemy.baseDamage * 1.5);
  enemy.xpValue = Math.round(enemy.xpValue * 2);
  enemy.goldValue = Math.round(enemy.goldValue * 2);
  enemy.defense += 1;
  // Distinct color per type
  const eliteColors = {
    skeleton: COLORS.ELITE_SKELETON,
    goblin: COLORS.ELITE_GOBLIN,
    troll: COLORS.ELITE_TROLL,
    archer: COLORS.ELITE_ARCHER,
  };
  enemy.color = eliteColors[enemy.type] || enemy.color;
}

// Item class
export class Item {
  constructor(x, y, type, subtype, data) {
    this.x = x;
    this.y = y;
    this.type = type;       // 'weapon', 'potion', 'scroll', 'armor', 'key', 'gold'
    this.subtype = subtype; // item key within its category
    this.data = data;       // item stats or effect data
    this.name = data.name;
  }
}

function weightedPick(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function getRoomEnemyWeights(roomType, floor) {
  if (floor === 1) {
    switch (roomType) {
      case 'guardpost':
        return { skeleton: 2, goblin: 3, archer: 0, troll: 0 };
      case 'vault':
        return { skeleton: 1, goblin: 4, archer: 0, troll: 0 };
      case 'exit':
        return { skeleton: 2, goblin: 2, archer: 0, troll: 0 };
      default:
        return { skeleton: 2, goblin: 3, archer: 0, troll: 0 };
    }
  }

  switch (roomType) {
    case 'guardpost':
      return { skeleton: 4, goblin: 1, archer: 4, troll: 2 };
    case 'vault':
      return { skeleton: 2, goblin: 4, archer: 1, troll: 1 };
    case 'exit':
      return { skeleton: 3, goblin: 1, archer: 2, troll: 2 };
    default:
      return { skeleton: 3, goblin: 3, archer: 2, troll: 2 };
  }
}

function chooseEnemyType(availableTypes, roomType, floor, rng) {
  const weights = getRoomEnemyWeights(roomType, floor);
  return weightedPick(rng, availableTypes.map(type => [type, weights[type] || 1]));
}

function getMiniBossBonus(roomType) {
  switch (roomType) {
    case 'guardpost': return 0.16;
    case 'exit': return 0.08;
    case 'vault': return -0.05;
    default: return 0;
  }
}

// Spawn enemies for a floor
export function spawnEnemies(floor, entitySpawns, rooms, rng) {
  const config = FLOOR_CONFIG[floor];
  const count = Math.floor(rng() * (config.enemyMax - config.enemyMin + 1)) + config.enemyMin;
  const enemies = [];

  // Shuffle spawns
  const shuffled = [...entitySpawns];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let trollCount = 0;
  let archerCount = 0;
  const maxTrolls = config.trollMax || 0;
  const maxArchers = config.archerMax || 0;

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const spawn = shuffled[i];
    let type;

    // Pick enemy type from available types
    const availableTypes = config.types.filter(t => {
      if (t === 'troll' && trollCount >= maxTrolls) return false;
      if (t === 'archer' && archerCount >= maxArchers) return false;
      return true;
    });

    type = chooseEnemyType(availableTypes, spawn.room?.type || 'normal', floor, rng);
    if (type === 'troll') trollCount++;
    if (type === 'archer') archerCount++;

    const enemy = new Enemy(spawn.x, spawn.y, type);
    enemy.spawnRoom = spawn.room;

    if (floor === 1 && type === 'skeleton') {
      enemy.hp = 34;
      enemy.maxHp = 34;
      enemy.baseDamage = 3;
      enemy.defense = 0;
      enemy.moveMs = 560;
    }

    // Scale goblin stats per floor so they stay relevant
    if (type === 'goblin' && floor > 1) {
      const scale = 1 + (floor - 1) * 0.2; // +20% per floor: F2=1.2x, F3=1.4x, F4=1.6x, F5=1.8x
      enemy.hp = Math.round(enemy.hp * scale);
      enemy.maxHp = enemy.hp;
      enemy.baseDamage = Math.round(enemy.baseDamage * (1 + (floor - 1) * 0.15));
      enemy.xpValue = Math.round(enemy.xpValue * scale);
    }

    // Promote to mini-boss based on floor config
    const miniBossChance = Math.max(0, (config.miniBossChance || 0) + getMiniBossBonus(spawn.room?.type || 'normal'));
    if (miniBossChance > 0 && rng() < miniBossChance) {
      promoteToMiniBoss(enemy);
    }

    enemies.push(enemy);
  }

  // Spawn boss on floor 5
  if (config.boss && rooms.length > 0) {
    // Find the most central room
    const centerX = CONFIG.MAP_WIDTH / 2;
    const centerY = CONFIG.MAP_HEIGHT / 2;
    let bestRoom = rooms[0];
    let bestDist = Infinity;
    for (const room of rooms) {
      const dx = room.center.x - centerX;
      const dy = room.center.y - centerY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestRoom = room;
      }
    }
    const boss = new BossEnemy(bestRoom.center.x, bestRoom.center.y);
    boss.spawnRoom = bestRoom;
    enemies.push(boss);
  }

  return enemies;
}

// Spawn items for a floor
function getRoomItemCategoryWeights(roomType) {
  switch (roomType) {
    case 'vault':
      return [['weapon', 0.28], ['armor', 0.22], ['potion', 0.18], ['scroll', 0.12], ['gold', 0.20]];
    case 'guardpost':
      return [['weapon', 0.18], ['armor', 0.28], ['potion', 0.22], ['scroll', 0.12], ['gold', 0.20]];
    case 'exit':
      return [['weapon', 0.18], ['armor', 0.20], ['potion', 0.32], ['scroll', 0.18], ['gold', 0.12]];
    default:
      return [['weapon', 0.22], ['armor', 0.18], ['potion', 0.34], ['scroll', 0.14], ['gold', 0.12]];
  }
}

function chooseGear(pool, roomType, rng) {
  const rarePool = pool.filter(([, data]) => data.rare);
  if (roomType === 'vault' && rarePool.length > 0 && rng() < 0.35) {
    return rarePool[Math.floor(rng() * rarePool.length)];
  }
  if (roomType === 'guardpost' && rarePool.length > 0 && rng() < 0.15) {
    return rarePool[Math.floor(rng() * rarePool.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

function choosePotion(roomType, floor, rng) {
  const pool = Object.entries(POTIONS).filter(([, potion]) => potion.minFloor <= floor);
  let weights;
  switch (roomType) {
    case 'guardpost':
      weights = pool.map(([key]) => [key, key === 'warding' ? 4 : key === 'quickstep' ? 2 : 3]);
      break;
    case 'vault':
      weights = pool.map(([key]) => [key, key === 'quickstep' ? 3 : key === 'warding' ? 2 : 3]);
      break;
    default:
      weights = pool.map(([key]) => [key, key === 'health' ? 5 : 2]);
      break;
  }
  const choiceKey = weightedPick(rng, weights);
  return [choiceKey, POTIONS[choiceKey]];
}

function createGoldItem(spawn, roomType, rng) {
  const base = roomType === 'vault' ? 10 : roomType === 'guardpost' ? 7 : 5;
  const variance = roomType === 'vault' ? 6 : 4;
  const amount = base + Math.floor(rng() * variance);
  return new Item(spawn.x, spawn.y, 'gold', 'coins', {
    name: 'Gold Cache',
    amount
  });
}

export function spawnItems(floor, itemSpawns, rng, itemMultiplier = 1) {
  const config = FLOOR_CONFIG[floor];
  const items = [];

  // Determine item count based on density
  let itemRatio;
  switch (config.itemDensity) {
    case 'high': itemRatio = 0.7; break;
    case 'medium': itemRatio = 0.5; break;
    case 'low': itemRatio = 0.3; break;
    default: itemRatio = 0.5;
  }

  const maxItems = Math.max(0, Math.floor(itemSpawns.length * itemRatio * itemMultiplier));

  // Shuffle spawns
  const shuffled = [...itemSpawns];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Available weapons and armor for this floor
  const availableWeapons = Object.entries(WEAPONS)
    .filter(([key, w]) => key !== 'fists' && w.minFloor <= floor);
  const availableArmors = Object.entries(ARMORS)
    .filter(([key, a]) => a.minFloor <= floor);
  const availableScrolls = Object.entries(SCROLLS)
    .filter(([, scroll]) => scroll.minFloor <= floor);

  for (let i = 0; i < Math.min(maxItems, shuffled.length); i++) {
    const spawn = shuffled[i];
    const roomType = spawn.room?.type || 'normal';
    const category = weightedPick(rng, getRoomItemCategoryWeights(roomType));

    if (category === 'potion') {
      const [key, potion] = choosePotion(roomType, floor, rng);
      items.push(new Item(spawn.x, spawn.y, 'potion', key, { ...potion }));
    } else if (category === 'weapon' && availableWeapons.length > 0) {
      const [key, weapon] = chooseGear(availableWeapons, roomType, rng);
      items.push(new Item(spawn.x, spawn.y, 'weapon', key, { ...weapon }));
    } else if (category === 'armor' && availableArmors.length > 0) {
      const [key, armor] = chooseGear(availableArmors, roomType, rng);
      items.push(new Item(spawn.x, spawn.y, 'armor', key, { ...armor }));
    } else if (category === 'gold') {
      items.push(createGoldItem(spawn, roomType, rng));
    } else if (availableScrolls.length > 0) {
      const [key, scroll] = availableScrolls[Math.floor(rng() * availableScrolls.length)];
      items.push(new Item(spawn.x, spawn.y, 'scroll', key, { ...scroll }));
    } else {
      const [key, potion] = choosePotion(roomType, floor, rng);
      items.push(new Item(spawn.x, spawn.y, 'potion', key, { ...potion }));
    }
  }

  return items;
}

// Get item at a position
export function getItemAt(items, x, y) {
  return items.find(item => item.x === x && item.y === y);
}

// Get enemy at a position — uses spatial index if available, otherwise linear scan
export function getEnemyAt(enemies, x, y) {
  // Fast path: use spatial index if it exists
  if (enemies._spatialGrid) {
    const key = x + ',' + y;
    const enemy = enemies._spatialGrid.get(key);
    if (enemy && enemy.isAlive && enemy.x === x && enemy.y === y) return enemy;
    return null;
  }
  return enemies.find(enemy => enemy.x === x && enemy.y === y && enemy.isAlive);
}

// Build spatial index for enemies (call once per frame before AI updates)
export function buildEnemySpatialGrid(enemies) {
  const grid = new Map();
  for (const enemy of enemies) {
    if (enemy.isAlive) {
      grid.set(enemy.x + ',' + enemy.y, enemy);
    }
  }
  enemies._spatialGrid = grid;
}

// Update spatial grid when an enemy moves
export function updateEnemySpatialGrid(enemies, enemy, oldX, oldY) {
  if (!enemies._spatialGrid) return;
  enemies._spatialGrid.delete(oldX + ',' + oldY);
  if (enemy.isAlive) {
    enemies._spatialGrid.set(enemy.x + ',' + enemy.y, enemy);
  }
}
