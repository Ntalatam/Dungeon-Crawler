// Dungeon Crawler - Entry Point & Game Loop
import { CONFIG, STATE, TILE, FLOOR_CONFIG, DIFFICULTY, COLORS } from './constants.js';
import { generateDungeon, isWalkable, mulberry32 } from './dungeon.js';
import { Renderer } from './renderer.js';
import { computeFOV, updateExplored, createExploredMap } from './fov.js';
import { Player, Item, spawnEnemies, spawnItems, getItemAt, getEnemyAt, buildEnemySpatialGrid } from './entities.js';
import { updateAllEnemies } from './ai.js';
import { playerAttack, enemyAttack, pickupItem, generateLoot, applyBlinding } from './combat.js';
import { MessageLog, drawHUD, drawMainMenu, drawHowToPlay, drawPauseMenu, drawGameOver, drawVictory, drawLevelTransition, drawStore } from './ui.js';
import { playPickup, playKeyPickup, playDescend, playHazard, playPlayerDeath, playArrowShoot, playBossReveal, toggleMute, isMuted } from './audio.js';

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Renderer
const renderer = new Renderer(canvas);

// Game state
let state = STATE.MAIN_MENU;
let seed = 0;
let floor = 1;
let map = null;
let rooms = null;
let endRoom = null;
let explored = null;
let visible = null;
let player = null;
let enemies = [];
let items = [];
let messageLog = new MessageLog();
let rng = null;

// Input state - held-key tracking system
let heldKeys = new Set();       // Currently held keys
let lastDirectionKey = null;    // Most recently pressed direction
let pendingAction = null;       // Non-movement action (e.g. 'e', ' ', '>')
let pauseMenuSelection = 0;
let pauseMenuHover = -1;        // Mouse hover index for pause menu
let showHowToPlay = false;
let howToPlayScroll = 0;
let gameStartTime = 0;
let lastMoveProcessTime = 0;
let mainMenuHover = '';         // 'start', 'help', 'store', or ''
let showStore = false;
let difficulty = 'normal';      // 'easy', 'normal', 'hard'
let customSeed = null;          // null = random, number = fixed seed

// Key progression
let keysCollected = 0;
let keysRequired = 0;
let bossRevealTriggered = false;

// Minimap overlay
let minimapEnlarged = false;

// Item/enemy hover tooltip
let hoveredItem = null;
let hoveredEnemy = null;
let mouseScreenX = 0;
let mouseScreenY = 0;

// Level transition
let transitionProgress = 0;
const TRANSITION_DURATION = 1500;

// High scores (localStorage)
let highScores = loadHighScores();

// ---- Input handling ----
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'e', 'E', 'q', 'Q', 'z', 'Z', 'c', 'C',
  'f', 'F', 'r', 'R', 'b', 'B', 't', 'T',
  ' ', '.', '>', 'Enter', 'Escape', '?', '/', 'i', 'I', 'm', 'M']);

// Normalize key to lowercase for direction tracking
function normalizeKey(key) {
  if (key.length === 1) return key.toLowerCase();
  return key;
}

// Direction key mappings (4-way + diagonals)
const DIRECTION_MAP = {
  'ArrowUp': { dx: 0, dy: -1 }, 'w': { dx: 0, dy: -1 },
  'ArrowDown': { dx: 0, dy: 1 }, 's': { dx: 0, dy: 1 },
  'ArrowLeft': { dx: -1, dy: 0 }, 'a': { dx: -1, dy: 0 },
  'ArrowRight': { dx: 1, dy: 0 }, 'd': { dx: 1, dy: 0 },
  'q': { dx: -1, dy: -1 }, // NW
  'e': { dx: 1, dy: -1 },  // NE
  'z': { dx: -1, dy: 1 },  // SW
  'c': { dx: 1, dy: 1 },   // SE
};

function isDirectionKey(key) {
  return normalizeKey(key) in DIRECTION_MAP || key in DIRECTION_MAP;
}

function getDirection(key) {
  return DIRECTION_MAP[normalizeKey(key)] || DIRECTION_MAP[key] || null;
}

// Update cursor based on current state
function updateCursor() {
  if (state === STATE.PLAYING && !minimapEnlarged) {
    canvas.style.cursor = 'none';
  } else {
    canvas.style.cursor = 'default';
  }
}

