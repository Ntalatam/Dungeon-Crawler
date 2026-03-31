// Room archetypes, spawn planning, and player-facing room identity
import { COLORS, CONFIG } from './constants.js';

export const ROOM_ARCHETYPES = {
  entry: {
    name: 'Entry Hall',
    subtitle: 'A brief moment of calm before the descent.',
    accent: '#7a7f9a'
  },
  exit: {
    name: 'Sealed Stairwell',
    subtitle: 'The way down, if you have earned it.',
    accent: COLORS.STAIRS
  },
  normal: {
    name: 'Dusty Chamber',
    subtitle: 'Standard foes and steady scavenging.',
    accent: '#6d7086'
  },
  vault: {
    name: 'Vault',
    subtitle: 'Lean defense, rich loot, high temptation.',
    accent: COLORS.ROOM_VAULT
  },
  guardpost: {
    name: 'Guard Post',
    subtitle: 'Fortified angles, heavier resistance, cleaner lines of fire.',
    accent: COLORS.ROOM_GUARDPOST
  },
  sanctuary: {
    name: 'Sanctuary',
    subtitle: 'A protected chamber with a powerful one-time feature.',
    accent: COLORS.ROOM_SANCTUARY
  }
};

function getRoomWeightTable(floor) {
  return {
    sanctuary: floor >= 4 ? 0.12 : 0.16,
    vault: floor >= 4 ? 0.16 : 0.20,
    guardpost: floor >= 4 ? 0.28 : 0.22,
    normal: floor >= 4 ? 0.44 : 0.42
  };
}

function weightedRoomType(rng, weights) {
  const roll = rng();
  let cursor = 0;

  for (const [type, weight] of Object.entries(weights)) {
    cursor += weight;
    if (roll <= cursor) return type;
  }

  return 'normal';
}

function roomDistanceSq(a, b) {
  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  return dx * dx + dy * dy;
}

function roomCenterBias(room) {
  const dx = room.center.x - CONFIG.MAP_WIDTH / 2;
  const dy = room.center.y - CONFIG.MAP_HEIGHT / 2;
  return dx * dx + dy * dy;
}

function pickAndRemove(candidates, scoreFn, maximize = false) {
  if (candidates.length === 0) return null;

  let bestIndex = 0;
  let bestScore = scoreFn(candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreFn(candidates[i]);
    const better = maximize ? score > bestScore : score < bestScore;
    if (better) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return candidates.splice(bestIndex, 1)[0];
}

export function assignRoomArchetypes(rooms, startRoom, endRoom, floor, rng) {
  startRoom.type = 'entry';
  endRoom.type = 'exit';

  const candidates = rooms.filter(room => room !== startRoom && room !== endRoom);
  const remaining = [...candidates];

  const sanctuary = pickAndRemove(remaining, roomCenterBias, false);
  if (sanctuary) sanctuary.type = 'sanctuary';

  const vault = pickAndRemove(remaining, room => roomDistanceSq(room, startRoom), true);
  if (vault) vault.type = 'vault';

  const guardpost = pickAndRemove(remaining, room => roomDistanceSq(room, endRoom), false);
  if (guardpost) guardpost.type = 'guardpost';

  const weights = getRoomWeightTable(floor);
  for (const room of remaining) {
    room.type = weightedRoomType(rng, weights);
  }

  for (const room of rooms) {
    const theme = ROOM_ARCHETYPES[room.type] || ROOM_ARCHETYPES.normal;
    room.title = theme.name;
    room.subtitle = theme.subtitle;
    room.accent = theme.accent;
    room.discovered = false;
  }
}

export function getRoomSpawnPlan(room, rng, floor) {
  switch (room.type) {
    case 'entry':
      return { enemyCount: 0, itemCount: 0, eliteBonus: 0, lootBias: 'none' };
    case 'exit':
      return {
        enemyCount: Math.min(4, 1 + Math.floor(rng() * 2) + Math.floor(floor / 3)),
        itemCount: 0,
        eliteBonus: 0.05 + floor * 0.02,
        lootBias: 'pressure'
      };
    case 'vault':
      return {
        enemyCount: Math.floor(rng() * 2),
        itemCount: 4 + Math.floor(rng() * 3),
        eliteBonus: 0.04,
        lootBias: 'treasure'
      };
    case 'guardpost':
      return {
        enemyCount: 3 + Math.floor(rng() * 3),
        itemCount: 1 + Math.floor(rng() * 2),
        eliteBonus: 0.14 + floor * 0.02,
        lootBias: 'defense'
      };
    case 'sanctuary':
      return { enemyCount: 0, itemCount: 0, eliteBonus: 0, lootBias: 'sanctuary' };
    default:
      return {
        enemyCount: 1 + Math.floor(rng() * 3),
        itemCount: 1 + Math.floor(rng() * 2),
        eliteBonus: 0.03 + floor * 0.01,
        lootBias: 'balanced'
      };
  }
}

export function getRoomHazardPlan(room, rng, floor = 1) {
  switch (room.type) {
    case 'sanctuary':
    case 'entry':
      return { chance: 0, count: 0 };
    case 'vault':
      return floor === 1
        ? { chance: 0.16, count: 1 + Math.floor(rng() * 2) }
        : { chance: 0.08, count: 1 + Math.floor(rng() * 3) };
    case 'guardpost':
      return floor === 1
        ? { chance: 0.24, count: 2 + Math.floor(rng() * 2) }
        : { chance: 0.34, count: 4 + Math.floor(rng() * 3) };
    case 'exit':
      return floor === 1
        ? { chance: 0.10, count: 1 + Math.floor(rng() * 2) }
        : { chance: 0.16, count: 2 + Math.floor(rng() * 3) };
    default:
      return floor === 1
        ? { chance: 0.08, count: 1 + Math.floor(rng() * 2) }
        : { chance: 0.22, count: 2 + Math.floor(rng() * 4) };
  }
}

export function buildRoomLookup(rooms) {
  const lookup = Array.from({ length: CONFIG.MAP_HEIGHT }, () => Array(CONFIG.MAP_WIDTH).fill(null));
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        lookup[y][x] = room;
      }
    }
  }
  return lookup;
}

export function getRoomAt(rooms, x, y) {
  return rooms.find(room =>
    x >= room.x &&
    x < room.x + room.width &&
    y >= room.y &&
    y < room.y + room.height
  ) || null;
}

export function getRoomBanner(room, feature = null) {
  if (!room) return null;

  const title = feature && feature.bannerTitle ? feature.bannerTitle : room.title;
  let subtitle = feature && feature.bannerSubtitle ? feature.bannerSubtitle : room.subtitle;

  if (room.type === 'guardpost') {
    subtitle = 'Watch the lanes. Expect crossfire and sturdier defenders.';
  } else if (room.type === 'vault') {
    subtitle = 'Grab value quickly before pressure catches up.';
  }

  return {
    title,
    subtitle,
    color: room.accent || COLORS.HUD_TEXT,
    until: Date.now() + CONFIG.ROOM_BANNER_MS
  };
}
