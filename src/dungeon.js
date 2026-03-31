// Dungeon Generator - BSP Tree Algorithm with Seeded RNG
import { TILE, CONFIG } from './constants.js';
import { assignRoomArchetypes, getRoomHazardPlan, getRoomSpawnPlan } from './rooms.js';

// Mulberry32 - fast, seedable PRNG with good distribution
export function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Helper: random int in [min, max] using seeded RNG
function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// BSP Tree Node
class BSPNode {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.left = null;
    this.right = null;
    this.room = null;
  }

  get isLeaf() {
    return this.left === null && this.right === null;
  }
}

// Split BSP node recursively
function splitBSP(node, rng, depth) {
  if (depth <= 0) return;
  if (node.width < CONFIG.MIN_PARTITION_SIZE * 2 && node.height < CONFIG.MIN_PARTITION_SIZE * 2) return;

  // Decide split direction
  let splitH;
  if (node.width < CONFIG.MIN_PARTITION_SIZE * 2) {
    splitH = true; // too narrow, must split horizontally
  } else if (node.height < CONFIG.MIN_PARTITION_SIZE * 2) {
    splitH = false; // too short, must split vertically
  } else {
    splitH = rng() > 0.5;
  }

  if (splitH) {
    // Horizontal split (split along y axis)
    const minSplit = CONFIG.MIN_PARTITION_SIZE;
    const maxSplit = node.height - CONFIG.MIN_PARTITION_SIZE;
    if (minSplit >= maxSplit) return;
    const split = randInt(rng, minSplit, maxSplit);
    node.left = new BSPNode(node.x, node.y, node.width, split);
    node.right = new BSPNode(node.x, node.y + split, node.width, node.height - split);
  } else {
    // Vertical split (split along x axis)
    const minSplit = CONFIG.MIN_PARTITION_SIZE;
    const maxSplit = node.width - CONFIG.MIN_PARTITION_SIZE;
    if (minSplit >= maxSplit) return;
    const split = randInt(rng, minSplit, maxSplit);
    node.left = new BSPNode(node.x, node.y, split, node.height);
    node.right = new BSPNode(node.x + split, node.y, node.width - split, node.height);
  }

  splitBSP(node.left, rng, depth - 1);
  splitBSP(node.right, rng, depth - 1);
}

// Create a room inside a leaf node
function createRoom(node, rng) {
  const padding = 2;
  const minSize = CONFIG.MIN_ROOM_SIZE;

  const maxW = node.width - padding * 2;
  const maxH = node.height - padding * 2;

  if (maxW < minSize || maxH < minSize) return null;

  const w = randInt(rng, minSize, maxW);
  const h = randInt(rng, minSize, maxH);
  const x = randInt(rng, node.x + padding, node.x + node.width - w - padding);
  const y = randInt(rng, node.y + padding, node.y + node.height - h - padding);

  return {
    x, y, width: w, height: h,
    center: { x: Math.floor(x + w / 2), y: Math.floor(y + h / 2) },
    type: 'normal' // Will be assigned after generation
  };
}

// Collect all rooms from leaf nodes
function collectRooms(node, rng, rooms) {
  if (node.isLeaf) {
    const room = createRoom(node, rng);
    if (room) {
      node.room = room;
      rooms.push(room);
    }
    return;
  }
  if (node.left) collectRooms(node.left, rng, rooms);
  if (node.right) collectRooms(node.right, rng, rooms);
}