document.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.key)) e.preventDefault();

  const nk = normalizeKey(e.key);

  if (state === STATE.MAIN_MENU) {
    if (showStore) {
      if (e.key === 'Escape') showStore = false;
      return;
    }
    if (showHowToPlay) {
      if (e.key === 'Escape' || nk === '?' || nk === 'i') {
        showHowToPlay = false;
      } else if (e.key === 'ArrowDown' || nk === 's') {
        howToPlayScroll = Math.min(howToPlayScroll + 40, 900);
      } else if (e.key === 'ArrowUp' || nk === 'w') {
        howToPlayScroll = Math.max(howToPlayScroll - 40, 0);
      }
      return;
    }
    if (nk === '?' || nk === 'i') {
      showHowToPlay = true;
      howToPlayScroll = 0;
      return;
    }
    // Difficulty cycle
    if (nk === 'd') {
      const modes = ['easy', 'normal', 'hard'];
      const idx = modes.indexOf(difficulty);
      difficulty = modes[(idx + 1) % modes.length];
      return;
    }
    // Custom seed input
    if (nk === 's') {
      const input = window.prompt('Enter a seed (number or text):', '');
      if (input !== null && input.trim() !== '') {
        const num = parseInt(input.trim(), 10);
        customSeed = isNaN(num) ? hashString(input.trim()) : num;
      } else {
        customSeed = null;
      }
      return;
    }
    // Daily run (date-based seed)
    if (nk === 't') {
      const today = new Date();
      customSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      return;
    }
    if (e.key === 'Enter') {
      startNewGame();
    }
    return;
  }

  if (state === STATE.GAME_OVER || state === STATE.VICTORY) {
    if (nk === 'r') {
      state = STATE.MAIN_MENU;
      updateCursor();
    }
    return;
  }

  if (state === STATE.PAUSED) {
    handlePauseInput(e.key);
    return;
  }

  if (state === STATE.PLAYING) {
    if (e.key === 'Escape') {
      if (minimapEnlarged) {
        minimapEnlarged = false;
      } else {
        state = STATE.PAUSED;
        pauseMenuSelection = 0;
        pauseMenuHover = -1;
      }
      updateCursor();
      return;
    }
    if (nk === 'm') {
      minimapEnlarged = !minimapEnlarged;
      updateCursor();
      return;
    }
    if (nk === 'b') {
      renderer.colorblindMode = !renderer.colorblindMode;
      messageLog.add(renderer.colorblindMode ? 'Colorblind mode ON' : 'Colorblind mode OFF');
      return;
    }
    // Don't accept game input while minimap is open
    if (minimapEnlarged) return;

    // Track held direction keys (last pressed wins)
    if (isDirectionKey(e.key)) {
      const normalized = normalizeKey(e.key);
      // Use the arrow key or normalized letter as the canonical key
      const canonical = e.key.startsWith('Arrow') ? e.key : normalized;
      heldKeys.add(canonical);
      lastDirectionKey = canonical;
    } else {
      // Non-movement actions: buffer for single use
      pendingAction = e.key;
    }
  }
});

document.addEventListener('keyup', (e) => {
  const nk = normalizeKey(e.key);
  const canonical = e.key.startsWith('Arrow') ? e.key : nk;
  heldKeys.delete(canonical);

  // If we released the active direction, pick another held direction
  if (canonical === lastDirectionKey) {
    lastDirectionKey = null;
    for (const k of heldKeys) {
      if (isDirectionKey(k)) {
        lastDirectionKey = k;
      }
    }
  }
});

// Clear held keys on window blur (prevents stuck keys)
window.addEventListener('blur', () => {
  heldKeys.clear();
  lastDirectionKey = null;
});

// ---- Click handling (unified) ----
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (state === STATE.MAIN_MENU) {
    if (showStore) {
      showStore = false;
      return;
    }
    if (showHowToPlay) {
      showHowToPlay = false;
      return;
    }
    handleMainMenuClick(mx, my);
    return;
  }

  if (state === STATE.PAUSED) {
    handlePauseClick(mx, my);
    return;
  }

  if (state === STATE.GAME_OVER || state === STATE.VICTORY) {
    state = STATE.MAIN_MENU;
    updateCursor();
    return;
  }

  if (state === STATE.PLAYING) {
    if (minimapEnlarged) {
      minimapEnlarged = false;
      updateCursor();
      return;
    }
    // Check minimap click
    const mmX = canvas.width - CONFIG.MINIMAP_WIDTH - 10;
    const mmY = 10;
    if (mx >= mmX - 2 && mx <= mmX + CONFIG.MINIMAP_WIDTH + 6 &&
        my >= mmY - 2 && my <= mmY + CONFIG.MINIMAP_HEIGHT + 6) {
      minimapEnlarged = true;
      updateCursor();
    }
  }
});

