// AI System - A* Pathfinding + Enemy Finite State Machine
import { CONFIG, AI_STATE, TILE } from './constants.js';
import { isWalkable } from './dungeon.js';
import { hasLineOfSight } from './fov.js';
import { getEnemyAt, updateEnemySpatialGrid } from './entities.js';
import { countHazardsBetween, getEnemyHazardCost } from './hazards.js';

// Priority Queue (min-heap) for A* open set
class MinHeap {
  constructor() {
    this.data = [];
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() {
    return this.data.length;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

// 8-directional neighbors
const DIRS = [
  { x: 0, y: -1 },  // N
  { x: 1, y: 0 },   // E
  { x: 0, y: 1 },   // S
  { x: -1, y: 0 },  // W
  { x: 1, y: -1 },  // NE
  { x: 1, y: 1 },   // SE
  { x: -1, y: 1 },  // SW
  { x: -1, y: -1 }, // NW
];

// Cardinal directions only (4-way subset)
const CARDINAL_DIRS = DIRS.slice(0, 4);

// Chebyshev distance heuristic (supports 8-way movement)
function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

// Manhattan distance (used for range checks)
function manhattan(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

// A* pathfinding
export function findPath(map, startX, startY, goalX, goalY, enemies, selfEnemy) {
  const openSet = new MinHeap();
  const closedSet = new Set();
  const gScore = {};
  const cameFrom = {};

  const startKey = `${startX},${startY}`;
  gScore[startKey] = 0;

  openSet.push({
    x: startX, y: startY,
    f: chebyshev(startX, startY, goalX, goalY),
    g: 0
  });

  let iterations = 0;
  const maxIterations = CONFIG.MAX_PATH_LENGTH * CONFIG.MAX_PATH_LENGTH;

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = openSet.pop();
    const currentKey = `${current.x},${current.y}`;

    if (current.x === goalX && current.y === goalY) {
      // Reconstruct path
      const path = [];
      let key = currentKey;
      while (key && key !== startKey) {
        const [x, y] = key.split(',').map(Number);
        path.unshift({ x, y });
        key = cameFrom[key];
      }
      return path;
    }

    closedSet.add(currentKey);

    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nKey = `${nx},${ny}`;

      if (closedSet.has(nKey)) continue;
      if (nx < 0 || nx >= CONFIG.MAP_WIDTH || ny < 0 || ny >= CONFIG.MAP_HEIGHT) continue;
      if (!isWalkable(map[ny][nx])) continue;

      // Prevent diagonal corner-cutting through walls
      if (dir.x !== 0 && dir.y !== 0) {
        if (!isWalkable(map[current.y][nx]) || !isWalkable(map[ny][current.x])) continue;
      }

      // Don't path through other enemies (except at the goal)
      if (!(nx === goalX && ny === goalY)) {
        const blockingEnemy = getEnemyAt(enemies, nx, ny);
        if (blockingEnemy && blockingEnemy !== selfEnemy) continue;
      }

      const stepCost = getEnemyHazardCost(selfEnemy, map[ny][nx]);
      const tentativeG = current.g + stepCost;
      const prevG = gScore[nKey];

      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScore[nKey] = tentativeG;
      cameFrom[nKey] = currentKey;

      // Check path length limit
      if (tentativeG > CONFIG.MAX_PATH_LENGTH) continue;

      openSet.push({
        x: nx, y: ny,
        f: tentativeG + chebyshev(nx, ny, goalX, goalY),
        g: tentativeG
      });
    }
  }

  return []; // No path found
}

// Update enemy AI state machine
export function updateEnemyAI(enemy, player, map, enemies, currentTime, rng) {
  if (!enemy.isAlive) return null; // null = no action

  const distToPlayer = chebyshev(enemy.x, enemy.y, player.x, player.y);
  const manhatDist = manhattan(enemy.x, enemy.y, player.x, player.y);
  const canSeePlayer = manhatDist <= enemy.fovRange &&
    hasLineOfSight(map, enemy.x, enemy.y, player.x, player.y);

  // State transitions
  switch (enemy.state) {
    case AI_STATE.IDLE:
      if (canSeePlayer) {
        enemy.state = AI_STATE.CHASE;
      } else {
        // Transition to patrol
        enemy.state = AI_STATE.PATROL;
        pickPatrolTarget(enemy, map, rng);
      }
      break;

    case AI_STATE.PATROL:
      if (canSeePlayer) {
        enemy.state = AI_STATE.CHASE;
        enemy.patrolTarget = null;
      }
      break;

    case AI_STATE.CHASE:
      // Check flee condition (goblin/archer below 25% HP)
      if (enemy.canFlee && enemy.hp < enemy.maxHp * 0.25) {
        enemy.state = AI_STATE.FLEEING;
        break;
      }
      // Troll guard behavior: hold position in spawn room until player enters or troll is damaged
      if (enemy.type === 'troll' && enemy.spawnRoom && enemy.hp === enemy.maxHp) {
        const room = enemy.spawnRoom;
        const playerInRoom = player.x >= room.x && player.x < room.x + room.width &&
                             player.y >= room.y && player.y < room.y + room.height;
        if (!playerInRoom && distToPlayer > 3) {
          // Hold ground — don't chase out of room
          enemy.lastMoveTime = currentTime;
          break;
        }
      }
      // Ranged enemies prefer to attack from distance
      if (enemy.isRanged && distToPlayer <= enemy.attackRange && canSeePlayer) {
        enemy.state = AI_STATE.RANGED_ATTACK;
      } else if (distToPlayer <= 1) {
        enemy.state = AI_STATE.ATTACK;
      } else if (!canSeePlayer && manhatDist > enemy.fovRange + 3) {
        // Lost the player, go back to patrol
        enemy.state = AI_STATE.PATROL;
        pickPatrolTarget(enemy, map, rng);
      }
      break;

    case AI_STATE.RANGED_ATTACK:
      if (enemy.canFlee && enemy.hp < enemy.maxHp * 0.25) {
        enemy.state = AI_STATE.FLEEING;
      } else if (!canSeePlayer || distToPlayer > enemy.attackRange) {
        enemy.state = AI_STATE.CHASE;
      } else if (distToPlayer <= 1) {
        enemy.state = AI_STATE.ATTACK; // Too close, melee instead
      }
      break;

    case AI_STATE.ATTACK:
      if (distToPlayer > 1) {
        enemy.state = AI_STATE.CHASE;
      }
      // Check flee
      if (enemy.canFlee && enemy.hp < enemy.maxHp * 0.25) {
        enemy.state = AI_STATE.FLEEING;
      }
      break;

    case AI_STATE.FLEEING:
      if (enemy.hp >= enemy.maxHp * 0.25) {
        enemy.state = AI_STATE.CHASE;
      }
      break;
  }

  // Check if it's time to move
  if (currentTime - enemy.lastMoveTime < enemy.moveMs) return null;

  // Execute behavior based on state
  let action = null;

  switch (enemy.state) {
    case AI_STATE.PATROL:
      action = doPatrol(enemy, map, enemies, currentTime, rng);
      break;

    case AI_STATE.CHASE:
      action = doChase(enemy, player, map, enemies, currentTime, rng);
      break;

    case AI_STATE.ATTACK:
      action = doAttack(enemy, player, map, enemies, currentTime, rng);
      break;

    case AI_STATE.RANGED_ATTACK:
      action = doRangedAttack(enemy, player, map, enemies, currentTime, rng);
      break;

    case AI_STATE.FLEEING:
      action = doFlee(enemy, player, map, enemies, currentTime);
      break;

    case AI_STATE.IDLE:
      // Do nothing
      break;
  }

  return action;
}

// Pick a random patrol target within the spawn room
function pickPatrolTarget(enemy, map, rng) {
  if (enemy.spawnRoom) {
    const room = enemy.spawnRoom;
    for (let attempts = 0; attempts < 10; attempts++) {
      const x = room.x + Math.floor(rng() * room.width);
      const y = room.y + Math.floor(rng() * room.height);
      if (isWalkable(map[y][x]) && getEnemyHazardCost(enemy, map[y][x]) <= 5) {
        enemy.patrolTarget = { x, y };
        return;
      }
    }
  }
  enemy.patrolTarget = null;
}

function moveEnemy(enemy, enemies, currentTime, nx, ny) {
  const oldX = enemy.x;
  const oldY = enemy.y;
  enemy.x = nx;
  enemy.y = ny;
  enemy.lastMoveTime = currentTime;
  updateEnemySpatialGrid(enemies, enemy, oldX, oldY);

  const action = { type: 'move', fromX: oldX, fromY: oldY };
  if (enemy.hazardTrail) {
    action.leaveHazard = { x: oldX, y: oldY, tile: TILE.LAVA };
  }
  return action;
}

function scoreHazardTile(enemy, map, x, y) {
  return getEnemyHazardCost(enemy, map[y][x]);
}

// Patrol behavior: move toward patrol target
function doPatrol(enemy, map, enemies, currentTime, rng) {
  if (!enemy.patrolTarget) {
    pickPatrolTarget(enemy, map, rng);
    if (!enemy.patrolTarget) return null;
  }

  // Check if reached target
  if (enemy.x === enemy.patrolTarget.x && enemy.y === enemy.patrolTarget.y) {
    pickPatrolTarget(enemy, map, rng);
    return null;
  }

  // Simple move toward target
  const dx = Math.sign(enemy.patrolTarget.x - enemy.x);
  const dy = Math.sign(enemy.patrolTarget.y - enemy.y);

  // Try to move (prefer direction with larger delta)
  const moves = Math.abs(enemy.patrolTarget.x - enemy.x) > Math.abs(enemy.patrolTarget.y - enemy.y)
    ? [{ x: dx, y: 0 }, { x: 0, y: dy }]
    : [{ x: 0, y: dy }, { x: dx, y: 0 }];

  for (const move of moves) {
    if (move.x === 0 && move.y === 0) continue;
    const nx = enemy.x + move.x;
    const ny = enemy.y + move.y;
    if (nx >= 0 && nx < CONFIG.MAP_WIDTH && ny >= 0 && ny < CONFIG.MAP_HEIGHT &&
        isWalkable(map[ny][nx]) && !getEnemyAt(enemies, nx, ny)) {
      return moveEnemy(enemy, enemies, currentTime, nx, ny);
    }
  }

  return null;
}

function getPressuredAdvance(enemy, player, map, enemies) {
  const currentDist = chebyshev(enemy.x, enemy.y, player.x, player.y);
  const commitThreshold = enemy.type === 'goblin' ? 4 : enemy.type === 'skeleton' ? 3 : 5;
  const candidates = [];

  for (const dir of DIRS) {
    const nx = enemy.x + dir.x;
    const ny = enemy.y + dir.y;
    if (nx < 0 || nx >= CONFIG.MAP_WIDTH || ny < 0 || ny >= CONFIG.MAP_HEIGHT) continue;
    if (!isWalkable(map[ny][nx]) || getEnemyAt(enemies, nx, ny)) continue;
    if (dir.x !== 0 && dir.y !== 0) {
      if (!isWalkable(map[enemy.y][nx]) || !isWalkable(map[ny][enemy.x])) continue;
    }

    const nextDist = chebyshev(nx, ny, player.x, player.y);
    if (nextDist >= currentDist) continue;

    const hazardCost = scoreHazardTile(enemy, map, nx, ny);
    if (hazardCost > commitThreshold) continue;
    candidates.push({ x: nx, y: ny, score: (currentDist - nextDist) * 4 - hazardCost });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

// Chase behavior: use A* to pursue player
function doChase(enemy, player, map, enemies, currentTime, rng) {
  // Hesitation: non-goblins sometimes pause (sizing up the player)
  if (enemy.type !== 'goblin' && !enemy.isBoss && rng() < 0.12) {
    enemy.lastMoveTime = currentTime;
    return null; // Skip turn — looks like caution
  }

  const dist = manhattan(enemy.x, enemy.y, player.x, player.y);
  if (!enemy.isRanged && dist <= 3) {
    const pressuredAdvance = getPressuredAdvance(enemy, player, map, enemies);
    if (pressuredAdvance) {
      enemy.path = [];
      return moveEnemy(enemy, enemies, currentTime, pressuredAdvance.x, pressuredAdvance.y);
    }
  }

  // Recalculate path periodically
  if (currentTime - enemy.lastPathTime >= CONFIG.PATHFIND_INTERVAL || enemy.path.length === 0) {
    // Only pathfind if within range
    if (dist <= CONFIG.PATHFIND_RANGE) {
      enemy.path = findPath(map, enemy.x, enemy.y, player.x, player.y, enemies, enemy);
      enemy.lastPathTime = currentTime;
    }
  }

  if (enemy.path.length > 0) {
    const next = enemy.path[0];
    // Check if next step is player position (attack instead)
    if (next.x === player.x && next.y === player.y) {
      return { type: 'attack' };
    }
    // Check if next step is clear
    if (isWalkable(map[next.y][next.x]) && !getEnemyAt(enemies, next.x, next.y)) {
      enemy.path.shift();
      return moveEnemy(enemy, enemies, currentTime, next.x, next.y);
    } else {
      // Path blocked, recalculate next time
      enemy.path = [];
    }
  }

  return null;
}

// Attack behavior: deal damage to player, with occasional repositioning
function doAttack(enemy, player, map, enemies, currentTime, rng) {
  if (enemy.attackCooldown > 0) {
    enemy.attackCooldown -= enemy.moveMs;
    return null;
  }

  // 20% chance to reposition instead of attack (circling/flanking)
  // Makes fights feel more dynamic — enemy moves to another adjacent tile
  if (rng() < 0.20) {
    return doReposition(enemy, player, map, enemies, currentTime, rng);
  }

  enemy.lastMoveTime = currentTime;
  enemy.attackCooldown = enemy.moveMs;
  return { type: 'attack', enemy };
}

// Reposition: move to a different tile adjacent to the player
function doReposition(enemy, player, map, enemies, currentTime, rng) {
  const candidates = [];
  for (const dir of DIRS) {
    const nx = player.x + dir.x;
    const ny = player.y + dir.y;
    if (nx === enemy.x && ny === enemy.y) continue;
    if (nx >= 0 && nx < CONFIG.MAP_WIDTH && ny >= 0 && ny < CONFIG.MAP_HEIGHT &&
        isWalkable(map[ny][nx]) && !getEnemyAt(enemies, nx, ny)) {
      candidates.push({ x: nx, y: ny, score: -scoreHazardTile(enemy, map, nx, ny) });
    }
  }
  if (candidates.length === 0) {
    enemy.lastMoveTime = currentTime;
    enemy.attackCooldown = enemy.moveMs;
    return { type: 'attack', enemy };
  }
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
  const target = topCandidates[Math.floor(rng() * topCandidates.length)];
  return moveEnemy(enemy, enemies, currentTime, target.x, target.y);
}

// Ranged attack: shoot from distance, try to maintain range
function doRangedAttack(enemy, player, map, enemies, currentTime, rng) {
  const dist = chebyshev(enemy.x, enemy.y, player.x, player.y);

  // If player is adjacent, kite away instead of shooting
  if (dist <= 1) {
    return doFlee(enemy, player, map, enemies, currentTime);
  }

  const bestTile = findBestRangedTile(enemy, player, map, enemies);
  const currentScore = scoreRangedTile(enemy, player, map, enemy.x, enemy.y);

  // Reposition to a clearly better firing tile before shooting
  if (bestTile && (bestTile.x !== enemy.x || bestTile.y !== enemy.y) && bestTile.score > currentScore + 1) {
    return moveEnemy(enemy, enemies, currentTime, bestTile.x, bestTile.y);
  }

  // Shoot if in range and has line of sight
  if (dist <= enemy.attackRange && hasLineOfSight(map, enemy.x, enemy.y, player.x, player.y)) {
    enemy.lastMoveTime = currentTime;
    return { type: 'ranged_attack', enemy, fromX: enemy.x, fromY: enemy.y };
  }

  // Otherwise chase closer
  return doChase(enemy, player, map, enemies, currentTime, rng);
}

function scoreRangedTile(enemy, player, map, x, y) {
  if (!hasLineOfSight(map, x, y, player.x, player.y)) return -Infinity;

  const distance = chebyshev(x, y, player.x, player.y);
  if (distance <= 1) return -Infinity;

  let score = 0;
  score -= Math.abs(distance - enemy.attackRange) * 2.6;
  score -= scoreHazardTile(enemy, map, x, y) * 0.7;

  if (enemy.prefersHazardBuffer) {
    score += countHazardsBetween(map, x, y, player.x, player.y) * 2.5;
  }

  return score;
}

function findBestRangedTile(enemy, player, map, enemies) {
  const candidates = [{ x: enemy.x, y: enemy.y }];
  for (const dir of DIRS) {
    const nx = enemy.x + dir.x;
    const ny = enemy.y + dir.y;
    if (nx < 0 || nx >= CONFIG.MAP_WIDTH || ny < 0 || ny >= CONFIG.MAP_HEIGHT) continue;
    if (!isWalkable(map[ny][nx])) continue;
    if (getEnemyAt(enemies, nx, ny)) continue;
    candidates.push({ x: nx, y: ny });
  }

  let best = null;
  for (const candidate of candidates) {
    const score = scoreRangedTile(enemy, player, map, candidate.x, candidate.y);
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }
  return best;
}

// Flee behavior: run away from player
function doFlee(enemy, player, map, enemies, currentTime) {
  // Move in the direction away from the player
  const dx = Math.sign(enemy.x - player.x);
  const dy = Math.sign(enemy.y - player.y);

  // Try multiple escape directions
  const escapes = [
    { x: dx, y: dy },
    { x: dx, y: 0 },
    { x: 0, y: dy },
    { x: -dy, y: dx },  // perpendicular
    { x: dy, y: -dx }   // other perpendicular
  ];

  const candidates = [];
  for (const move of escapes) {
    if (move.x === 0 && move.y === 0) continue;
    const nx = enemy.x + move.x;
    const ny = enemy.y + move.y;
    if (nx >= 0 && nx < CONFIG.MAP_WIDTH && ny >= 0 && ny < CONFIG.MAP_HEIGHT &&
        isWalkable(map[ny][nx]) && !getEnemyAt(enemies, nx, ny)) {
      const distanceScore = manhattan(nx, ny, player.x, player.y) * 2;
      const hazardScore = scoreHazardTile(enemy, map, nx, ny);
      candidates.push({ x: nx, y: ny, score: distanceScore - hazardScore });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return moveEnemy(enemy, enemies, currentTime, candidates[0].x, candidates[0].y);
}

// Update all enemies
export function updateAllEnemies(enemies, player, map, currentTime, rng) {
  const actions = [];
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    const dist = manhattan(enemy.x, enemy.y, player.x, player.y);
    // Skip distant enemies entirely
    if (dist > CONFIG.PATHFIND_RANGE && enemy.state !== AI_STATE.PATROL) continue;

    const action = updateEnemyAI(enemy, player, map, enemies, currentTime, rng);
    if (action) {
      action.enemy = enemy;
      actions.push(action);
    }
  }
  return actions;
}
