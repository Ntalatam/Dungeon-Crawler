// Dungeon Crawler - Entry Point & Game Loop
import { CONFIG, STATE, TILE, FLOOR_CONFIG, DIFFICULTY, COLORS } from './constants.js';
import { generateDungeon, isWalkable, mulberry32 } from './dungeon.js';
import { Renderer } from './renderer.js';
import { computeFOV, updateExplored, createExploredMap } from './fov.js';
import { Player, Item, spawnEnemies, spawnItems, getItemAt, getEnemyAt, buildEnemySpatialGrid } from './entities.js';
import { updateAllEnemies } from './ai.js';
import { playerAttack, enemyAttack, pickupItem, generateLoot, applyBlinding, resolveEnemyDefeat, describeItem, recalculatePlayerDefense } from './combat.js';
import { buildRoomLookup, getRoomBanner } from './rooms.js';
import { createFloorInteractables, getInteractableAt, getInteractableDescription, createInteractionMenu, applyInteraction } from './interactables.js';
import { applyEnemyHazardStep } from './hazards.js';
import { MessageLog, drawHUD, drawMainMenu, drawHowToPlay, drawPauseMenu, drawGameOver, drawVictory, drawLevelTransition, drawInteractionMenu, drawRoomBanner, getPauseMenuLayout, getInteractionMenuLayout } from './ui.js';
import { playDescend, playHazard, playPlayerDeath, playArrowShoot, playBossReveal, toggleMute, isMuted } from './audio.js';

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
let roomLookup = null;
let explored = null;
let visible = null;
let player = null;
let enemies = [];
let items = [];
let interactables = [];
let messageLog = new MessageLog();
let rng = null;

// Input state - held-key tracking system
let heldKeys = new Set();       // Currently held keys
let lastDirectionKey = null;    // Most recently pressed direction
let pendingAction = null;       // Non-movement action (e.g. 'f', ' ', '>')
let pauseMenuSelection = 0;
let pauseMenuHover = -1;        // Mouse hover index for pause menu
let interactionMenu = null;
let interactionSelection = 0;
let interactionHover = -1;
let showHowToPlay = false;
let howToPlayScroll = 0;
let gameStartTime = 0;
let lastMoveProcessTime = 0;
let mainMenuHover = '';         // 'start' or 'help'
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
let hoveredFeature = null;
let mouseScreenX = 0;
let mouseScreenY = 0;
let currentRoom = null;
let activeRoomBanner = null;

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

function setStateWithCursor(nextState) {
  state = nextState;
  updateCursor();
}

function resumeGameplay() {
  setStateWithCursor(STATE.PLAYING);
}

function returnToMainMenu() {
  minimapEnlarged = false;
  interactionMenu = null;
  showHowToPlay = false;
  setStateWithCursor(STATE.MAIN_MENU);
}

function openPauseMenu() {
  pauseMenuSelection = 0;
  pauseMenuHover = -1;
  setStateWithCursor(STATE.PAUSED);
}

function closeInteractionMenu() {
  interactionMenu = null;
  interactionSelection = 0;
  interactionHover = -1;
  resumeGameplay();
}

function openInteractionMenu(menu) {
  interactionMenu = menu;
  interactionSelection = 0;
  interactionHover = -1;
  setStateWithCursor(STATE.INTERACT_MENU);
}

function openHowToPlay() {
  showHowToPlay = true;
  howToPlayScroll = 0;
}

function isPointInRect(px, py, x, y, width, height) {
  return px >= x && px <= x + width && py >= y && py <= y + height;
}

function getMainMenuHoverTarget(mx, my) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  if (isPointInRect(mx, my, cx - 150, cy + 117, 300, 46)) {
    return 'start';
  }

  const iconX = canvas.width - 55;
  const iconY = canvas.height - 50;
  if (Math.hypot(mx - iconX, my - iconY) < 24) {
    return 'help';
  }

  return '';
}