function handleMainMenuClick(mx, my) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  // Start button area (matches ui.js layout)
  const startBtnY = cy + 140;
  if (mx >= cx - 150 && mx <= cx + 150 && my >= startBtnY - 23 && my <= startBtnY + 23) {
    startNewGame();
    return;
  }
  // Store button area
  const storeBtnY = cy + 204;
  if (mx >= cx - 100 && mx <= cx + 100 && my >= storeBtnY - 19 && my <= storeBtnY + 19) {
    showStore = true;
    return;
  }
  // Help icon area (bottom-right, larger)
  const iconX = canvas.width - 55;
  const iconY = canvas.height - 50;
  if (Math.hypot(mx - iconX, my - iconY) < 24) {
    showHowToPlay = true;
    howToPlayScroll = 0;
  }
}

function handlePauseClick(mx, my) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const btnW = 200;
  const btnH = 36;
  for (let i = 0; i < 3; i++) {
    const btnY = cy - 10 + i * 44;
    if (mx >= cx - btnW / 2 && mx <= cx + btnW / 2 &&
        my >= btnY - btnH / 2 && my <= btnY + btnH / 2) {
      switch (i) {
        case 0: state = STATE.PLAYING; updateCursor(); break;
        case 1: startNewGame(); break;
        case 2: state = STATE.MAIN_MENU; updateCursor(); break;
      }
      return;
    }
  }
}

// ---- Mouse hover tracking ----
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (state === STATE.MAIN_MENU) {
    if (showStore || showHowToPlay) {
      canvas.style.cursor = 'pointer';
      return;
    }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const startBtnY = cy + 140;
    const storeBtnY = cy + 204;
    const iconX = canvas.width - 55;
    const iconY = canvas.height - 50;
    if (mx >= cx - 150 && mx <= cx + 150 && my >= startBtnY - 23 && my <= startBtnY + 23) {
      mainMenuHover = 'start';
      canvas.style.cursor = 'pointer';
    } else if (mx >= cx - 100 && mx <= cx + 100 && my >= storeBtnY - 19 && my <= storeBtnY + 19) {
      mainMenuHover = 'store';
      canvas.style.cursor = 'pointer';
    } else if (Math.hypot(mx - iconX, my - iconY) < 24) {
      mainMenuHover = 'help';
      canvas.style.cursor = 'pointer';
    } else {
      mainMenuHover = '';
      canvas.style.cursor = 'default';
    }
    return;
  }

  if (state === STATE.PAUSED) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const btnW = 200;
    const btnH = 36;
    let hovering = false;
    for (let i = 0; i < 3; i++) {
      const btnY = cy - 10 + i * 44;
      if (mx >= cx - btnW / 2 && mx <= cx + btnW / 2 &&
          my >= btnY - btnH / 2 && my <= btnY + btnH / 2) {
        pauseMenuHover = i;
        pauseMenuSelection = i;
        canvas.style.cursor = 'pointer';
        hovering = true;
        break;
      }
    }
    if (!hovering) {
      pauseMenuHover = -1;
      canvas.style.cursor = 'default';
    }
    return;
  }

  if (state === STATE.GAME_OVER || state === STATE.VICTORY) {
    canvas.style.cursor = 'pointer';
    return;
  }

  if (state === STATE.PLAYING) {
    mouseScreenX = mx;
    mouseScreenY = my;

    if (minimapEnlarged) {
      canvas.style.cursor = 'pointer';
      hoveredItem = null;
      hoveredEnemy = null;
      return;
    }
    const mmX = canvas.width - CONFIG.MINIMAP_WIDTH - 10;
    const mmY = 10;
    if (mx >= mmX - 2 && mx <= mmX + CONFIG.MINIMAP_WIDTH + 6 &&
        my >= mmY - 2 && my <= mmY + CONFIG.MINIMAP_HEIGHT + 6) {
      canvas.style.cursor = 'pointer';
      hoveredItem = null;
      hoveredEnemy = null;
    } else {
      canvas.style.cursor = 'none';
      // Check for item under mouse cursor (world coordinates)
      const offset = renderer.getOffset();
      const worldX = Math.floor((mx - offset.x) / CONFIG.TILE_SIZE);
      const worldY = Math.floor((my - offset.y) / CONFIG.TILE_SIZE);
      hoveredItem = null;
      hoveredEnemy = null;
      if (worldX >= 0 && worldX < CONFIG.MAP_WIDTH && worldY >= 0 && worldY < CONFIG.MAP_HEIGHT) {
        if (visible && visible[worldY][worldX]) {
          hoveredItem = getItemAt(items, worldX, worldY) || null;
          hoveredEnemy = getEnemyAt(enemies, worldX, worldY) || null;
        }
      }
    }
  }
});

