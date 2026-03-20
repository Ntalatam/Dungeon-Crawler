// UI System - HUD, Menus, Message Log
import { COLORS, CONFIG } from './constants.js';

// Message Log
export class MessageLog {
  constructor() {
    this.messages = [];
  }

  add(text) {
    this.messages.push({ text, time: Date.now() });
    if (this.messages.length > 10) this.messages.shift();
  }

  // Get recent messages (within display time)
  getRecent() {
    const now = Date.now();
    return this.messages
      .filter(m => now - m.time < CONFIG.MESSAGE_DISPLAY_TIME)
      .slice(-CONFIG.MAX_MESSAGES);
  }

  clear() {
    this.messages = [];
  }
}

// Draw the in-game HUD
export function drawHUD(ctx, canvas, player, floor, messageLog, keysCollected = 0, keysRequired = 0) {
  const hudH = CONFIG.HUD_HEIGHT;
  const hudY = canvas.height - hudH;

  // HUD background
  ctx.fillStyle = COLORS.HUD_BG;
  ctx.fillRect(0, hudY, canvas.width, hudH);

  // Separator line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hudY);
  ctx.lineTo(canvas.width, hudY);
  ctx.stroke();

  const padding = 15;
  const barHeight = 16;
  const barWidth = 180;

  // HP Bar with damage feedback and low-health warning
  const hpX = padding;
  const hpY = hudY + 12;
  const hpRatio = player.hp / player.maxHp;
  const now = Date.now();
  const recentlyDamaged = player.lastDamageTime && (now - player.lastDamageTime < 400);
  const lowHealth = player.hp > 0 && player.hp < 25;

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HP', hpX, hpY - 2);

  // Bar background
  const barStartX = hpX + 25;
  const barStartY = hpY - 12;

  // Low-health glow effect
  if (lowHealth) {
    ctx.save();
    const pulse = 0.3 + 0.4 * Math.sin(now / 200);
    ctx.shadowColor = '#e63946';
    ctx.shadowBlur = 12 + pulse * 8;
    ctx.fillStyle = `rgba(230, 57, 70, ${0.15 + pulse * 0.15})`;
    ctx.fillRect(barStartX - 3, barStartY - 3, barWidth + 6, barHeight + 6);
    ctx.restore();
  }

  // Damage flash glow
  if (recentlyDamaged) {
    ctx.save();
    const flashProgress = (now - player.lastDamageTime) / 400;
    const flashAlpha = 0.6 * (1 - flashProgress);
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
    ctx.fillRect(barStartX - 2, barStartY - 2, barWidth + 4, barHeight + 4);
    ctx.restore();
  }

  ctx.fillStyle = COLORS.HP_BAR_BG;
  ctx.fillRect(barStartX, barStartY, barWidth, barHeight);
  ctx.fillStyle = lowHealth ? (Math.sin(now / 150) > 0 ? '#ff2222' : COLORS.HP_BAR) : COLORS.HP_BAR;
  ctx.fillRect(barStartX, barStartY, barWidth * hpRatio, barHeight);

  // Damage flash: bright white overlay on bar
  if (recentlyDamaged) {
    const flashProgress = (now - player.lastDamageTime) / 400;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * (1 - flashProgress)})`;
    ctx.fillRect(barStartX, barStartY, barWidth * hpRatio, barHeight);
  }

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${player.hp}/${player.maxHp}`, barStartX + barWidth / 2, hpY);

  // XP Bar
  const xpX = padding;
  const xpY = hudY + 38;

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('XP', xpX, xpY - 2);

  ctx.fillStyle = COLORS.XP_BAR_BG;
  ctx.fillRect(xpX + 25, xpY - 12, barWidth, barHeight);
  ctx.fillStyle = COLORS.XP_BAR;
  ctx.fillRect(xpX + 25, xpY - 12, barWidth * player.xpProgress, barHeight);

  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Lv ${player.level}`, xpX + 25 + barWidth / 2, xpY);

  // Floor indicator
  const floorX = hpX + barWidth + 50;
  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Floor ${floor}`, floorX, hudY + 22);

  // Weapon
  ctx.font = '13px monospace';
  ctx.fillStyle = COLORS.ITEM_WEAPON;
  ctx.fillText(`⚔ ${player.weapon.name}`, floorX, hudY + 42);

  // Damage range
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.fillText(`(${player.weapon.minDamage}-${player.weapon.maxDamage} dmg)`, floorX + 120, hudY + 42);

  // Stats
  const statsX = floorX + 230;
  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.fillText(`STR: ${player.strength}`, statsX, hudY + 22);
  ctx.fillText(`Kills: ${player.kills}`, statsX, hudY + 42);

  // Key counter (next to floor)
  if (keysRequired > 0) {
    const keyX = floorX + 120;
    ctx.fillStyle = keysCollected >= keysRequired ? '#06d6a0' : '#ffd700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    // Draw small key icon
    ctx.beginPath();
    ctx.arc(keyX + 4, hudY + 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(keyX + 2, hudY + 19, 3, 5);
    ctx.fillText(` ${keysCollected}/${keysRequired}`, keyX + 10, hudY + 22);
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(keysCollected >= keysRequired ? 'Stairs open' : 'Keys needed', keyX, hudY + 38);
  }

  // Consumable guide (right side)
  const guideX = canvas.width - 220;
  ctx.textAlign = 'left';
  ctx.font = '11px monospace';
  // Potion (heart icon)
  ctx.fillStyle = COLORS.ITEM_POTION;
  const phx = guideX + 4;
  const phy = hudY + 14;
  ctx.beginPath();
  ctx.moveTo(phx, phy + 3);
  ctx.bezierCurveTo(phx - 5, phy - 1, phx - 5, phy - 4.5, phx - 2.5, phy - 4.5);
  ctx.bezierCurveTo(phx - 0.5, phy - 4.5, phx, phy - 3, phx, phy - 2);
  ctx.bezierCurveTo(phx, phy - 3, phx + 0.5, phy - 4.5, phx + 2.5, phy - 4.5);
  ctx.bezierCurveTo(phx + 5, phy - 4.5, phx + 5, phy - 1, phx, phy + 3);
  ctx.fill();
  ctx.fillStyle = '#aaa';
  ctx.fillText('Potion +15HP (auto)', guideX + 14, hudY + 18);
  // Weapon
  ctx.strokeStyle = COLORS.ITEM_WEAPON;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(guideX, hudY + 30);
  ctx.lineTo(guideX + 8, hudY + 22);
  ctx.stroke();
  ctx.fillStyle = '#aaa';
  ctx.fillText('Weapon (press E)', guideX + 14, hudY + 30);
  // Scroll
  ctx.fillStyle = COLORS.ITEM_SCROLL;
  ctx.fillRect(guideX, hudY + 35, 8, 8);
  ctx.fillStyle = '#aaa';
  ctx.fillText('Scroll: blinds (E)', guideX + 14, hudY + 42);
  // Key
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(guideX + 4, hudY + 50, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(guideX + 2, hudY + 53, 3, 4);
  ctx.fillStyle = '#aaa';
  ctx.fillText('Key: unlocks stairs (auto)', guideX + 14, hudY + 54);

  // Minimap hint (visible, below minimap area)
  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('[M] Map  \u2022  Click minimap', canvas.width - 15, hudY - 8);

  // Message log (top-left)
  const msgs = messageLog.getRecent();
  ctx.textAlign = 'left';
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const age = Date.now() - msg.time;
    const alpha = Math.max(0, 1 - age / CONFIG.MESSAGE_DISPLAY_TIME);
    ctx.globalAlpha = alpha;
    ctx.font = '13px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(msg.text, 11, 21 + i * 20);
    ctx.fillStyle = COLORS.HUD_TEXT;
    ctx.fillText(msg.text, 10, 20 + i * 20);
  }
  ctx.globalAlpha = 1;
}