function getPauseButtonIndex(mx, my) {
  const layout = getPauseMenuLayout(canvas);

  for (let i = 0; i < 4; i++) {
    const btnY = layout.btnYStart + i * 44;
    if (isPointInRect(mx, my, layout.cx - layout.btnW / 2, btnY - layout.btnH / 2, layout.btnW, layout.btnH)) {
      return i;
    }
  }

  return -1;
}

function getInteractionOptionIndex(mx, my) {
  if (!interactionMenu) return -1;
  const layout = getInteractionMenuLayout(canvas, interactionMenu.options.length);
  for (let i = 0; i < interactionMenu.options.length; i++) {
    const y = layout.optionY + i * (layout.optionH + layout.optionGap);
    if (isPointInRect(mx, my, layout.optionX, y, layout.optionW, layout.optionH)) {
      return i;
    }
  }
  return -1;
}

function executePauseMenuOption(index) {
  switch (index) {
    case 0:
      resumeGameplay();
      break;
    case 1: {
      const muted = toggleMute();
      messageLog.add(muted ? 'Audio muted.' : 'Audio restored.');
      break;
    }
    case 2:
      startNewGame();
      break;
    case 3:
      returnToMainMenu();
      break;
  }
}

function refreshVisibility(markExplored = false) {
  visible = computeFOV(map, player.x, player.y, CONFIG.FOV_RADIUS);
  if (markExplored) {
    updateExplored(explored, visible, player.x, player.y, CONFIG.FOV_RADIUS);
  }
  renderer.invalidateMap();
}

function handleCollectedKey() {
  keysCollected++;
  if (keysCollected >= keysRequired) {
    messageLog.add('The stairs are now unlocked!');
  }
}

function handlePickedUpItem(pickedUp) {
  if (!pickedUp) return false;

  if (pickedUp.type === 'scroll' && pickedUp.subtype === 'blinding') {
    applyBlinding(player, enemies, visible, messageLog);
  } else if (pickedUp.type === 'key') {
    handleCollectedKey();
  }

  return true;
}

function triggerGameOver(causeOfDeath = null) {
  if (causeOfDeath) {
    player.causeOfDeath = causeOfDeath;
  }
  playPlayerDeath();
  setStateWithCursor(STATE.GAME_OVER);
  saveHighScores();
}

function applyHazardDamage({
  damage,
  message,
  effectColor,
  flashColor = null,
  flashDuration = 0,
  shakeIntensity,
  hitFlash,
  deathReason,
}) {
  player.hp = Math.max(0, player.hp - damage);
  player.lastDamageTime = Date.now();
  messageLog.add(message);
  renderer.addEffect(player.x, player.y, `-${damage}`, effectColor);
  if (flashColor) {
    renderer.flash(flashColor, flashDuration);
  }
  renderer.shake(shakeIntensity, 0.9);
  player.hitFlash = hitFlash;
  playHazard();

  if (player.hp <= 0) {
    triggerGameOver(deathReason);
    return true;
  }

  return false;
}

function getFloorFeature(room) {
  if (!room) return null;
  return interactables.find(feature => feature.room === room) || null;
}

function announceRoomIfNeeded(nextRoom) {
  if (nextRoom === currentRoom) return;

  currentRoom = nextRoom;
  if (!nextRoom) return;

  const feature = getFloorFeature(nextRoom);
  activeRoomBanner = getRoomBanner(nextRoom, feature && !feature.used ? feature : null);

  if (!nextRoom.discovered) {
    nextRoom.discovered = true;
    const detail = feature && !feature.used ? feature.description : nextRoom.subtitle;
    messageLog.add(`${nextRoom.title}: ${detail}`);
  }
}

function refreshRoomContext() {
  if (!roomLookup || !player) return;
  announceRoomIfNeeded(roomLookup[player.y]?.[player.x] || null);
}

function getPlayerSpeedBonus() {
  return (player.weapon.speedBonus || 0) +
    (player.armor?.moveBonus || 0) +
    (player.moveBonus || 0) +
    (player.floorMoveBonus || 0);
}

