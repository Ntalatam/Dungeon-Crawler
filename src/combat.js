// Combat System - Hit resolution, damage, death, loot
import { CONFIG, COLORS, WEAPONS, ARMORS, POTIONS } from './constants.js';
import { Item } from './entities.js';
import { playHit, playMiss, playEnemyDeath, playPlayerHit, playLevelUp, playPickup, playKeyPickup } from './audio.js';

// Roll damage for a weapon
function rollWeaponDamage(weapon, strength, rng) {
  const weaponDmg = weapon.minDamage + Math.floor(rng() * (weapon.maxDamage - weapon.minDamage + 1));
  const strBonus = Math.floor(rng() * (strength + 1));
  return weaponDmg + strBonus;
}

export function getWeaponScore(weapon) {
  const avgDamage = (weapon.minDamage + weapon.maxDamage) / 2;
  const speed = (weapon.speedBonus || 0) * 0.8;
  const accuracy = (weapon.hitBonus || 0) * 20;
  const reach = weapon.reach && weapon.reach > 1 ? 1.4 : 0;
  const pierce = (weapon.armorPierce || 0) * 1.2;
  const curseTax = weapon.cursed ? (weapon.hpDrain || 0) * 0.9 : 0;
  return avgDamage + speed + accuracy + reach + pierce - curseTax;
}

export function getArmorScore(armor) {
  return (armor.defense || 0) * 2.1 + (armor.moveBonus || 0) * 1.4 + (armor.lavaWard ? 1.8 : 0);
}

export function recalculatePlayerDefense(player) {
  player.defense = Math.max(0, (player.armor?.defense || 0) + (player.bonusDefense || 0));
}

function getEffectiveHitChance(player) {
  const chance = CONFIG.HIT_CHANCE + (player.weapon.hitBonus || 0) + (player.hitChanceBonus || 0);
  return Math.max(0.55, Math.min(0.98, chance));
}

function getPlayerWeaponSummary(weapon) {
  const parts = [];
  if (weapon.speedBonus) parts.push(`${weapon.speedBonus > 0 ? '+' : ''}${weapon.speedBonus} speed`);
  if (weapon.hitBonus) parts.push(`${Math.round(weapon.hitBonus * 100)}% accuracy`);
  if (weapon.reach && weapon.reach > 1) parts.push(`reach ${weapon.reach}`);
  if (weapon.armorPierce) parts.push(`pierce ${weapon.armorPierce}`);
  if (weapon.cursed) parts.push(`cursed`);
  return parts.join(', ');
}

function getArmorSummary(armor) {
  const parts = [];
  if (armor.moveBonus) parts.push(`${armor.moveBonus > 0 ? '+' : ''}${armor.moveBonus} speed`);
  if (armor.lavaWard) parts.push('lava ward');
  return parts.join(', ');
}

export function describeItem(item) {
  switch (item.type) {
    case 'potion':
      return item.data.description || POTIONS[item.subtype]?.description || '';
    case 'weapon': {
      const extras = getPlayerWeaponSummary(item.data);
      return `${item.data.minDamage}-${item.data.maxDamage} damage${extras ? `, ${extras}` : ''}`;
    }
    case 'armor': {
      const extras = getArmorSummary(item.data);
      return `+${item.data.defense} defense${extras ? `, ${extras}` : ''}`;
    }
    case 'scroll':
      return item.data.description || 'A single-use utility scroll';
    case 'gold':
      return `${item.data.amount} gold`;
    case 'key':
      return 'Unlocks the stairs on this floor';
    default:
      return '';
  }
}