// Ambient particles for main menu
let menuParticles = [];
function ensureMenuParticles(canvas) {
  if (menuParticles.length > 0) return;
  for (let i = 0; i < 40; i++) {
    menuParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 12 - 4,
      size: Math.random() * 2.5 + 0.5,
      alpha: Math.random() * 0.3 + 0.05,
      hue: Math.random() * 40 + 30, // gold-amber range
    });
  }
}

// Draw main menu screen
export function drawMainMenu(ctx, canvas, highScores, hoverState = '') {
  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0a0a18');
  grad.addColorStop(0.5, '#12122a');
  grad.addColorStop(1, '#1a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ambient particles
  ensureMenuParticles(canvas);
  const dt = 16 / 1000;
  for (const p of menuParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
    if (p.x < -10) p.x = canvas.width + 10;
    if (p.x > canvas.width + 10) p.x = -10;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = `hsl(${p.hue}, 80%, 60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Subtle radial vignette
  const vignette = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.8
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const t = Date.now() / 1000;

  // Title with layered glow — larger
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(255, 214, 10, 0.6)';
  ctx.shadowBlur = 50;
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 60px monospace';
  ctx.fillText('DUNGEON', cx, cy - 170);
  ctx.shadowBlur = 30;
  ctx.font = 'bold 42px monospace';
  ctx.fillStyle = '#c9b06b';
  ctx.fillText('C R A W L E R', cx, cy - 118);
  ctx.restore();

  // Tagline
  ctx.fillStyle = '#6a6a8a';
  ctx.font = '16px monospace';
  ctx.fillText('A procedural roguelike  \u2022  5 floors  \u2022  permadeath', cx, cy - 82);

  // Two-column controls — larger text and spacing
  ctx.font = '14px monospace';
  const colL = cx - 150;
  const colR = cx + 30;
  const ctrlY = cy - 40;
  const ctrlSpacing = 26;
  const controls = [
    ['WASD', 'Move', 'E', 'Pick up'],
    ['Bump', 'Attack', 'SPACE', 'Wait'],
    ['ENTER', 'Descend', 'ESC', 'Pause'],
  ];
  for (let i = 0; i < controls.length; i++) {
    const [k1, v1, k2, v2] = controls[i];
    ctx.fillStyle = COLORS.PLAYER;
    ctx.textAlign = 'right';
    ctx.fillText(k1, colL + 56, ctrlY + i * ctrlSpacing);
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText(v1, colL + 66, ctrlY + i * ctrlSpacing);
    ctx.fillStyle = COLORS.PLAYER;
    ctx.textAlign = 'right';
    ctx.fillText(k2, colR + 56, ctrlY + i * ctrlSpacing);
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText(v2, colR + 66, ctrlY + i * ctrlSpacing);
  }

  // High scores
  if (highScores && (highScores.gamesPlayed || 0) > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555';
    ctx.font = '14px monospace';
    ctx.fillText(
      `Best: Floor ${highScores.highScore || 1}  \u2022  ${highScores.bestKills || 0} kills  \u2022  ${highScores.gamesPlayed || 0} games`,
      cx, cy + 70
    );
  }

  // Start button — larger
  const btnY = cy + 130;
  const btnW = 300;
  const btnH = 46;
  const isStartHover = hoverState === 'start';
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
  if (isStartHover) {
    ctx.fillStyle = 'rgba(255, 214, 10, 0.2)';
    ctx.shadowColor = COLORS.PLAYER;
    ctx.shadowBlur = 20;
  } else {
    ctx.fillStyle = `rgba(255, 214, 10, ${0.05 + pulse * 0.08})`;
    ctx.shadowColor = COLORS.PLAYER;
    ctx.shadowBlur = 10;
  }
  ctx.fill();
  ctx.strokeStyle = isStartHover ? COLORS.PLAYER : `rgba(255, 214, 10, ${0.3 + pulse * 0.3})`;
  ctx.lineWidth = isStartHover ? 2 : 1;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isStartHover ? '#fff' : COLORS.PLAYER;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ENTER  \u2014  Start Game', cx, btnY + 7);

  // Store button — below start
  const storeBtnY = cy + 194;
  const storeBtnW = 200;
  const storeBtnH = 38;
  const isStoreHover = hoverState === 'store';

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - storeBtnW / 2, storeBtnY - storeBtnH / 2, storeBtnW, storeBtnH, 5);
  ctx.fillStyle = isStoreHover ? 'rgba(180, 140, 255, 0.15)' : 'rgba(180, 140, 255, 0.05)';
  ctx.fill();
  ctx.strokeStyle = isStoreHover ? '#b185db' : 'rgba(180, 140, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isStoreHover ? '#d4b8ff' : '#9a7abf';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Store', cx, storeBtnY + 5);

  // Info icon (bottom-right) - clickable, larger
  const iconX = canvas.width - 55;
  const iconY = canvas.height - 50;
  const isHelpHover = hoverState === 'help';
  ctx.save();
  ctx.strokeStyle = isHelpHover ? COLORS.PLAYER : '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(iconX, iconY, 20, 0, Math.PI * 2);
  ctx.stroke();
  if (isHelpHover) {
    ctx.fillStyle = 'rgba(255, 214, 10, 0.15)';
    ctx.fill();
  }
  ctx.fillStyle = isHelpHover ? COLORS.PLAYER : '#888';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('?', iconX, iconY + 8);
  ctx.restore();
  ctx.fillStyle = '#666';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('How to Play', iconX, iconY + 40);
}

// Rounded rectangle helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// Draw the How to Play overlay
export function drawHowToPlay(ctx, canvas, scrollOffset) {
  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const margin = 40;
  const panelW = Math.min(700, canvas.width - margin * 2);
  const panelX = cx - panelW / 2;
  let y = 50 - scrollOffset;

  // Panel background
  ctx.fillStyle = '#12121f';
  ctx.fillRect(panelX - 20, 30, panelW + 40, canvas.height - 60);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX - 20, 30, panelW + 40, canvas.height - 60);

  // Clip to panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX - 20, 35, panelW + 40, canvas.height - 70);
  ctx.clip();

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 36px monospace';
  ctx.fillText('HOW TO PLAY', cx, y += 46);

  // Section helper — larger text
  function heading(text) {
    y += 48;
    ctx.fillStyle = COLORS.PLAYER;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, panelX, y);
    y += 10;
    ctx.strokeStyle = COLORS.PLAYER;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(panelX, y);
    ctx.lineTo(panelX + panelW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function line(text, color) {
    y += 26;
    ctx.fillStyle = color || '#ccc';
    ctx.font = '15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, panelX + 10, y);
  }

  function gap() { y += 10; }

  // --- Goal ---
  heading('GOAL');
  line('Descend through 5 floors of a procedurally generated dungeon.');
  line('Defeat The Ancient One (boss) on Floor 5 and take the final stairs.');
  line('Each floor is different. Explore, fight, loot, and survive.');

  // --- Movement & Combat ---
  heading('MOVEMENT & COMBAT');
  line('WASD or Arrow Keys to move in 4 directions.');
  line('Enemies move in real time — they will hunt you even if you stand still!');
  line('Walk INTO an enemy to attack (bump attack). No attack key needed.');
  line('You have an 85% hit chance. Damage = weapon + strength bonus.');
  line('Press SPACE or . to wait. Keep moving to stay ahead of enemies.');

  // --- Items ---
  heading('ITEMS');
  line('Health Potions (red heart) : Auto-picked up on walk-over. +15 HP.', COLORS.ITEM_POTION);
  line('Weapons (blue sword)  : Press E to equip. Better weapons on deeper floors.', COLORS.ITEM_WEAPON);
  line('  Dagger (1-4 dmg)  |  Shortsword (2-6)  |  Longsword (3-8, Floor 2+)');
  line('  Battle Axe (5-12 dmg, Floor 3+)');
  line('Scrolls (purple)      : Press E to use. Blinds nearest enemy.', COLORS.ITEM_SCROLL);
  line('Floor Keys (gold)     : Auto-picked up. Required to unlock the stairs.', '#ffd700');

  // --- Enemies ---
  heading('ENEMIES');
  line('Skeleton (beige)  - 30 HP, slow. Fights to the death.', COLORS.SKELETON);
  line('Goblin (green)    - 12 HP, fast. Flees when below 25% HP.', COLORS.GOBLIN);
  line('Troll (brown)     - 60 HP, very slow, heavy damage. Floor 3+.', COLORS.TROLL);
  gap();
  line('Elite enemies have crowns, larger bodies, and stronger stats.');
  line('Enemy dots: gray = idle, red = chasing you, yellow = fleeing.');
  line('Enemies use A* pathfinding to hunt you through corridors.');

  // --- Leveling ---
  heading('LEVELING UP');
  line('Kill enemies to earn XP. Level up for +5 max HP, +1 STR, full heal.');
  line('XP thresholds: Lv2=10, Lv3=25, Lv4=45, Lv5=70, Lv6=100, Lv7=140');

  // --- Floors ---
  heading('FLOOR PROGRESSION');
  line('Each floor requires keys to unlock the stairs. Explore to find them!');
  line('Floor 1: 5-8 enemies, lots of items. 1 key needed.');
  line('Floor 2: 8-12 enemies. Longswords appear. 1 key needed.');
  line('Floor 3: Trolls appear! Battle Axes available. 2 keys needed.');
  line('Floor 4: More trolls, fewer items. 2 keys needed.');
  line('Floor 5: 15-20 enemies + The Ancient One (boss). 3 keys needed.');

  // --- HUD ---
  heading('READING THE SCREEN');
  line('Bottom bar: HP (red), XP (yellow), floor, weapon, strength, kills.');
  line('Top-left: Combat messages (fade after 3 seconds).');
  line('Top-right: Minimap. White=you, Red=enemies, Yellow=stairs.');
  line('Fog of war: You see 8 tiles. Explored areas stay dimmed.');

  // --- Tips ---
  heading('TIPS');
  line('Lure enemies into corridors for 1-on-1 fights.');
  line('Grab every potion you can. Items get scarce on deeper floors.');
  line('Kill Goblins fast - they are quick and can swarm you.');
  line('Use Scrolls of Blinding on Trolls. They hit HARD.');
  line('Stand on yellow stairs and press ENTER to go deeper.');
  line('Check the minimap to find the stairs (yellow dot).');

  // --- Controls Reference ---
  heading('CONTROLS');
  line('WASD / Arrows  -  Move / Attack (bump into enemy)');
  line('E              -  Pick up item / Use scroll');
  line('SPACE or .     -  Wait (skip turn)');
  line('ENTER or >     -  Descend stairs');
  line('ESC            -  Pause menu');
  line('M              -  Toggle full map');
  line('R              -  Restart (from game over / victory)');

  ctx.restore();

  // Close hint at bottom
  ctx.fillStyle = '#888';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Press ESC or ? to close  |  Arrow keys to scroll', cx, canvas.height - 14);
}

// Draw pause menu
export function drawPauseMenu(ctx, canvas, selectedOption, hoverOption = -1) {
  // Darken screen with blur-like effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Panel background
  const panelW = 280;
  const panelH = 220;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - panelW / 2, cy - panelH / 2 - 20, panelW, panelH, 8);
  ctx.fillStyle = 'rgba(13, 13, 30, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 214, 10, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 28px monospace';
  ctx.fillText('PAUSED', cx, cy - 60);

  // Separator
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 80, cy - 40);
  ctx.lineTo(cx + 80, cy - 40);
  ctx.stroke();

  // Button options
  const options = ['Resume', 'Restart', 'Quit to Menu'];
  const btnW = 200;
  const btnH = 36;
  for (let i = 0; i < options.length; i++) {
    const btnY = cy - 10 + i * 44;
    const isSelected = i === selectedOption;
    const isHover = i === hoverOption;
    const active = isSelected || isHover;

    // Button background
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 4);
    if (active) {
      ctx.fillStyle = 'rgba(255, 214, 10, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 214, 10, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // Button text
    ctx.fillStyle = active ? COLORS.PLAYER : '#aaa';
    ctx.font = active ? 'bold 15px monospace' : '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(options[i], cx, btnY + 5);
  }

  // Hint
  ctx.fillStyle = '#444';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ESC to resume  \u2022  Click or ENTER to select', cx, cy + panelH / 2 - 30);
}

// Draw game over screen
export function drawGameOver(ctx, canvas, player, floor, seed) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.HP_BAR;
  ctx.font = 'bold 42px monospace';
  ctx.fillText('YOU DIED', cx, cy - 100);

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '16px monospace';
  ctx.fillText(`${player.causeOfDeath}`, cx, cy - 50);
  ctx.fillText(`Floor: ${floor}`, cx, cy - 20);
  ctx.fillText(`Level: ${player.level}`, cx, cy + 10);
  ctx.fillText(`Kills: ${player.kills}`, cx, cy + 40);
  ctx.fillText(`XP: ${player.xp}`, cx, cy + 70);

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.fillText(`Seed: ${seed}`, cx, cy + 110);

  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 16px monospace';
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.fillText('Press R or click to continue', cx, cy + 160);
  ctx.globalAlpha = 1;
}

// Draw victory screen
export function drawVictory(ctx, canvas, player, seed) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.save();
  ctx.fillStyle = COLORS.PLAYER;
  ctx.shadowColor = COLORS.PLAYER;
  ctx.shadowBlur = 30;
  ctx.font = 'bold 42px monospace';
  ctx.fillText('VICTORY!', cx, cy - 100);
  ctx.restore();

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '18px monospace';
  ctx.fillText('You have conquered the dungeon!', cx, cy - 50);

  ctx.font = '16px monospace';
  ctx.fillText(`Level: ${player.level}`, cx, cy);
  ctx.fillText(`Kills: ${player.kills}`, cx, cy + 30);
  ctx.fillText(`XP: ${player.xp}`, cx, cy + 60);

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.fillText(`Seed: ${seed}`, cx, cy + 100);

  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 16px monospace';
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.fillText('Press R or click to continue', cx, cy + 150);
  ctx.globalAlpha = 1;
}

// Draw Store overlay (Coming Soon)
export function drawStore(ctx, canvas) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Panel
  const panelW = 400;
  const panelH = 280;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - panelW / 2, cy - panelH / 2, panelW, panelH, 10);
  ctx.fillStyle = 'rgba(18, 18, 35, 0.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 140, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Store title
  ctx.textAlign = 'center';
  ctx.save();
  ctx.fillStyle = '#b185db';
  ctx.shadowColor = '#b185db';
  ctx.shadowBlur = 20;
  ctx.font = 'bold 32px monospace';
  ctx.fillText('STORE', cx, cy - 70);
  ctx.restore();

  // Separator
  ctx.strokeStyle = 'rgba(180, 140, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 100, cy - 45);
  ctx.lineTo(cx + 100, cy - 45);
  ctx.stroke();

  // Coming Soon text
  ctx.fillStyle = '#8a6abf';
  ctx.font = '18px monospace';
  ctx.fillText('Coming Soon', cx, cy - 10);

  // Description
  ctx.fillStyle = '#666';
  ctx.font = '13px monospace';
  ctx.fillText('Customize your character with', cx, cy + 30);
  ctx.fillText('cosmetics and unlockable skins.', cx, cy + 50);

  // Decorative diamond icons
  ctx.fillStyle = 'rgba(180, 140, 255, 0.2)';
  for (let i = 0; i < 3; i++) {
    const dx = cx - 40 + i * 40;
    const dy = cy + 85;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  // Close hint
  ctx.fillStyle = '#555';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Click or press ESC to close', cx, cy + panelH / 2 - 20);
}

// Draw level transition screen
export function drawLevelTransition(ctx, canvas, floor, progress) {
  // White flash fading out
  const alpha = 1 - progress;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (progress > 0.3) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.HUD_TEXT;
    ctx.font = 'bold 28px monospace';
    ctx.globalAlpha = Math.min(1, (progress - 0.3) / 0.3);
    ctx.fillText(`Floor ${floor}`, canvas.width / 2, canvas.height / 2);
    ctx.font = '14px monospace';
    ctx.fillText('You descend deeper into the dungeon...', canvas.width / 2, canvas.height / 2 + 35);
    ctx.globalAlpha = 1;
  }
}