function handlePauseInput(key) {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      pauseMenuSelection = Math.max(0, pauseMenuSelection - 1);
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      pauseMenuSelection = Math.min(2, pauseMenuSelection + 1);
      break;
    case 'Enter':
      switch (pauseMenuSelection) {
        case 0: state = STATE.PLAYING; updateCursor(); break;
        case 1: startNewGame(); break;
        case 2: state = STATE.MAIN_MENU; updateCursor(); break;
      }
      break;
    case 'Escape':
      state = STATE.PLAYING;
      updateCursor();
      break;
  }
}

// Simple string hash for text seeds
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ---- Game initialization ----
function startNewGame() {
  seed = customSeed !== null ? customSeed : Date.now();
  floor = 1;
  player = null;
  gameEnded = false;
  minimapEnlarged = false;
  heldKeys.clear();
  lastDirectionKey = null;
  pendingAction = null;
  showStore = false;
  showHowToPlay = false;
  messageLog = new MessageLog();
  initFloor();
  gameStartTime = Date.now();
  state = STATE.PLAYING;
  updateCursor();
}

function initFloor() {
  rng = mulberry32(seed + floor * 1000);

  // Generate dungeon
  const dungeon = generateDungeon(seed, floor);
  map = dungeon.map;
  rooms = dungeon.rooms;
  endRoom = dungeon.endRoom;

  // Create or reset player position
  if (!player || floor === 1) {
    player = new Player(dungeon.playerStart.x, dungeon.playerStart.y);
  } else {
    // Keep player stats, reset position to stairs up
    player.x = dungeon.playerStart.x;
    player.y = dungeon.playerStart.y;
    player.renderX = player.x;
    player.renderY = player.y;
  }

  // Spawn entities with difficulty scaling
  const diff = DIFFICULTY[difficulty];
  enemies = spawnEnemies(floor, dungeon.entitySpawns, rooms, rng);
  // Apply difficulty multipliers to enemies
  for (const enemy of enemies) {
    enemy.hp = Math.round(enemy.hp * diff.enemyHpMult);
    enemy.maxHp = enemy.hp;
    enemy.baseDamage = Math.round(enemy.baseDamage * diff.enemyDmgMult);
    enemy.xpValue = Math.round(enemy.xpValue * diff.xpMult);
  }
  items = spawnItems(floor, dungeon.itemSpawns, rng);

  // Key progression system
  const floorConfig = FLOOR_CONFIG[floor];
  keysRequired = floorConfig.keysRequired || 0;
  keysCollected = 0;

  // Spawn keys in guarded rooms (farthest from start, excluding start/end rooms)
  if (keysRequired > 0) {
    const startRoom = dungeon.startRoom;
    const candidates = rooms.filter(r => r !== startRoom && r !== endRoom);
    candidates.sort((a, b) => {
      const da = (a.center.x - startRoom.center.x) ** 2 + (a.center.y - startRoom.center.y) ** 2;
      const db = (b.center.x - startRoom.center.x) ** 2 + (b.center.y - startRoom.center.y) ** 2;
      return db - da; // Farthest first
    });
    for (let i = 0; i < Math.min(keysRequired, candidates.length); i++) {
      const room = candidates[i];
      items.push(new Item(room.center.x, room.center.y, 'key', 'floor_key', {
        name: 'Floor Key'
      }));
    }
  }

  // Initialize FOV
  explored = createExploredMap();
  visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
  updateExplored(explored, visible, player.x, player.y, CONFIG.FOV_RADIUS);
  renderer.invalidateMap();

  // Initialize renderer
  renderer.generateGrit(mulberry32(seed + floor * 2000));
  renderer.snapCamera(player.x, player.y);
  renderer.effects = [];
  renderer.bossRevealed = false;
  bossRevealTriggered = false;

  messageLog.add(`Floor ${floor}. ${floor === 1 ? 'Find the stairs to descend.' : 'You descend deeper...'}`);
  if (keysRequired > 0) {
    messageLog.add(`Find ${keysRequired} key${keysRequired > 1 ? 's' : ''} to unlock the stairs.`);
  }
  if (floor === CONFIG.MAX_FLOORS) {
    messageLog.add('You sense a powerful presence nearby...');
  }
}