// Get a room from a subtree (for corridor connection)
function getRoom(node) {
  if (node.room) return node.room;
  if (node.left) {
    const r = getRoom(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = getRoom(node.right);
    if (r) return r;
  }
  return null;
}

// Carve an L-shaped corridor between two points on the map
function carveCorridor(map, x1, y1, x2, y2, rng) {
  const points = [];

  // Decide whether to go horizontal-first or vertical-first
  if (rng() > 0.5) {
    // Horizontal then vertical
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      points.push({ x, y: y1 });
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      points.push({ x: x2, y });
    }
  } else {
    // Vertical then horizontal
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      points.push({ x: x1, y });
    }
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      points.push({ x, y: y2 });
    }
  }

  for (const p of points) {
    if (p.x >= 0 && p.x < CONFIG.MAP_WIDTH && p.y >= 0 && p.y < CONFIG.MAP_HEIGHT) {
      if (map[p.y][p.x] === TILE.WALL) {
        map[p.y][p.x] = TILE.CORRIDOR;
      }
    }
  }
}

// Connect sibling rooms by walking back up the BSP tree
function connectRooms(node, map, rng) {
  if (node.isLeaf) return;
  if (node.left) connectRooms(node.left, map, rng);
  if (node.right) connectRooms(node.right, map, rng);

  const leftRoom = getRoom(node.left);
  const rightRoom = getRoom(node.right);

  if (leftRoom && rightRoom) {
    carveCorridor(map, leftRoom.center.x, leftRoom.center.y,
                  rightRoom.center.x, rightRoom.center.y, rng);
  }
}

// Place doors where corridors meet rooms
function placeDoors(map, rooms, rng) {
  for (const room of rooms) {
    // Check each tile on the room's border
    for (let x = room.x - 1; x <= room.x + room.width; x++) {
      for (let y = room.y - 1; y <= room.y + room.height; y++) {
        // Skip interior tiles
        if (x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height) continue;
        if (x < 0 || x >= CONFIG.MAP_WIDTH || y < 0 || y >= CONFIG.MAP_HEIGHT) continue;

        if (map[y][x] === TILE.CORRIDOR) {
          // Check if this is a valid door position (corridor connects to room)
          const adjFloor = (
            (y - 1 >= 0 && map[y - 1][x] === TILE.FLOOR) ||
            (y + 1 < CONFIG.MAP_HEIGHT && map[y + 1][x] === TILE.FLOOR) ||
            (x - 1 >= 0 && map[y][x - 1] === TILE.FLOOR) ||
            (x + 1 < CONFIG.MAP_WIDTH && map[y][x + 1] === TILE.FLOOR)
          );

          if (adjFloor && rng() < 0.4) {
            map[y][x] = TILE.DOOR;
          }
        }
      }
    }
  }
}

// Find the room farthest from the start room (for stairs placement)
function findFarthestRoom(startRoom, rooms) {
  let maxDist = 0;
  let farthest = rooms[rooms.length - 1];

  for (const room of rooms) {
    if (room === startRoom) continue;
    const dx = room.center.x - startRoom.center.x;
    const dy = room.center.y - startRoom.center.y;
    const dist = dx * dx + dy * dy;
    if (dist > maxDist) {
      maxDist = dist;
      farthest = room;
    }
  }
  return farthest;
}

// Get spawn points inside a room (excluding center and edges)
function getRoomSpawnPoints(room, count, rng) {
  const points = [];
  const available = [];

  for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
    for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
      if (x !== room.center.x || y !== room.center.y) {
        available.push({ x, y });
      }
    }
  }

  // Shuffle available points
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  return available.slice(0, Math.min(count, available.length));
}

