// Hazard helpers shared by AI and gameplay systems
import { COLORS, TILE } from './constants.js';
import { getEnemyAt } from './entities.js';

export function getHazardKey(tile) {
  switch (tile) {
    case TILE.LAVA: return 'lava';
    case TILE.ICE: return 'ice';
    case TILE.SPIKE_TRAP: return 'spikes';
    default: return null;
  }
}

export function getEnemyHazardCost(enemy, tile) {
  const hazardKey = getHazardKey(tile);
  if (!hazardKey) return 1;
  return Math.max(1, enemy.hazardCosts?.[hazardKey] ?? 4);
}

export function countHazardsBetween(map, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1;
  let cy = y1;
  let hazards = 0;

  while (cx !== x2 || cy !== y2) {
    const hazardKey = getHazardKey(map[cy]?.[cx]);
    if (hazardKey && (cx !== x1 || cy !== y1)) {
      hazards++;
    }

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }

  return hazards;
}

export function applyEnemyHazardStep(enemy, map, oldX, oldY, enemies, player, visible, messageLog, renderer) {
  const tile = map[enemy.y]?.[enemy.x];
  const hazardKey = getHazardKey(tile);
  if (!hazardKey) return { died: false, moved: false };

  const canLog = !!(visible?.[enemy.y]?.[enemy.x]);

  if (hazardKey === 'lava') {
    if (enemy.lavaAffinity) {
      const wasEmpowered = (enemy.empoweredAttacks || 0) > 0;
      enemy.empoweredAttacks = Math.max(enemy.empoweredAttacks || 0, 2);
      if (canLog && !wasEmpowered) {
        messageLog.add(`The ${enemy.name} wades through lava and grows fiercer!`);
        renderer.addEffect(enemy.x, enemy.y, 'ENRAGED', COLORS.LAVA_GLOW);
      }
      return { died: false, moved: false };
    }

    const damage = 4;
    enemy.hp = Math.max(0, enemy.hp - damage);
    if (canLog) {
      messageLog.add(`The ${enemy.name} burns in the lava!`);
      renderer.addEffect(enemy.x, enemy.y, `-${damage}`, COLORS.LAVA_GLOW);
    }
    return { died: enemy.hp <= 0, moved: false, cause: 'burned away by lava' };
  }

  if (hazardKey === 'spikes') {
    const damage = Math.max(1, Math.round(3 * (enemy.spikeDamageMult ?? 1)));
    enemy.hp = Math.max(0, enemy.hp - damage);
    if (canLog) {
      messageLog.add(`The ${enemy.name} staggers over the spike trap.`);
      renderer.addEffect(enemy.x, enemy.y, `-${damage}`, COLORS.SPIKE_TRAP);
    }
    return { died: enemy.hp <= 0, moved: false, cause: 'was impaled on spike traps' };
  }

  if (hazardKey === 'ice' && enemy.slidesOnIce) {
    const dx = enemy.x - oldX;
    const dy = enemy.y - oldY;
    if (dx === 0 && dy === 0) return { died: false, moved: false };

    const slideX = enemy.x + dx;
    const slideY = enemy.y + dy;
    if (slideX === player.x && slideY === player.y) {
      return { died: false, moved: false };
    }
    if (!map[slideY] || map[slideY][slideX] === undefined) {
      return { died: false, moved: false };
    }
    const blockedByEnemy = getEnemyAt(enemies, slideX, slideY);
    if (blockedByEnemy) return { died: false, moved: false };

    const nextHazardKey = getHazardKey(map[slideY][slideX]);
    const walkable = nextHazardKey || map[slideY][slideX] === TILE.FLOOR || map[slideY][slideX] === TILE.CORRIDOR ||
      map[slideY][slideX] === TILE.DOOR || map[slideY][slideX] === TILE.STAIRS_DOWN || map[slideY][slideX] === TILE.STAIRS_UP;
    if (!walkable) return { died: false, moved: false };

    enemy.x = slideX;
    enemy.y = slideY;
    if (canLog) {
      messageLog.add(`The ${enemy.name} skitters across the ice!`);
      renderer.addEffect(enemy.x, enemy.y, 'SLIDE', COLORS.ICE);
    }
    return { died: false, moved: true };
  }

  return { died: false, moved: false };
}
