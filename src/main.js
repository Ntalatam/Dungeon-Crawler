// Dungeon Crawler - Entry Point & Game Loop
import { CONFIG, STATE, TILE, FLOOR_CONFIG } from './constants.js';
import { generateDungeon, isWalkable, mulberry32 } from './dungeon.js';
import { Renderer } from './renderer.js';
import { computeFOV, updateExplored, createExploredMap } from './fov.js';
import { Player, Item, spawnEnemies, spawnItems, getItemAt, getEnemyAt } from './entities.js';
import { updateAllEnemies } from './ai.js';
import { playerAttack, enemyAttack, pickupItem, generateLoot, applyBlinding } from './combat.js';
import { MessageLog, drawHUD, drawMainMenu, drawHowToPlay, drawPauseMenu, drawGameOver, drawVictory, drawLevelTransition } from './ui.js';

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
let gameTime = 0;

// Input state
let pendingInput = null;
let pauseMenuSelection = 0;
let showHowToPlay = false;
let howToPlayScroll = 0;
let gameStartTime = 0;
let lastMoveProcessTime = 0;

// Key progression
let keysCollected = 0;
let keysRequired = 0;

// Minimap overlay
let minimapEnlarged = false;

// Level transition
let transitionProgress = 0;
const TRANSITION_DURATION = 1500;

// High scores (localStorage)
let highScores = loadHighScores();

// ---- Input handling ----
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'e', 'E', 'r', 'R',
  ' ', '.', '>', 'Enter', 'Escape', '?', '/', 'i', 'I', 'm', 'M']);

document.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.key)) e.preventDefault();

  if (state === STATE.MAIN_MENU) {
    if (showHowToPlay) {
      if (e.key === 'Escape' || e.key === '?' || e.key === 'i' || e.key === 'I') {
        showHowToPlay = false;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        howToPlayScroll = Math.min(howToPlayScroll + 40, 600);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        howToPlayScroll = Math.max(howToPlayScroll - 40, 0);
      }
      return;
    }
    if (e.key === '?' || e.key === 'i' || e.key === 'I') {
      showHowToPlay = true;
      howToPlayScroll = 0;
      return;
    }
    if (e.key === 'Enter') {
      startNewGame();
    }
    return;
  }

  if (state === STATE.GAME_OVER || state === STATE.VICTORY) {
    if (e.key === 'r' || e.key === 'R') {
      state = STATE.MAIN_MENU;
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
      }
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      minimapEnlarged = !minimapEnlarged;
      return;
    }
    // Don't accept game input while minimap is open
    if (minimapEnlarged) return;
    // Buffer the input for processing in the game tick
    pendingInput = e.key;
  }
});