function getPlayerMoveCooldown() {
  return Math.max(
    CONFIG.MIN_MOVE_COOLDOWN_MS,
    Math.min(CONFIG.MAX_MOVE_COOLDOWN_MS, CONFIG.MOVE_COOLDOWN_MS - getPlayerSpeedBonus() * 8)
  );
}

function handleEnemyDrop(enemy) {
  const loot = generateLoot(enemy, floor, rng);
  if (!loot) return;
  items.push(loot);
  messageLog.add(`The ${enemy.name} dropped ${loot.name}.`);
}

function handleAutomaticPickup() {
  const item = getItemAt(items, player.x, player.y);
  if (item && (item.type === 'key' || item.type === 'gold')) {
    handlePickedUpItem(pickupItem(player, item, items, messageLog, renderer));
  }
}

function applyBossHazardTrail(trail) {
  if (!trail) return false;
  const { x, y, tile } = trail;
  if (x === player.x && y === player.y) return false;
  if (getInteractableAt(interactables, x, y)) return false;
  if (map[y][x] !== TILE.FLOOR && map[y][x] !== TILE.CORRIDOR) return false;
  map[y][x] = tile;
  renderer.invalidateMap();
  return true;
}

function tryReachAttack(dx, dy) {
  const reach = player.weapon.reach || 1;
  if (reach <= 1 || (dx !== 0 && dy !== 0)) return false;

  for (let step = 2; step <= reach; step++) {
    const targetX = player.x + dx * step;
    const targetY = player.y + dy * step;
    if (targetX < 0 || targetX >= CONFIG.MAP_WIDTH || targetY < 0 || targetY >= CONFIG.MAP_HEIGHT) {
      return false;
    }

    const betweenX = player.x + dx * (step - 1);
    const betweenY = player.y + dy * (step - 1);
    if (!isWalkable(map[betweenY][betweenX]) || getEnemyAt(enemies, betweenX, betweenY)) {
      return false;
    }

    const targetEnemy = getEnemyAt(enemies, targetX, targetY);
    if (targetEnemy) {
      const killed = playerAttack(player, targetEnemy, rng, messageLog, renderer);
      if (killed) handleEnemyDrop(targetEnemy);
      return true;
    }

    if (!isWalkable(map[targetY][targetX])) {
      return false;
    }
  }

  return false;
}

function applyPlayerTileEffects(dx, dy) {
  let slid = false;

  while (true) {
    const tile = map[player.y][player.x];
    if (tile === TILE.LAVA) {
      const damage = Math.max(1, 5 - (player.armor?.lavaWard ? 2 : 0));
      const message = player.armor?.lavaWard
        ? `Your armor blunts the lava, but you still burn. (-${damage} HP)`
        : 'The lava burns you! (-5 HP)';
      if (applyHazardDamage({
        damage,
        message,
        effectColor: '#ff6600',
        flashColor: '#ff3300',
        flashDuration: 150,
        shakeIntensity: 3,
        hitFlash: 100,
        deathReason: 'Burned to death by lava',
      })) {
        return true;
      }
      return false;
    }

    if (tile === TILE.SPIKE_TRAP) {
      if (applyHazardDamage({
        damage: 3,
        message: 'Spike trap! (-3 HP)',
        effectColor: '#aaaaaa',
        shakeIntensity: 2,
        hitFlash: 80,
        deathReason: 'Impaled by spike trap',
      })) {
        return true;
      }
      return false;
    }

    if (tile === TILE.ICE && !slid) {
      const slideX = player.x + dx;
      const slideY = player.y + dy;
      if (slideX >= 0 && slideX < CONFIG.MAP_WIDTH && slideY >= 0 && slideY < CONFIG.MAP_HEIGHT &&
          isWalkable(map[slideY][slideX]) && !getEnemyAt(enemies, slideX, slideY)) {
        player.x = slideX;
        player.y = slideY;
        slid = true;
        messageLog.add('The ice carries you forward.');
        continue;
      }
    }

    return false;
  }
}