// ---- Process player input ----
function processInput() {
  if (!player.isAlive) return;

  let dx = 0, dy = 0;
  let moved = false;
  let acted = false;

  // Check for non-movement action first (single-fire from keydown)
  if (pendingAction) {
    const action = normalizeKey(pendingAction);
    pendingAction = null;
    switch (action) {
      case ' ': case '.': acted = true; break; // Wait
      case 'f': tryPickup(); acted = true; break;
      case 'Enter': case '>': tryDescend(); return;
    }
  }

  // Check for held movement direction (continuous movement)
  if (!acted && lastDirectionKey) {
    const now = performance.now();
    if (now - lastMoveProcessTime < CONFIG.MOVE_COOLDOWN_MS) return;

    const dir = getDirection(lastDirectionKey);
    if (dir) {
      dx = dir.dx;
      dy = dir.dy;
    }
  }

  if (dx !== 0 || dy !== 0) {
    lastMoveProcessTime = performance.now();
    const newX = player.x + dx;
    const newY = player.y + dy;

    if (newX >= 0 && newX < CONFIG.MAP_WIDTH && newY >= 0 && newY < CONFIG.MAP_HEIGHT) {
      // Prevent diagonal corner-cutting through walls
      const isDiagonal = dx !== 0 && dy !== 0;
      const cornerBlocked = isDiagonal && (!isWalkable(map[player.y][newX]) || !isWalkable(map[newY][player.x]));

      if (!cornerBlocked) {
        const targetEnemy = getEnemyAt(enemies, newX, newY);
        if (targetEnemy) {
          playerAttack(player, targetEnemy, rng, messageLog, renderer);
          acted = true;

          if (!targetEnemy.isAlive) {
            const loot = generateLoot(targetEnemy, floor, rng);
            if (loot) {
              items.push(loot);
              messageLog.add(`The ${targetEnemy.name} dropped a ${loot.name}!`);
            }
          }
        } else if (isWalkable(map[newY][newX])) {
          player.x = newX;
          player.y = newY;
          moved = true;
          acted = true;

          // Apply hazard effects
          const tile = map[player.y][player.x];
          if (tile === TILE.LAVA) {
            const lavaDmg = 5;
            player.hp -= lavaDmg;
            if (player.hp < 0) player.hp = 0;
            player.lastDamageTime = Date.now();
            messageLog.add(`The lava burns you! (-${lavaDmg} HP)`);
            renderer.addEffect(player.x, player.y, `-${lavaDmg}`, '#ff6600');
            renderer.flash('#ff3300', 150);
            renderer.shake(3, 0.9);
            player.hitFlash = 100;
            playHazard();
            if (player.hp <= 0) {
              player.causeOfDeath = 'Burned to death by lava';
              playPlayerDeath();
              saveHighScores();
              state = STATE.GAME_OVER;
              return;
            }
          } else if (tile === TILE.ICE) {
            // Slide one extra tile in the same direction (if walkable)
            const slideX = player.x + dx;
            const slideY = player.y + dy;
            if (slideX >= 0 && slideX < CONFIG.MAP_WIDTH && slideY >= 0 && slideY < CONFIG.MAP_HEIGHT &&
                isWalkable(map[slideY][slideX]) && !getEnemyAt(enemies, slideX, slideY)) {
              player.x = slideX;
              player.y = slideY;
            }
          } else if (tile === TILE.SPIKE_TRAP) {
            const spikeDmg = 3;
            player.hp -= spikeDmg;
            if (player.hp < 0) player.hp = 0;
            player.lastDamageTime = Date.now();
            messageLog.add(`Spike trap! (-${spikeDmg} HP)`);
            renderer.addEffect(player.x, player.y, `-${spikeDmg}`, '#aaaaaa');
            renderer.shake(2, 0.9);
            player.hitFlash = 80;
            playHazard();
            if (player.hp <= 0) {
              player.causeOfDeath = 'Impaled by spike trap';
              playPlayerDeath();
              saveHighScores();
              state = STATE.GAME_OVER;
              return;
            }
          }

          // Auto-pickup keys only (potions require manual pickup)
          const groundItem = getItemAt(items, player.x, player.y);
          if (groundItem && groundItem.type === 'key') {
            const pickedUp = pickupItem(player, groundItem, items, messageLog, renderer);
            if (pickedUp) {
              keysCollected++;
              if (keysCollected >= keysRequired) {
                messageLog.add('The stairs are now unlocked!');
              }
            }
          }
        }
      }
    }
  }

  if (moved) {
    visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
    updateExplored(explored, visible, player.x, player.y, CONFIG.FOV_RADIUS);
    renderer.invalidateMap();
  }

}


