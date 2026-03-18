// AI System - A* Pathfinding + Enemy Finite State Machine
import { CONFIG, AI_STATE } from './constants.js';
import { isWalkable } from './dungeon.js';
import { hasLineOfSight } from './fov.js';
import { getEnemyAt } from './entities.js';

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

// 4-directional neighbors (no diagonal movement)
const DIRS = [
  { x: 0, y: -1 }, // up
  { x: 1, y: 0 },  // right
  { x: 0, y: 1 },  // down
  { x: -1, y: 0 }  // left
];

// Manhattan distance heuristic
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
    f: manhattan(startX, startY, goalX, goalY),
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

      // Don't path through other enemies (except at the goal)
      if (!(nx === goalX && ny === goalY)) {
        const blockingEnemy = getEnemyAt(enemies, nx, ny);
        if (blockingEnemy && blockingEnemy !== selfEnemy) continue;
      }

      const tentativeG = current.g + 1;
      const prevG = gScore[nKey];

      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScore[nKey] = tentativeG;
      cameFrom[nKey] = currentKey;

      // Check path length limit
      if (tentativeG > CONFIG.MAX_PATH_LENGTH) continue;

      openSet.push({
        x: nx, y: ny,
        f: tentativeG + manhattan(nx, ny, goalX, goalY),
        g: tentativeG
      });
    }
  }

  return []; // No path found
}

// Update enemy AI state machine
export function updateEnemyAI(enemy, player, map, enemies, currentTime, rng) {
  if (!enemy.isAlive) return null; // null = no action

  // Update blind timer
  if (enemy.blindTimer > 0) {
    enemy.blindTimer -= CONFIG.GAME_TICK_MS;
    if (enemy.blindTimer < 0) enemy.blindTimer = 0;
  }

  const distToPlayer = manhattan(enemy.x, enemy.y, player.x, player.y);
  const canSeePlayer = distToPlayer <= enemy.fovRange &&
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
      // Check flee condition (goblin below 25% HP)
      if (enemy.canFlee && enemy.hp < enemy.maxHp * 0.25) {
        enemy.state = AI_STATE.FLEEING;
        break;
      }
      if (distToPlayer <= 1) {
        enemy.state = AI_STATE.ATTACK;
      } else if (!canSeePlayer && distToPlayer > enemy.fovRange + 3) {
        // Lost the player, go back to patrol
        enemy.state = AI_STATE.PATROL;
        pickPatrolTarget(enemy, map, rng);
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
      action = doChase(enemy, player, map, enemies, currentTime);
      break;

    case AI_STATE.ATTACK:
      action = doAttack(enemy, player, currentTime);
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
      if (isWalkable(map[y][x])) {
        enemy.patrolTarget = { x, y };
        return;
      }
    }
  }
  enemy.patrolTarget = null;
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
      enemy.x = nx;
      enemy.y = ny;
      enemy.lastMoveTime = currentTime;
      return { type: 'move' };
    }
  }

  return null;
}

// Chase behavior: use A* to pursue player
function doChase(enemy, player, map, enemies, currentTime) {
  // Recalculate path periodically
  if (currentTime - enemy.lastPathTime >= CONFIG.PATHFIND_INTERVAL || enemy.path.length === 0) {
    // Only pathfind if within range
    const dist = manhattan(enemy.x, enemy.y, player.x, player.y);
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
      enemy.x = next.x;
      enemy.y = next.y;
      enemy.path.shift();
      enemy.lastMoveTime = currentTime;
      return { type: 'move' };
    } else {
      // Path blocked, recalculate next time
      enemy.path = [];
    }
  }

  return null;
}

// Attack behavior: deal damage to player
function doAttack(enemy, player, currentTime) {
  if (enemy.attackCooldown > 0) {
    enemy.attackCooldown -= CONFIG.GAME_TICK_MS;
    return null;
  }

  enemy.lastMoveTime = currentTime;
  enemy.attackCooldown = enemy.moveMs; // Attack speed matches move speed
  return { type: 'attack', enemy };
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

  for (const move of escapes) {
    if (move.x === 0 && move.y === 0) continue;
    const nx = enemy.x + move.x;
    const ny = enemy.y + move.y;
    if (nx >= 0 && nx < CONFIG.MAP_WIDTH && ny >= 0 && ny < CONFIG.MAP_HEIGHT &&
        isWalkable(map[ny][nx]) && !getEnemyAt(enemies, nx, ny)) {
      enemy.x = nx;
      enemy.y = ny;
      enemy.lastMoveTime = currentTime;
      return { type: 'move' };
    }
  }

  return null;
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