function getContextPrompt() {
  const feature = getInteractableAt(interactables, player.x, player.y);
  if (feature) {
    return `[F] ${feature.prompt}`;
  }

  const item = getItemAt(items, player.x, player.y);
  if (item) {
    if (item.type === 'key' || item.type === 'gold') {
      return `${item.name} auto-collects`;
    }
    return `[F] ${item.name} - ${describeItem(item)}`;
  }

  if (map[player.y][player.x] === TILE.STAIRS_DOWN) {
    if (keysCollected >= keysRequired) return '[Enter] Descend to the next floor';
    return `Need ${keysRequired - keysCollected} more key${keysRequired - keysCollected === 1 ? '' : 's'} to descend`;
  }

  if (keysCollected < keysRequired) {
    return `${keysRequired - keysCollected} key${keysRequired - keysCollected === 1 ? '' : 's'} still missing on this floor`;
  }

  return 'Explore for loot, sanctuaries, and a safe route forward';
}

function drawInfoTooltip(ctx, title, description, accent, sx, sy) {
  ctx.font = 'bold 13px monospace';
  const titleWidth = ctx.measureText(title).width;
  ctx.font = '11px monospace';
  const descWidth = ctx.measureText(description).width;
  const tipW = Math.max(titleWidth, descWidth) + 20;
  const tipH = 44;

  let tx = sx - tipW / 2;
  let ty = sy - tipH - 16;
  tx = Math.max(4, Math.min(tx, canvas.width - tipW - 4));
  ty = Math.max(4, ty);

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
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(title, tx + 10, ty + 18);
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  ctx.fillText(description, tx + 10, ty + 34);
}

function openFeatureInteraction(feature) {
  if (!feature || feature.used) return false;

  if (feature.type === 'fountain') {
    applyInteraction(feature, null, player, messageLog, renderer);
    return true;
  }

  const menu = createInteractionMenu(feature, player);
  if (!menu) return false;
  openInteractionMenu(menu);
  return true;
}

function commitInteractionSelection(index) {
  if (!interactionMenu) return;
  const option = interactionMenu.options[index];
  if (!option || option.disabled) return;

  const result = applyInteraction(interactionMenu.feature, option.id, player, messageLog, renderer);
  if (result.refreshMenu) {
    interactionMenu = createInteractionMenu(interactionMenu.feature, player);
    interactionSelection = Math.min(interactionSelection, Math.max(0, interactionMenu.options.length - 1));
  }
  if (result.closeMenu) {
    closeInteractionMenu();
  }
  recalculatePlayerDefense(player);
}