// Try to pick up item at player position
function tryPickup() {
  const item = getItemAt(items, player.x, player.y);
  if (item) {
    const pickedUp = pickupItem(player, item, items, messageLog, renderer);
    if (pickedUp) {
      if (pickedUp.type === 'scroll' && pickedUp.subtype === 'blinding') {
        applyBlinding(player, enemies, visible, messageLog);
      } else if (pickedUp.type === 'key') {
        keysCollected++;
        if (keysCollected >= keysRequired) {
          messageLog.add('The stairs are now unlocked!');
        }
      }
    }
  } else {
    messageLog.add('Nothing to pick up here.');
  }
}

// Try to descend stairs
function tryDescend() {
  if (map[player.y][player.x] === TILE.STAIRS_DOWN) {
    // Check key requirement
    if (keysCollected < keysRequired) {
      const remaining = keysRequired - keysCollected;
      messageLog.add(`The stairs are sealed. You need ${remaining} more key${remaining > 1 ? 's' : ''}.`);
      return;
    }

    if (floor >= CONFIG.MAX_FLOORS) {
      // Victory!
      saveHighScores();
      state = STATE.VICTORY;
      return;
    }

    // Start level transition
    floor++;
    transitionProgress = 0;
    state = STATE.LEVEL_TRANSITION;
    playDescend();
    saveHighScores();
  } else {
    messageLog.add('No stairs here.');
  }
}

// Real-time enemy update — called every frame, enemies act on their own timers
function updateEnemiesRealTime() {
  if (!player || !player.isAlive) return;

  const now = performance.now();
  const actions = updateAllEnemies(enemies, player, map, now, rng);

  let needFOVUpdate = false;
  for (const action of actions) {
    if ((action.type === 'attack' || action.type === 'ranged_attack') && action.enemy) {
      if (action.type === 'ranged_attack') {
        // Show projectile trail effect
        renderer.addProjectile(action.fromX, action.fromY, player.x, player.y, action.enemy.color);
        playArrowShoot();
      }
      const playerDied = enemyAttack(action.enemy, player, rng, messageLog, renderer);
      if (playerDied) {
        playPlayerDeath();
        saveHighScores();
        state = STATE.GAME_OVER;
        return;
      }
    }
    if (action.type === 'move') {
      needFOVUpdate = true;
    }
  }

  // Update FOV if any enemy moved (might have entered/exited visible area)
  if (needFOVUpdate) {
    visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
    renderer.invalidateMap();
  }
}

// ---- Persistence ----
function loadHighScores() {
  try {
    const data = localStorage.getItem('dungeonCrawler');
    return data ? JSON.parse(data) : { highScore: 0, bestKills: 0, gamesPlayed: 0, lastSeed: 0 };
  } catch {
    return { highScore: 0, bestKills: 0, gamesPlayed: 0, lastSeed: 0 };
  }
}

let gameEnded = false;

function saveHighScores() {
  try {
    highScores.highScore = Math.max(highScores.highScore || 0, floor);
    highScores.bestKills = Math.max(highScores.bestKills || 0, player ? player.kills : 0);
    if (!gameEnded && (state === STATE.GAME_OVER || state === STATE.VICTORY)) {
      highScores.gamesPlayed = (highScores.gamesPlayed || 0) + 1;
      gameEnded = true;
    }
    highScores.lastSeed = seed;
    localStorage.setItem('dungeonCrawler', JSON.stringify(highScores));
  } catch {
    // localStorage might not be available
  }
}