// Main dungeon generation function
export function generateDungeon(seed, floor) {
  const rng = mulberry32(seed + floor * 1000);

  // Initialize map with walls
  const map = [];
  for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
    map[y] = [];
    for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
      map[y][x] = TILE.WALL;
    }
  }

  // Build BSP tree
  const root = new BSPNode(0, 0, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
  splitBSP(root, rng, CONFIG.MAX_BSP_DEPTH);

  // Create rooms in leaf nodes
  const rooms = [];
  collectRooms(root, rng, rooms);

  // Carve rooms into map
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (x >= 0 && x < CONFIG.MAP_WIDTH && y >= 0 && y < CONFIG.MAP_HEIGHT) {
          map[y][x] = TILE.FLOOR;
        }
      }
    }
  }

  // Connect rooms with corridors
  connectRooms(root, map, rng);

  // Place doors
  placeDoors(map, rooms, rng);

  // Place stairs
  const startRoom = rooms[0];
  const endRoom = findFarthestRoom(startRoom, rooms);

  // Stairs up at start room center
  map[startRoom.center.y][startRoom.center.x] = TILE.STAIRS_UP;

  // Stairs down at end room center
  map[endRoom.center.y][endRoom.center.x] = TILE.STAIRS_DOWN;

  // Assign room archetypes with guaranteed special rooms when possible
  assignRoomArchetypes(rooms, startRoom, endRoom, floor, rng);

  // Generate spawn points for entities and items
  const entitySpawns = [];
  const itemSpawns = [];

  for (const room of rooms) {
    if (room === startRoom) continue; // Don't spawn in start room

    const { enemyCount, itemCount } = getRoomSpawnPlan(room, rng, floor);

    const spawns = getRoomSpawnPoints(room, enemyCount + itemCount, rng);

    // First points for enemies
    for (let i = 0; i < Math.min(enemyCount, spawns.length); i++) {
      entitySpawns.push({ ...spawns[i], room });
    }

    // Remaining points for items
    for (let i = enemyCount; i < spawns.length; i++) {
      itemSpawns.push({ ...spawns[i], room });
    }
  }

  // Place environmental hazards. Floor 1 starts with light trap/ice reads; lava arrives later.
  let hazardsPlaced = 0;
  for (const room of rooms) {
    if (room === startRoom || room === endRoom) continue;

    const hazardPlan = getRoomHazardPlan(room, rng, floor);
    if (hazardPlan.chance <= 0 || rng() >= hazardPlan.chance) continue;

    const hazardRoll = rng();
    let hazardType = null;
    if (floor === 1) {
      hazardType = hazardRoll < 0.6 ? TILE.SPIKE_TRAP : TILE.ICE;
    } else if (hazardRoll < 0.35) {
      hazardType = TILE.LAVA;
    } else if (hazardRoll < 0.65) {
      hazardType = TILE.ICE;
    } else {
      hazardType = TILE.SPIKE_TRAP;
    }

    if (hazardType) {
      const count = hazardPlan.count;
      for (let h = 0; h < count; h++) {
        const hx = randInt(rng, room.x + 1, room.x + room.width - 2);
        const hy = randInt(rng, room.y + 1, room.y + room.height - 2);
        // Don't overwrite stairs or doors
        if (map[hy][hx] === TILE.FLOOR) {
          map[hy][hx] = hazardType;
          hazardsPlaced++;
        }
      }
    }
  }

  if (floor === 1 && hazardsPlaced === 0) {
    const fallbackRoom = rooms.find(room => room.type === 'guardpost') ||
      rooms.find(room => room.type === 'vault') ||
      rooms.find(room => room.type === 'normal');
    if (fallbackRoom) {
      for (let i = 0; i < 2; i++) {
        const hx = randInt(rng, fallbackRoom.x + 1, fallbackRoom.x + fallbackRoom.width - 2);
        const hy = randInt(rng, fallbackRoom.y + 1, fallbackRoom.y + fallbackRoom.height - 2);
        if (map[hy][hx] === TILE.FLOOR) {
          map[hy][hx] = i === 0 ? TILE.SPIKE_TRAP : TILE.ICE;
        }
      }
    }
  }

  return {
    map,
    rooms,
    startRoom,
    endRoom,
    entitySpawns,
    itemSpawns,
    playerStart: { x: startRoom.center.x, y: startRoom.center.y }
  };
}

// Check if a tile is walkable
export function isWalkable(tile) {
  return tile === TILE.FLOOR || tile === TILE.CORRIDOR || tile === TILE.DOOR ||
         tile === TILE.STAIRS_DOWN || tile === TILE.STAIRS_UP ||
         tile === TILE.LAVA || tile === TILE.ICE || tile === TILE.SPIKE_TRAP;
}