// Player attacks an enemy (bump attack)
export function playerAttack(player, enemy, rng, messageLog, renderer) {
  // Hit check
  if (rng() > getEffectiveHitChance(player)) {
    messageLog.add(`You miss the ${enemy.name}!`);
    playMiss();
    return false;
  }

  const rawDamage = rollWeaponDamage(player.weapon, player.strength, rng);
  const armorBlocked = Math.max(0, (enemy.defense || 0) - (player.weapon.armorPierce || 0));
  const damage = Math.max(1, rawDamage - armorBlocked);
  enemy.hp -= damage;

  const blockedText = armorBlocked > 0 ? ` (${armorBlocked} blocked)` : '';
  messageLog.add(`You hit the ${enemy.name} for ${damage} damage.${blockedText}`);
  renderer.addEffect(enemy.x, enemy.y, `-${damage}`, COLORS.DAMAGE_TEXT);
  renderer.shake(4, 0.88);
  enemy.hitFlash = 150;
  playHit();

  // Cursed weapon HP drain
  if (player.weapon.cursed && player.weapon.hpDrain) {
    const drain = player.weapon.hpDrain;
    player.hp -= drain;
    if (player.hp < 1) player.hp = 1; // Cursed weapons can't kill you directly
    renderer.addEffect(player.x, player.y, `-${drain}`, '#8b00ff');
  }

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    return resolveEnemyDefeat(player, enemy, messageLog, renderer);
  }

  // Boss phase transitions
  if (enemy.isBoss && enemy.updatePhase) {
    const phaseChanged = enemy.updatePhase();
    if (phaseChanged) {
      messageLog.add(`${enemy.name} enters phase ${enemy.phase}!`);
      renderer.shake(8, 0.85);
      renderer.flash('#ff4444', 300);
    }
  }

  return false; // enemy not killed
}

// Handle enemy death from any source
export function resolveEnemyDefeat(player, enemy, messageLog, renderer, options = {}) {
  player.xp += enemy.xpValue;
  player.gold += enemy.goldValue || 0;
  player.kills++;

  const goldText = enemy.goldValue ? `, +${enemy.goldValue} gold` : '';
  const causeText = options.cause ? ` ${options.cause}` : ' is slain';
  const bossText = enemy.isBoss ? ' The dungeon trembles...' : '';
  messageLog.add(`The ${enemy.name}${causeText}! (+${enemy.xpValue} XP${goldText})${bossText}`);
  renderer.addEffect(enemy.x, enemy.y, `+${enemy.xpValue} XP`, COLORS.LEVEL_UP_TEXT);
  if (enemy.goldValue) {
    renderer.addEffect(enemy.x, enemy.y, `+${enemy.goldValue}g`, COLORS.ITEM_GOLD);
  }
  renderer.spawnDeathParticles(enemy.x, enemy.y, enemy.color);
  renderer.shake(enemy.isBoss ? 12 : 6, 0.82);
  playEnemyDeath();

  // Check level up
  if (player.checkLevelUp()) {
    messageLog.add(`Level up! You are now level ${player.level}! (+5 HP, +1 STR)`);
    renderer.flash('#ffd60a', 400);
    renderer.spawnLevelUpParticles(player.x, player.y);
    playLevelUp();
  }

  return true; // enemy killed
}

// Enemy attacks the player
export function enemyAttack(enemy, player, rng, messageLog, renderer) {
  const empoweredBonus = enemy.empoweredAttacks > 0 ? 2 : 0;
  const baseDamage = enemy.baseDamage + empoweredBonus;
  const rawDamage = baseDamage + Math.floor(rng() * 3);
  const wardBlocked = player.wardCharges > 0 ? CONFIG.WARD_BLOCK_VALUE : 0;
  const damage = Math.max(0, rawDamage - player.defense - wardBlocked);

  player.hp -= damage;
  if (player.hp < 0) player.hp = 0;
  player.lastDamageTime = Date.now();
  if (player.wardCharges > 0) {
    player.wardCharges--;
  }
  if (enemy.empoweredAttacks > 0) {
    enemy.empoweredAttacks--;
  }

  const defParts = [];
  if (player.defense > 0) defParts.push(`${player.defense} armor`);
  if (wardBlocked > 0) defParts.push(`${wardBlocked} ward`);
  const defText = defParts.length > 0 ? ` (${defParts.join(', ')} blocked)` : '';
  messageLog.add(`The ${enemy.name} hits you for ${damage} damage!${defText}`);
  renderer.addEffect(player.x, player.y, `-${damage}`, COLORS.DAMAGE_TEXT);
  renderer.flash('#e63946', 200);
  renderer.shake(5, 0.86);
  player.hitFlash = 150;
  playPlayerHit();

  if (player.hp <= 0) {
    player.causeOfDeath = `Killed by ${enemy.name}`;
    return true; // player died
  }

  return false;
}