// ---- Item tooltip ----
function getItemDescription(item) {
  switch (item.type) {
    case 'potion': return `Restores ${item.data.healAmount} HP`;
    case 'weapon': {
      let desc = `${item.data.minDamage}-${item.data.maxDamage} damage`;
      if (item.data.cursed) desc += ` (cursed: -${item.data.hpDrain} HP/hit)`;
      return desc;
    }
    case 'armor': return `+${item.data.defense} defense`;
    case 'scroll': return `Blinds nearest enemy`;
    case 'key': return `Unlocks the stairs`;
    default: return '';
  }
}

function drawItemTooltip(ctx, item, sx, sy) {
  const name = item.name;
  const desc = getItemDescription(item);

  ctx.font = 'bold 13px monospace';
  const nameWidth = ctx.measureText(name).width;
  ctx.font = '11px monospace';
  const descWidth = ctx.measureText(desc).width;
  const textWidth = Math.max(nameWidth, descWidth);

  const padX = 10;
  const padY = 6;
  const tipW = textWidth + padX * 2;
  const tipH = 38 + padY;
  // Position above cursor, clamp to screen
  let tx = sx - tipW / 2;
  let ty = sy - tipH - 16;
  tx = Math.max(4, Math.min(tx, canvas.width - tipW - 4));
  ty = Math.max(4, ty);

  // Background
  ctx.fillStyle = 'rgba(10, 10, 24, 0.92)';
  ctx.beginPath();
  ctx.moveTo(tx + 4, ty);
  ctx.lineTo(tx + tipW - 4, ty);
  ctx.quadraticCurveTo(tx + tipW, ty, tx + tipW, ty + 4);
  ctx.lineTo(tx + tipW, ty + tipH - 4);
  ctx.quadraticCurveTo(tx + tipW, ty + tipH, tx + tipW - 4, ty + tipH);
  ctx.lineTo(tx + 4, ty + tipH);
  ctx.quadraticCurveTo(tx, ty + tipH, tx, ty + tipH - 4);
  ctx.lineTo(tx, ty + 4);
  ctx.quadraticCurveTo(tx, ty, tx + 4, ty);
  ctx.fill();

  // Border
  const borderColors = {
    potion: COLORS.ITEM_POTION, weapon: COLORS.ITEM_WEAPON,
    scroll: COLORS.ITEM_SCROLL, armor: COLORS.ITEM_ARMOR, key: '#ffd700'
  };
  ctx.strokeStyle = borderColors[item.type] || '#666';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(name, tx + padX, ty + padY + 12);

  // Description
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(desc, tx + padX, ty + padY + 28);
}

// ---- Enemy tooltip ----
function drawEnemyTooltip(ctx, enemy, sx, sy) {
  const name = enemy.name;
  const hpText = `HP: ${enemy.hp}/${enemy.maxHp}`;
  const stateText = enemy.state === 'CHASE' ? 'Hunting you' :
                    enemy.state === 'FLEEING' ? 'Fleeing' :
                    enemy.state === 'RANGED_ATTACK' ? 'Aiming' :
                    enemy.state === 'IDLE' ? 'Idle' : '';

  ctx.font = 'bold 13px monospace';
  const nameWidth = ctx.measureText(name).width;
  ctx.font = '11px monospace';
  const hpWidth = ctx.measureText(hpText).width;
  const stateWidth = stateText ? ctx.measureText(stateText).width : 0;
  const textWidth = Math.max(nameWidth, hpWidth, stateWidth);

  const padX = 10;
  const padY = 6;
  const tipW = textWidth + padX * 2;
  const tipH = stateText ? 52 + padY : 38 + padY;
  let tx = sx - tipW / 2;
  let ty = sy - tipH - 16;
  tx = Math.max(4, Math.min(tx, canvas.width - tipW - 4));
  ty = Math.max(4, ty);

  // Background
  ctx.fillStyle = 'rgba(10, 10, 24, 0.92)';
  ctx.beginPath();
  ctx.moveTo(tx + 4, ty);
  ctx.lineTo(tx + tipW - 4, ty);
  ctx.quadraticCurveTo(tx + tipW, ty, tx + tipW, ty + 4);
  ctx.lineTo(tx + tipW, ty + tipH - 4);
  ctx.quadraticCurveTo(tx + tipW, ty + tipH, tx + tipW - 4, ty + tipH);
  ctx.lineTo(tx + 4, ty + tipH);
  ctx.quadraticCurveTo(tx, ty + tipH, tx, ty + tipH - 4);
  ctx.lineTo(tx, ty + 4);
  ctx.quadraticCurveTo(tx, ty, tx + 4, ty);
  ctx.fill();
  ctx.strokeStyle = enemy.color;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Name
  ctx.fillStyle = enemy.color;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(name, tx + padX, ty + padY + 12);

  // HP with mini bar
  const hpRatio = enemy.hp / enemy.maxHp;
  const barW = tipW - padX * 2;
  const barH = 4;
  const barY = ty + padY + 18;
  ctx.fillStyle = '#4a1a1a';
  ctx.fillRect(tx + padX, barY, barW, barH);
  ctx.fillStyle = hpRatio > 0.5 ? '#e63946' : hpRatio > 0.25 ? '#ff8800' : '#ff0000';
  ctx.fillRect(tx + padX, barY, barW * hpRatio, barH);

  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(hpText, tx + padX, ty + padY + 32);

  if (stateText) {
    ctx.fillStyle = '#888';
    ctx.fillText(stateText, tx + padX, ty + padY + 46);
  }
}