document.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.key)) e.preventDefault();

  const nk = normalizeKey(e.key);

  if (state === STATE.MAIN_MENU) {
    if (showHowToPlay) {
      if (e.key === 'Escape' || nk === '?' || nk === 'i') {
        showHowToPlay = false;
      } else if (e.key === 'ArrowDown' || nk === 's') {
        howToPlayScroll = Math.min(howToPlayScroll + 40, 1400);
      } else if (e.key === 'ArrowUp' || nk === 'w') {
        howToPlayScroll = Math.max(howToPlayScroll - 40, 0);
      }
      return;
    }
    if (nk === '?' || nk === 'i') {
      openHowToPlay();
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
      returnToMainMenu();
    }
    return;
  }

  if (state === STATE.PAUSED) {
    handlePauseInput(e.key);
    return;
  }

  if (state === STATE.INTERACT_MENU) {
    handleInteractionInput(e.key);
    return;
  }

  if (state === STATE.PLAYING) {
    if (e.key === 'Escape') {
      if (minimapEnlarged) {
        minimapEnlarged = false;
        updateCursor();
      } else {
        openPauseMenu();
      }
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

  if (state === STATE.INTERACT_MENU) {
    handleInteractionClick(mx, my);
    return;
  }

  if (state === STATE.GAME_OVER || state === STATE.VICTORY) {
    returnToMainMenu();
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
  switch (getMainMenuHoverTarget(mx, my)) {
    case 'start':
      startNewGame();
      return;
    case 'help':
      openHowToPlay();
      return;
  }
}

function handlePauseClick(mx, my) {
  const buttonIndex = getPauseButtonIndex(mx, my);
  if (buttonIndex !== -1) {
    executePauseMenuOption(buttonIndex);
  }
}

function handleInteractionClick(mx, my) {
  const optionIndex = getInteractionOptionIndex(mx, my);
  if (optionIndex === -1) {
    closeInteractionMenu();
    return;
  }
  interactionSelection = optionIndex;
  commitInteractionSelection(optionIndex);
}

// ---- Mouse hover tracking ----
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (state === STATE.MAIN_MENU) {
    if (showHowToPlay) {
      canvas.style.cursor = 'pointer';
      return;
    }
    mainMenuHover = getMainMenuHoverTarget(mx, my);
    if (mainMenuHover) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
    return;
  }

  if (state === STATE.PAUSED) {
    const buttonIndex = getPauseButtonIndex(mx, my);
    if (buttonIndex === -1) {
      pauseMenuHover = -1;
      canvas.style.cursor = 'default';
    } else {
      pauseMenuHover = buttonIndex;
      pauseMenuSelection = buttonIndex;
      canvas.style.cursor = 'pointer';
    }
    return;
  }

  if (state === STATE.INTERACT_MENU) {
    const optionIndex = getInteractionOptionIndex(mx, my);
    if (optionIndex === -1) {
      interactionHover = -1;
      canvas.style.cursor = 'default';
    } else {
      interactionHover = optionIndex;
      interactionSelection = optionIndex;
      canvas.style.cursor = 'pointer';
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
      hoveredFeature = null;
      return;
    }
    const mmX = canvas.width - CONFIG.MINIMAP_WIDTH - 10;
    const mmY = 10;
    if (mx >= mmX - 2 && mx <= mmX + CONFIG.MINIMAP_WIDTH + 6 &&
        my >= mmY - 2 && my <= mmY + CONFIG.MINIMAP_HEIGHT + 6) {
      canvas.style.cursor = 'pointer';
      hoveredItem = null;
      hoveredEnemy = null;
      hoveredFeature = null;
    } else {
      canvas.style.cursor = 'none';
      // Check for item under mouse cursor (world coordinates)
      const offset = renderer.getOffset();
      const worldX = Math.floor((mx - offset.x) / CONFIG.TILE_SIZE);
      const worldY = Math.floor((my - offset.y) / CONFIG.TILE_SIZE);
      hoveredItem = null;
      hoveredEnemy = null;
      hoveredFeature = null;
      if (worldX >= 0 && worldX < CONFIG.MAP_WIDTH && worldY >= 0 && worldY < CONFIG.MAP_HEIGHT) {
        if (visible && visible[worldY][worldX]) {
          hoveredItem = getItemAt(items, worldX, worldY) || null;
          hoveredEnemy = getEnemyAt(enemies, worldX, worldY) || null;
          hoveredFeature = getInteractableAt(interactables, worldX, worldY) || null;
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
      pauseMenuSelection = Math.min(3, pauseMenuSelection + 1);
      break;
    case 'Enter':
      executePauseMenuOption(pauseMenuSelection);
      break;
    case 'Escape':
      resumeGameplay();
      break;
  }
}

function handleInteractionInput(key) {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      interactionSelection = Math.max(0, interactionSelection - 1);
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      interactionSelection = Math.min(interactionMenu.options.length - 1, interactionSelection + 1);
      break;
    case 'Enter':
    case 'f':
    case 'F':
      commitInteractionSelection(interactionSelection);
      break;
    case 'Escape':
      closeInteractionMenu();
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
  showHowToPlay = false;
  interactionMenu = null;
  hoveredItem = null;
  hoveredEnemy = null;
  hoveredFeature = null;
  currentRoom = null;
  activeRoomBanner = null;
  messageLog = new MessageLog();
  initFloor();
  gameStartTime = Date.now();
  resumeGameplay();
}

function initFloor() {
  rng = mulberry32(seed + floor * 1000);

  // Generate dungeon
  const dungeon = generateDungeon(seed, floor);
  map = dungeon.map;
  rooms = dungeon.rooms;
  endRoom = dungeon.endRoom;
  roomLookup = buildRoomLookup(rooms);
  interactables = createFloorInteractables(rooms, dungeon.startRoom, floor, rng);

  // Create or reset player position
  if (!player || floor === 1) {
    player = new Player(dungeon.playerStart.x, dungeon.playerStart.y);
  } else {
    // Keep player stats, reset position to stairs up
    player.x = dungeon.playerStart.x;
    player.y = dungeon.playerStart.y;
    player.renderX = player.x;
    player.renderY = player.y;
    player.floorMoveBonus = 0;
  }
  recalculatePlayerDefense(player);
  currentRoom = null;
  activeRoomBanner = null;

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
  items = spawnItems(floor, dungeon.itemSpawns, rng, diff.itemMult);

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
  refreshVisibility(true);
  refreshRoomContext();
  handleAutomaticPickup();

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
  if (interactables.some(feature => feature.type === 'merchant')) {
    messageLog.add('A Quartermaster has reached this floor. Gold may buy a build pivot.');
  }
  if (floor === CONFIG.MAX_FLOORS) {
    messageLog.add('You sense a powerful presence nearby...');
  }
}

// ---- Process player input ----
function processInput() {
  if (!player.isAlive) return;

  let dx = 0;
  let dy = 0;
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
    if (now - lastMoveProcessTime < getPlayerMoveCooldown()) return;

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
          const killed = playerAttack(player, targetEnemy, rng, messageLog, renderer);
          acted = true;
          if (killed) handleEnemyDrop(targetEnemy);
        } else if (tryReachAttack(dx, dy)) {
          acted = true;
        } else if (isWalkable(map[newY][newX])) {
          player.x = newX;
          player.y = newY;
          acted = true;

          if (applyPlayerTileEffects(dx, dy)) {
            return;
          }
          handleAutomaticPickup();
          refreshVisibility(true);
          refreshRoomContext();
        }
      }
    }
  }
}


