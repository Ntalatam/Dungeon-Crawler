// Entity System - Player, Enemy, Item classes
import { CONFIG, ENEMY_STATS, WEAPONS, AI_STATE, FLOOR_CONFIG, TILE } from './constants.js';
import { isWalkable } from './dungeon.js';

// Player class
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.hp = 30;
    this.maxHp = 30;
    this.xp = 0;
    this.level = 1;
    this.strength = 2;
    this.weapon = { ...WEAPONS.fists };
    this.kills = 0;
    this.causeOfDeath = '';
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
    this.type = type;
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.baseDamage = stats.damage;
    this.xpValue = stats.xp;
    this.moveMs = stats.moveMs;
    this.color = stats.color;
    this.canFlee = stats.flees;
    this.state = AI_STATE.IDLE;
    this.path = [];
    this.lastMoveTime = 0;
    this.lastPathTime = 0;
    this.attackCooldown = 0;
    this.patrolTarget = null;
    this.blindTimer = 0;
    this.spawnRoom = null;
  }

  get isAlive() {
    return this.hp > 0;
  }

  get fovRange() {
    if (this.blindTimer > 0) return 1;
    return CONFIG.ENEMY_FOV_RANGE;
  }
}

// Boss enemy (special Troll on floor 5)
export class BossEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, 'troll');
    this.name = 'The Ancient One';
    this.hp = 120;
    this.maxHp = 120;
    this.baseDamage = 12;
    this.xpValue = 50;
    this.isBoss = true;
  }
}

// Item class
export class Item {
  constructor(x, y, type, subtype, data) {
    this.x = x;
    this.y = y;
    this.type = type;       // 'weapon', 'potion', 'scroll'
    this.subtype = subtype; // weapon key or potion/scroll type
    this.data = data;       // weapon stats or effect data
    this.name = data.name;
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
  const maxTrolls = config.trollMax || 0;

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const spawn = shuffled[i];
    let type;

    // Pick enemy type from available types
    const availableTypes = config.types.filter(t => {
      if (t === 'troll' && trollCount >= maxTrolls) return false;
      return true;
    });

    type = availableTypes[Math.floor(rng() * availableTypes.length)];
    if (type === 'troll') trollCount++;

    const enemy = new Enemy(spawn.x, spawn.y, type);
    enemy.spawnRoom = spawn.room;
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
export function spawnItems(floor, itemSpawns, rng) {
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

  const maxItems = Math.floor(itemSpawns.length * itemRatio);

  // Shuffle spawns
  const shuffled = [...itemSpawns];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Available weapons for this floor
  const availableWeapons = Object.entries(WEAPONS)
    .filter(([key, w]) => key !== 'fists' && w.minFloor <= floor);

  for (let i = 0; i < Math.min(maxItems, shuffled.length); i++) {
    const spawn = shuffled[i];
    const roll = rng();

    if (roll < 0.5) {
      // Health potion
      items.push(new Item(spawn.x, spawn.y, 'potion', 'health', {
        name: 'Health Potion',
        healAmount: CONFIG.POTION_HEAL
      }));
    } else if (roll < 0.75 && availableWeapons.length > 0) {
      // Weapon
      const [key, weapon] = availableWeapons[Math.floor(rng() * availableWeapons.length)];
      items.push(new Item(spawn.x, spawn.y, 'weapon', key, { ...weapon }));
    } else {
      // Scroll of Blinding
      items.push(new Item(spawn.x, spawn.y, 'scroll', 'blinding', {
        name: 'Scroll of Blinding',
        duration: CONFIG.BLIND_DURATION
      }));
    }
  }

  return items;
}

// Get item at a position
export function getItemAt(items, x, y) {
  return items.find(item => item.x === x && item.y === y);
}

// Get enemy at a position
export function getEnemyAt(enemies, x, y) {
  return enemies.find(enemy => enemy.x === x && enemy.y === y && enemy.isAlive);
}