// ---- Game loop ----
let lastFrameTime = 0;

function gameLoop(timestamp) {
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  switch (state) {
    case STATE.MAIN_MENU:
      drawMainMenu(ctx, canvas, highScores, mainMenuHover, difficulty, customSeed);
      if (showStore) {
        drawStore(ctx, canvas);
      } else if (showHowToPlay) {
        drawHowToPlay(ctx, canvas, howToPlayScroll);
      }
      break;

    case STATE.PLAYING:
      buildEnemySpatialGrid(enemies);
      processInput();
      updateEnemiesRealTime();

      // Draw game
      renderer.draw({
        map, visible, explored, player, enemies, items,
        endRoom, deltaTime, gameStartTime,
        keysCollected, keysRequired
      });

      // Boss reveal sound
      if (renderer.bossRevealed && !bossRevealTriggered) {
        bossRevealTriggered = true;
        playBossReveal();
        messageLog.add('The Ancient One emerges from the darkness!');
      }

      // Draw HUD on top
      drawHUD(ctx, canvas, player, floor, messageLog, keysCollected, keysRequired);

      // Draw hover tooltips
      if (!minimapEnlarged) {
        if (hoveredEnemy) {
          drawEnemyTooltip(ctx, hoveredEnemy, mouseScreenX, mouseScreenY);
        } else if (hoveredItem) {
          drawItemTooltip(ctx, hoveredItem, mouseScreenX, mouseScreenY);
        }
      }

      // Draw enlarged minimap overlay
      if (minimapEnlarged) {
        renderer.drawMinimapOverlay(ctx, map, visible, explored, player, enemies, items);
      }
      break;

    case STATE.PAUSED:
      // Draw game underneath (frozen)
      renderer.draw({
        map, visible, explored, player, enemies, items,
        endRoom, deltaTime: 0, gameStartTime,
        keysCollected, keysRequired
      });
      drawHUD(ctx, canvas, player, floor, messageLog, keysCollected, keysRequired);
      drawPauseMenu(ctx, canvas, pauseMenuSelection, pauseMenuHover);
      break;

    case STATE.LEVEL_TRANSITION:
      transitionProgress += deltaTime / TRANSITION_DURATION;
      if (transitionProgress >= 1) {
        transitionProgress = 1;
        initFloor();
        state = STATE.PLAYING;
      } else {
        // Draw current game state underneath
        if (map) {
          renderer.draw({
            map, visible, explored, player, enemies, items,
            endRoom, deltaTime: 0
          });
        }
        drawLevelTransition(ctx, canvas, floor, transitionProgress);
      }
      break;

    case STATE.GAME_OVER:
      // Draw game underneath (frozen)
      if (map) {
        renderer.draw({
          map, visible, explored, player, enemies, items,
          endRoom, deltaTime: 0
        });
      }
      drawGameOver(ctx, canvas, player, floor, seed);
      break;

    case STATE.VICTORY:
      if (map) {
        renderer.draw({
          map, visible, explored, player, enemies, items,
          endRoom, deltaTime: 0
        });
      }
      drawVictory(ctx, canvas, player, seed);
      break;
  }

  requestAnimationFrame(gameLoop);
}

// Start the game loop
requestAnimationFrame(gameLoop);