// Try to pick up item at player position
function tryPickup() {
  const feature = getInteractableAt(interactables, player.x, player.y);
  if (feature) {
    openFeatureInteraction(feature);
    return;
  }

  const item = getItemAt(items, player.x, player.y);
  if (item) {
    handlePickedUpItem(pickupItem(player, item, items, messageLog, renderer));
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
      setStateWithCursor(STATE.VICTORY);
      saveHighScores();
      return;
    }

    // Start level transition
    floor++;
    transitionProgress = 0;
    setStateWithCursor(STATE.LEVEL_TRANSITION);
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

  let gridNeedsRebuild = false;
  for (const action of actions) {
    if ((action.type === 'attack' || action.type === 'ranged_attack') && action.enemy) {
      if (action.type === 'ranged_attack') {
        // Show projectile trail effect
        renderer.addProjectile(action.fromX, action.fromY, player.x, player.y, action.enemy.color);
        playArrowShoot();
      }
      const playerDied = enemyAttack(action.enemy, player, rng, messageLog, renderer);
      if (playerDied) {
        triggerGameOver();
        return;
      }
    }
    if (action.type === 'move') {
      gridNeedsRebuild = true;
      applyBossHazardTrail(action.leaveHazard);
      const hazardResult = applyEnemyHazardStep(
        action.enemy,
        map,
        action.fromX,
        action.fromY,
        enemies,
        player,
        visible,
        messageLog,
        renderer
      );

      const followUpHazard = hazardResult.moved && !hazardResult.died
        ? applyEnemyHazardStep(
            action.enemy,
            map,
            action.enemy.x,
            action.enemy.y,
            enemies,
            player,
            visible,
            messageLog,
            renderer
          )
        : { died: false, moved: false };

      if (hazardResult.moved || hazardResult.died || followUpHazard.moved || followUpHazard.died) {
        gridNeedsRebuild = true;
      }

      const fatalHazard = followUpHazard.died ? followUpHazard : hazardResult;
      if (fatalHazard.died) {
        resolveEnemyDefeat(player, action.enemy, messageLog, renderer, { cause: fatalHazard.cause });
        handleEnemyDrop(action.enemy);
      }
    }
  }

  if (gridNeedsRebuild) {
    buildEnemySpatialGrid(enemies);
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
function drawItemTooltip(ctx, item, sx, sy) {
  const borderColors = {
    potion: COLORS.ITEM_POTION, weapon: COLORS.ITEM_WEAPON,
    scroll: COLORS.ITEM_SCROLL, armor: COLORS.ITEM_ARMOR, key: '#ffd700', gold: COLORS.ITEM_GOLD
  };
  drawInfoTooltip(ctx, item.name, describeItem(item), borderColors[item.type] || '#666', sx, sy);
}

function drawFeatureTooltip(ctx, feature, sx, sy) {
  drawInfoTooltip(ctx, feature.name, getInteractableDescription(feature), feature.color, sx, sy);
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

function drawGameplayFrame(deltaTime, simulate = false) {
  if (simulate) {
    buildEnemySpatialGrid(enemies);
    processInput();
    if (state === STATE.PLAYING) {
      updateEnemiesRealTime();
    }
  }

  renderer.draw({
    map,
    visible,
    explored,
    player,
    enemies,
    items,
    interactables,
    roomLookup,
    endRoom,
    deltaTime: simulate ? deltaTime : 0,
    gameStartTime,
    keysCollected,
    keysRequired
  });

  if (renderer.bossRevealed && !bossRevealTriggered) {
    bossRevealTriggered = true;
    playBossReveal();
    messageLog.add('The Ancient One emerges from the darkness!');
  }

  drawHUD(ctx, canvas, player, floor, messageLog, keysCollected, keysRequired, {
    currentRoom,
    promptText: getContextPrompt(),
    audioMuted: isMuted()
  });

  if (activeRoomBanner && activeRoomBanner.until > Date.now()) {
    drawRoomBanner(ctx, canvas, activeRoomBanner);
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
      if (showHowToPlay) {
        drawHowToPlay(ctx, canvas, howToPlayScroll);
      }
      break;

    case STATE.PLAYING:
      drawGameplayFrame(deltaTime, true);

      // Draw hover tooltips
      if (!minimapEnlarged) {
        if (hoveredEnemy) {
          drawEnemyTooltip(ctx, hoveredEnemy, mouseScreenX, mouseScreenY);
        } else if (hoveredFeature) {
          drawFeatureTooltip(ctx, hoveredFeature, mouseScreenX, mouseScreenY);
        } else if (hoveredItem) {
          drawItemTooltip(ctx, hoveredItem, mouseScreenX, mouseScreenY);
        }
      }

      // Draw enlarged minimap overlay
      if (minimapEnlarged) {
        renderer.drawMinimapOverlay(ctx, map, visible, explored, player, enemies, items, interactables, roomLookup);
      }
      break;

    case STATE.PAUSED:
      drawGameplayFrame(deltaTime, false);
      drawPauseMenu(ctx, canvas, pauseMenuSelection, pauseMenuHover, isMuted());
      break;

    case STATE.INTERACT_MENU:
      drawGameplayFrame(deltaTime, false);
      drawInteractionMenu(ctx, canvas, interactionMenu, interactionSelection, interactionHover);
      break;

    case STATE.LEVEL_TRANSITION:
      transitionProgress += deltaTime / TRANSITION_DURATION;
      if (transitionProgress >= 1) {
        transitionProgress = 1;
        initFloor();
        resumeGameplay();
      } else {
        // Draw current game state underneath
        if (map) {
          drawGameplayFrame(deltaTime, false);
        }
        drawLevelTransition(ctx, canvas, floor, transitionProgress);
      }
      break;

    case STATE.GAME_OVER:
      // Draw game underneath (frozen)
      if (map) {
        drawGameplayFrame(deltaTime, false);
      }
      drawGameOver(ctx, canvas, player, floor, seed);
      break;

    case STATE.VICTORY:
      if (map) {
        drawGameplayFrame(deltaTime, false);
      }
      drawVictory(ctx, canvas, player, seed);
      break;
  }

  requestAnimationFrame(gameLoop);
}

// Start the game loop
requestAnimationFrame(gameLoop);