// Minimap click handling
canvas.addEventListener('click', (e) => {
  if (state !== STATE.PLAYING) return;
  if (minimapEnlarged) {
    minimapEnlarged = false;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const mmX = canvas.width - CONFIG.MINIMAP_WIDTH - 10;
  const mmY = 10;
  if (mx >= mmX - 2 && mx <= mmX + CONFIG.MINIMAP_WIDTH + 6 &&
      my >= mmY - 2 && my <= mmY + CONFIG.MINIMAP_HEIGHT + 6) {
    minimapEnlarged = true;
  }
});

// Show pointer cursor over minimap area
canvas.addEventListener('mousemove', (e) => {
  if (state !== STATE.PLAYING) return;
  if (minimapEnlarged) {
    canvas.style.cursor = 'default';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const mmX = canvas.width - CONFIG.MINIMAP_WIDTH - 10;
  const mmY = 10;
  if (mx >= mmX - 2 && mx <= mmX + CONFIG.MINIMAP_WIDTH + 6 &&
      my >= mmY - 2 && my <= mmY + CONFIG.MINIMAP_HEIGHT + 6) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'none';
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
        case 0: state = STATE.PLAYING; break; // Resume
        case 1: startNewGame(); break; // Restart
        case 2: state = STATE.MAIN_MENU; break; // Quit
      }
      break;
    case 'Escape':
      state = STATE.PLAYING;
      break;
  }
}

// ---- Game initialization ----
function startNewGame() {
  seed = Date.now();
  floor = 1;
  player = null;
  gameEnded = false;
  minimapEnlarged = false;
  messageLog = new MessageLog();
  initFloor();
  gameStartTime = Date.now();
  state = STATE.PLAYING;
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

  // Spawn entities
  enemies = spawnEnemies(floor, dungeon.entitySpawns, rooms, rng);
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
  updateExplored(explored, visible);

  // Initialize renderer
  renderer.generateGrit(mulberry32(seed + floor * 2000));
  renderer.snapCamera(player.x, player.y);
  renderer.effects = [];

  gameTime = 0;
  messageLog.add(`Floor ${floor}. ${floor === 1 ? 'Find the stairs to descend.' : 'You descend deeper...'}`);
  if (keysRequired > 0) {
    messageLog.add(`Find ${keysRequired} key${keysRequired > 1 ? 's' : ''} to unlock the stairs.`);
  }
  if (floor === CONFIG.MAX_FLOORS) {
    messageLog.add('You sense a powerful presence nearby...');
  }
}

// Movement keys for cooldown check
const MOVEMENT_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','a','A','s','S','d','D']);

// ---- Process player input ----
function processInput() {
  if (!pendingInput || !player.isAlive) return;

  const key = pendingInput;

  // Enforce movement cooldown to prevent held-key teleporting
  if (MOVEMENT_KEYS.has(key)) {
    const now = performance.now();
    if (now - lastMoveProcessTime < CONFIG.MOVE_COOLDOWN_MS) return; // Keep input, retry next frame
  }

  pendingInput = null;

  let dx = 0, dy = 0;
  let moved = false;
  let acted = false; // Did the player take an action (enemies get a turn)

  // Movement
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': dy = -1; break;
    case 'ArrowDown': case 's': case 'S': dy = 1; break;
    case 'ArrowLeft': case 'a': case 'A': dx = -1; break;
    case 'ArrowRight': case 'd': case 'D': dx = 1; break;
    case ' ': case '.': acted = true; break; // Wait
    case 'e': case 'E': tryPickup(); acted = true; break;
    case 'Enter': case '>': tryDescend(); return; // Don't let enemies act on descend
  }

  if (dx !== 0 || dy !== 0) {
    lastMoveProcessTime = performance.now();
    const newX = player.x + dx;
    const newY = player.y + dy;

    // Bounds check
    if (newX >= 0 && newX < CONFIG.MAP_WIDTH && newY >= 0 && newY < CONFIG.MAP_HEIGHT) {
      // Check for enemy at target (bump attack)
      const targetEnemy = getEnemyAt(enemies, newX, newY);
      if (targetEnemy) {
        playerAttack(player, targetEnemy, rng, messageLog, renderer);
        acted = true;

        // Handle enemy death and loot
        if (!targetEnemy.isAlive) {
          const loot = generateLoot(targetEnemy, floor, rng);
          if (loot) {
            items.push(loot);
            messageLog.add(`The ${targetEnemy.name} dropped a ${loot.name}!`);
          }
        }
      } else if (isWalkable(map[newY][newX])) {
        // Move player
        player.x = newX;
        player.y = newY;
        moved = true;
        acted = true;

        // Auto-pickup potions and keys
        const groundItem = getItemAt(items, player.x, player.y);
        if (groundItem && (groundItem.type === 'potion' || groundItem.type === 'key')) {
          const pickedUp = pickupItem(player, groundItem, items, messageLog, renderer);
          if (pickedUp && pickedUp.type === 'key') {
            keysCollected++;
            if (keysCollected >= keysRequired) {
              messageLog.add('The stairs are now unlocked!');
            }
          }
        }
      }
    }
  }

  if (moved) {
    // Update FOV
    visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
    updateExplored(explored, visible);
  }

  // If player acted, let enemies take their turn
  if (acted) {
    processEnemyTurns();
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
    saveHighScores();
  } else {
    messageLog.add('No stairs here.');
  }
}

// Process all enemy actions for this turn
function processEnemyTurns() {
  // Each player action advances time by 300ms (goblin speed)
  // This means: goblins act every turn, skeletons every 2, trolls every 3
  gameTime += CONFIG.GOBLIN_MOVE_MS;

  const actions = updateAllEnemies(enemies, player, map, gameTime, rng);

  for (const action of actions) {
    if (action.type === 'attack' && action.enemy) {
      const playerDied = enemyAttack(action.enemy, player, rng, messageLog, renderer);
      if (playerDied) {
        saveHighScores();
        state = STATE.GAME_OVER;
        return;
      }
    }
  }

  // Update FOV after enemy moves (enemies might have moved into view)
  visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
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

// ---- Game loop ----
let lastFrameTime = 0;

function gameLoop(timestamp) {
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  switch (state) {
    case STATE.MAIN_MENU:
      canvas.style.cursor = 'default';
      drawMainMenu(ctx, canvas, highScores);
      if (showHowToPlay) {
        drawHowToPlay(ctx, canvas, howToPlayScroll);
      }
      break;

    case STATE.PLAYING:
      if (!minimapEnlarged) {
        canvas.style.cursor = 'none';
      }
      processInput();

      // Draw game
      renderer.draw({
        map, visible, explored, player, enemies, items,
        endRoom, deltaTime, gameStartTime,
        keysCollected, keysRequired
      });

      // Draw HUD on top
      drawHUD(ctx, canvas, player, floor, messageLog, keysCollected, keysRequired);

      // Draw enlarged minimap overlay
      if (minimapEnlarged) {
        renderer.drawMinimapOverlay(ctx, map, visible, explored, player, enemies, items);
      }
      break;

    case STATE.PAUSED:
      canvas.style.cursor = 'default';
      // Draw game underneath (frozen)
      renderer.draw({
        map, visible, explored, player, enemies, items,
        endRoom, deltaTime: 0, gameStartTime,
        keysCollected, keysRequired
      });
      drawHUD(ctx, canvas, player, floor, messageLog, keysCollected, keysRequired);
      drawPauseMenu(ctx, canvas, pauseMenuSelection);
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
      canvas.style.cursor = 'default';
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
      canvas.style.cursor = 'default';
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
