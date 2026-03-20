// Combat System - Hit resolution, damage, death, loot
import { CONFIG, COLORS, WEAPONS } from './constants.js';
import { Item } from './entities.js';
import { mulberry32 } from './dungeon.js';

// Roll damage for a weapon
function rollWeaponDamage(weapon, strength, rng) {
  const weaponDmg = weapon.minDamage + Math.floor(rng() * (weapon.maxDamage - weapon.minDamage + 1));
  const strBonus = Math.floor(rng() * (strength + 1));
  return weaponDmg + strBonus;
}

// Player attacks an enemy (bump attack)
export function playerAttack(player, enemy, rng, messageLog, renderer) {
  // Hit check
  if (rng() > CONFIG.HIT_CHANCE) {
    messageLog.add(`You miss the ${enemy.name}!`);
    return false;
  }

  const damage = rollWeaponDamage(player.weapon, player.strength, rng);
  enemy.hp -= damage;

  messageLog.add(`You hit the ${enemy.name} for ${damage} damage.`);
  renderer.addEffect(enemy.x, enemy.y, `-${damage}`, COLORS.DAMAGE_TEXT);
  renderer.shake(4, 0.88);
  enemy.hitFlash = 150;

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    return handleEnemyDeath(player, enemy, rng, messageLog, renderer);
  }

  return false; // enemy not killed
}

// Handle enemy death
function handleEnemyDeath(player, enemy, rng, messageLog, renderer) {
  player.xp += enemy.xpValue;
  player.kills++;

  const bossText = enemy.isBoss ? ' The dungeon trembles...' : '';
  messageLog.add(`The ${enemy.name} is slain! (+${enemy.xpValue} XP)${bossText}`);
  renderer.addEffect(enemy.x, enemy.y, `+${enemy.xpValue} XP`, COLORS.LEVEL_UP_TEXT);
  renderer.spawnDeathParticles(enemy.x, enemy.y, enemy.color);
  renderer.shake(enemy.isBoss ? 12 : 6, 0.82);

  // Check level up
  if (player.checkLevelUp()) {
    messageLog.add(`Level up! You are now level ${player.level}! (+5 HP, +1 STR)`);
    renderer.flash('#ffd60a', 400);
  }

  return true; // enemy killed
}

// Enemy attacks the player
export function enemyAttack(enemy, player, rng, messageLog, renderer) {
  const baseDamage = enemy.baseDamage;
  const damage = baseDamage + Math.floor(rng() * 3);

  player.hp -= damage;
  if (player.hp < 0) player.hp = 0;
  player.lastDamageTime = Date.now();

  messageLog.add(`The ${enemy.name} hits you for ${damage} damage!`);
  renderer.addEffect(player.x, player.y, `-${damage}`, COLORS.DAMAGE_TEXT);
  renderer.flash('#e63946', 200);
  renderer.shake(5, 0.86);
  player.hitFlash = 150;

  if (player.hp <= 0) {
    player.causeOfDeath = `Killed by ${enemy.name}`;
    return true; // player died
  }

  return false;
}

// Pick up an item
export function pickupItem(player, item, items, messageLog, renderer) {
  switch (item.type) {
    case 'weapon':
      // Equip if better than current weapon
      const newAvg = (item.data.minDamage + item.data.maxDamage) / 2;
      const curAvg = (player.weapon.minDamage + player.weapon.maxDamage) / 2;
      player.weapon = { ...item.data };
      if (newAvg > curAvg) {
        messageLog.add(`You found a ${item.name}! Equipped!`);
      } else {
        messageLog.add(`You found a ${item.name}. Equipped.`);
      }
      renderer.addEffect(item.x, item.y, item.name, COLORS.ITEM_WEAPON);
      break;

    case 'potion':
      const healed = Math.min(item.data.healAmount, player.maxHp - player.hp);
      player.hp = Math.min(player.hp + item.data.healAmount, player.maxHp);
      messageLog.add(`You drink a Health Potion. (+${healed} HP)`);
      renderer.addEffect(player.x, player.y, `+${healed}`, COLORS.HEAL_TEXT);
      renderer.flash('#06d6a0', 200);
      break;

    case 'scroll':
      messageLog.add(`You read the ${item.name}!`);
      // The blind effect is applied by the caller (main.js)
      break;

    case 'key':
      messageLog.add('You found a Floor Key!');
      renderer.addEffect(item.x, item.y, 'KEY', '#ffd700');
      renderer.flash('#ffd700', 200);
      break;
  }

  // Remove item from world
  const idx = items.indexOf(item);
  if (idx !== -1) items.splice(idx, 1);

  return item;
}

// Generate loot drop from a killed enemy
export function generateLoot(enemy, floor, rng) {
  // Mini-bosses always drop loot
  const dropChance = enemy.isMiniBoss ? 1.0 : CONFIG.LOOT_DROP_CHANCE;
  if (rng() > dropChance) return null;

  // 60% chance potion, 40% chance weapon
  if (rng() < 0.6) {
    return new Item(enemy.x, enemy.y, 'potion', 'health', {
      name: 'Health Potion',
      healAmount: CONFIG.POTION_HEAL
    });
  }

  const availableWeapons = Object.entries(WEAPONS)
    .filter(([key, w]) => key !== 'fists' && w.minFloor <= floor);

  if (availableWeapons.length === 0) return null;

  const [key, weapon] = availableWeapons[Math.floor(rng() * availableWeapons.length)];
  return new Item(enemy.x, enemy.y, 'weapon', key, { ...weapon });
}

// Apply Scroll of Blinding to nearest enemy
export function applyBlinding(player, enemies, visible, messageLog) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    if (!enemy.isAlive || !visible[enemy.y][enemy.x]) continue;
    const dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }

  if (nearest) {
    nearest.blindUntil = performance.now() + CONFIG.BLIND_DURATION;
    messageLog.add(`The ${nearest.name} is blinded!`);
    return true;
  }

  messageLog.add('No enemies in sight to blind.');
  return false;
}