// Pick up an item
export function pickupItem(player, item, items, messageLog, renderer) {
  switch (item.type) {
    case 'weapon': {
      if (getWeaponScore(item.data) > getWeaponScore(player.weapon)) {
        player.weapon = { ...item.data };
        const summary = getPlayerWeaponSummary(item.data);
        messageLog.add(`You equip ${item.name}${summary ? ` (${summary})` : ''}.`);
        if (item.data.cursed) renderer.addEffect(item.x, item.y, 'CURSED', '#8b00ff');
      } else {
        messageLog.add(`You leave the ${item.name}; your ${player.weapon.name} suits you better.`);
      }
      renderer.addEffect(item.x, item.y, item.name, item.data.cursed ? '#8b00ff' : COLORS.ITEM_WEAPON);
      playPickup();
      break;
    }

    case 'potion': {
      if (item.subtype === 'health') {
        const healed = Math.min(item.data.healAmount, player.maxHp - player.hp);
        player.hp = Math.min(player.hp + item.data.healAmount, player.maxHp);
        messageLog.add(`You drink a Health Potion. (+${healed} HP)`);
        renderer.addEffect(player.x, player.y, `+${healed}`, COLORS.HEAL_TEXT);
        renderer.flash('#06d6a0', 200);
      } else if (item.subtype === 'warding') {
        player.wardCharges += item.data.wardCharges;
        messageLog.add(`You uncork a Warding Elixir. (+${item.data.wardCharges} ward)`);
        renderer.addEffect(player.x, player.y, `+${item.data.wardCharges} WARD`, COLORS.ITEM_WARDING);
        renderer.flash(COLORS.ITEM_WARDING, 180);
      } else if (item.subtype === 'quickstep') {
        player.floorMoveBonus += item.data.speedBonus;
        messageLog.add(`You feel lighter on your feet. (+${item.data.speedBonus} speed this floor)`);
        renderer.addEffect(player.x, player.y, 'HASTE', COLORS.ITEM_SWIFT);
        renderer.flash(COLORS.ITEM_SWIFT, 180);
      }
      playPickup();
      break;
    }

    case 'scroll':
      messageLog.add(`You read the ${item.name}!`);
      playPickup();
      // The blind effect is applied by the caller (main.js)
      break;

    case 'armor': {
      const currentArmorScore = player.armor ? getArmorScore(player.armor) : 0;
      if (getArmorScore(item.data) > currentArmorScore) {
        player.armor = { ...item.data };
        recalculatePlayerDefense(player);
        const summary = getArmorSummary(item.data);
        messageLog.add(`You equip ${item.name}${summary ? ` (${summary})` : ''}.`);
        renderer.addEffect(player.x, player.y, `+${item.data.defense} DEF`, COLORS.ITEM_ARMOR);
      } else {
        messageLog.add(`${item.name} would be a downgrade from your current kit.`);
      }
      playPickup();
      break;
    }

    case 'key':
      messageLog.add('You found a Floor Key!');
      renderer.addEffect(item.x, item.y, 'KEY', '#ffd700');
      renderer.flash('#ffd700', 200);
      playKeyPickup();
      break;

    case 'gold':
      player.gold += item.data.amount;
      messageLog.add(`You pocket ${item.data.amount} gold.`);
      renderer.addEffect(item.x, item.y, `+${item.data.amount}g`, COLORS.ITEM_GOLD);
      playPickup();
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

  // Defensive utility is intentionally common so pressure spikes have counterplay.
  const roll = rng();
  if (roll < 0.38) {
    return new Item(enemy.x, enemy.y, 'potion', 'health', { ...POTIONS.health });
  }

  if (roll < 0.56) {
    return new Item(enemy.x, enemy.y, 'potion', 'warding', { ...POTIONS.warding });
  }

  if (roll < 0.70 && POTIONS.quickstep.minFloor <= floor) {
    return new Item(enemy.x, enemy.y, 'potion', 'quickstep', { ...POTIONS.quickstep });
  }

  if (roll < 0.88) {
    const availableWeapons = Object.entries(WEAPONS)
      .filter(([key, w]) => key !== 'fists' && w.minFloor <= floor);
    if (availableWeapons.length === 0) return null;
    const [key, weapon] = availableWeapons[Math.floor(rng() * availableWeapons.length)];
    return new Item(enemy.x, enemy.y, 'weapon', key, { ...weapon });
  }

  const availableArmors = Object.entries(ARMORS)
    .filter(([key, a]) => a.minFloor <= floor);
  if (availableArmors.length === 0) return null;
  const [key, armor] = availableArmors[Math.floor(rng() * availableArmors.length)];
  return new Item(enemy.x, enemy.y, 'armor', key, { ...armor });
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
