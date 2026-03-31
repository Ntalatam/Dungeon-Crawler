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

function fitTextToWidth(ctx, text, maxWidth) {
  if (!text || ctx.measureText(text).width <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}...`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted}...`;
}

// Draw the in-game HUD
export function drawHUD(ctx, canvas, player, floor, messageLog, keysCollected = 0, keysRequired = 0, context = {}) {
  const hudH = CONFIG.HUD_HEIGHT;
  const hudY = canvas.height - hudH;
  const padding = 15;
  const barWidth = 180;
  const barHeight = 15;
  const now = Date.now();
  const hpRatio = player.hp / player.maxHp;
  const recentlyDamaged = player.lastDamageTime && (now - player.lastDamageTime < 400);
  const lowHealth = player.hp > 0 && player.hp < 25;
  const roomName = context.currentRoom?.title || 'Corridor';
  const roomAccent = context.currentRoom?.accent || '#777';
  const promptText = context.promptText || '[F] Use item here';
  const speedBonus = (player.weapon.speedBonus || 0) + (player.armor?.moveBonus || 0) +
    (player.moveBonus || 0) + (player.floorMoveBonus || 0);

  ctx.fillStyle = COLORS.HUD_BG;
  ctx.fillRect(0, hudY, canvas.width, hudH);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hudY);
  ctx.lineTo(canvas.width, hudY);
  ctx.stroke();

  const hpX = padding;
  const hpY = hudY + 14;
  const hpBarX = hpX + 28;
  const hpBarY = hpY - 11;

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HP', hpX, hpY - 1);

  if (lowHealth) {
    ctx.save();
    const pulse = 0.3 + 0.4 * Math.sin(now / 200);
    ctx.shadowColor = '#e63946';
    ctx.shadowBlur = 12 + pulse * 8;
    ctx.fillStyle = `rgba(230, 57, 70, ${0.14 + pulse * 0.16})`;
    ctx.fillRect(hpBarX - 3, hpBarY - 3, barWidth + 6, barHeight + 6);
    ctx.restore();
  }

  if (recentlyDamaged) {
    ctx.save();
    const flashProgress = (now - player.lastDamageTime) / 400;
    const flashAlpha = 0.6 * (1 - flashProgress);
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
    ctx.fillRect(hpBarX - 2, hpBarY - 2, barWidth + 4, barHeight + 4);
    ctx.restore();
  }

  ctx.fillStyle = COLORS.HP_BAR_BG;
  ctx.fillRect(hpBarX, hpBarY, barWidth, barHeight);
  ctx.fillStyle = lowHealth && Math.sin(now / 150) > 0 ? '#ff2222' : COLORS.HP_BAR;
  ctx.fillRect(hpBarX, hpBarY, barWidth * hpRatio, barHeight);

  if (recentlyDamaged) {
    const flashProgress = (now - player.lastDamageTime) / 400;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * (1 - flashProgress)})`;
    ctx.fillRect(hpBarX, hpBarY, barWidth * hpRatio, barHeight);
  }

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${player.hp}/${player.maxHp}`, hpBarX + barWidth / 2, hpY);

  const xpY = hudY + 39;
  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('XP', hpX, xpY - 1);
  ctx.fillStyle = COLORS.XP_BAR_BG;
  ctx.fillRect(hpBarX, xpY - 11, barWidth, barHeight);
  ctx.fillStyle = COLORS.XP_BAR;
  ctx.fillRect(hpBarX, xpY - 11, barWidth * player.xpProgress, barHeight);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Lv ${player.level}`, hpBarX + barWidth / 2, xpY);

  const centerX = hpBarX + barWidth + 44;
  const statsX = centerX + 330;
  const statGap = canvas.width < 1500 ? 64 : 70;
  const roomNameX = centerX + 90;
  const roomNameMaxW = Math.max(100, statsX - roomNameX - 18);
  const promptMinX = statsX + statGap * 3 + (keysRequired > 0 ? 132 : 44);
  const desiredPromptW = canvas.width < 1400 ? 280 : 340;
  const promptBoxX = Math.min(
    Math.max(promptMinX, canvas.width - desiredPromptW - 18),
    canvas.width - 208
  );
  const promptW = Math.max(190, canvas.width - promptBoxX - 18);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`Floor ${floor}`, centerX, hudY + 20);
  ctx.fillStyle = roomAccent;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(fitTextToWidth(ctx, roomName, roomNameMaxW), roomNameX, hudY + 20);

  ctx.fillStyle = player.weapon.cursed ? '#8b00ff' : COLORS.ITEM_WEAPON;
  ctx.font = '13px monospace';
  ctx.fillText(player.weapon.name, centerX, hudY + 38);
  ctx.fillStyle = player.armor ? COLORS.ITEM_ARMOR : '#666';
  ctx.fillText(player.armor ? player.armor.name : 'No armor', centerX + 145, hudY + 38);

  const weaponNotes = [];
  if (player.weapon.reach > 1) weaponNotes.push(`reach ${player.weapon.reach}`);
  if (player.weapon.hitBonus) weaponNotes.push(`+${Math.round(player.weapon.hitBonus * 100)}% hit`);
  if (player.weapon.armorPierce) weaponNotes.push(`pierce ${player.weapon.armorPierce}`);
  const avgDmg = ((player.weapon.minDamage + player.weapon.maxDamage) / 2).toFixed(1);
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.fillText(
    `${player.weapon.minDamage}-${player.weapon.maxDamage} dmg (avg ${avgDmg})${weaponNotes.length ? `, ${weaponNotes.join(', ')}` : ''}`,
    centerX,
    hudY + 53
  );

  const stats = [
    { label: 'STR', value: player.strength, color: COLORS.HUD_TEXT },
    { label: 'DEF', value: player.defense, color: COLORS.ITEM_ARMOR },
    { label: 'WARD', value: player.wardCharges, color: COLORS.ITEM_WARDING },
    { label: 'GOLD', value: player.gold, color: COLORS.ITEM_GOLD },
    { label: 'SPD', value: `${speedBonus >= 0 ? '+' : ''}${speedBonus}`, color: COLORS.ITEM_SWIFT },
    { label: 'KILL', value: player.kills, color: COLORS.HUD_TEXT }
  ];

  ctx.font = '12px monospace';
  stats.forEach((stat, index) => {
    const x = statsX + (index % 3) * statGap;
    const y = hudY + 16 + Math.floor(index / 3) * 18;
    ctx.fillStyle = stat.color;
    ctx.fillText(`${stat.label}: ${stat.value}`, x, y);
  });

  if (keysRequired > 0) {
    const keyX = statsX + statGap * 3 + 12;
    ctx.fillStyle = keysCollected >= keysRequired ? '#06d6a0' : '#ffd700';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`KEYS ${keysCollected}/${keysRequired}`, keyX, hudY + 16);
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(keysCollected >= keysRequired ? 'Stairs unlocked' : 'Seal remains on the stairs', keyX, hudY + 31);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(promptBoxX, hudY + 8, promptW, 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(promptBoxX, hudY + 8, promptW, 30);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 11px monospace';
  ctx.fillText('ACTION', promptBoxX + 10, hudY + 20);
  ctx.fillStyle = '#d0d0d0';
  ctx.font = '11px monospace';
  ctx.fillText(fitTextToWidth(ctx, promptText, promptW - 20), promptBoxX + 10, hudY + 33);

  ctx.fillStyle = context.audioMuted ? '#e63946' : '#666';
  ctx.font = '11px monospace';
  ctx.fillText(context.audioMuted ? 'Audio muted' : 'Audio on', promptBoxX + 10, hudY + 53);

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('[M] Map  \u2022  Click minimap', canvas.width - 15, hudY - 8);

  const msgs = messageLog.getRecent();
  ctx.textAlign = 'left';
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const age = now - msg.time;
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
export function drawMainMenu(ctx, canvas, highScores, hoverState = '', difficulty = 'normal', customSeed = null) {
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
  ctx.fillText('Realtime dungeon tactics  \u2022  seeded runs  \u2022  permadeath', cx, cy - 82);

  // Two-column controls — larger text and spacing
  ctx.font = '14px monospace';
  const colL = cx - 150;
  const colR = cx + 30;
  const ctrlY = cy - 40;
  const ctrlSpacing = 26;
  const controls = [
    ['WASD', 'Move', 'F', 'Use / pick up'],
    ['Q/E/Z/C', 'Diagonal', 'SPACE', 'Wait'],
    ['Bump', 'Attack', 'ESC', 'Pause / audio'],
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

  // Difficulty and seed options
  ctx.textAlign = 'center';
  const diffLabel = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[difficulty] || 'Normal';
  const diffColor = { easy: '#06d6a0', normal: COLORS.PLAYER, hard: '#e63946' }[difficulty] || COLORS.PLAYER;
  ctx.fillStyle = diffColor;
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`[D] Difficulty: ${diffLabel}`, cx, cy + 92);

  ctx.fillStyle = '#777';
  ctx.font = '12px monospace';
  const seedText = customSeed !== null ? `Seed: ${customSeed}` : 'Seed: Random';
  ctx.fillText(`[S] ${seedText}   [T] Daily Run`, cx, cy + 112);

  // Start button — larger
  const btnY = cy + 140;
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

  ctx.fillStyle = '#7a8ca5';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Vaults, guard posts, sanctuaries, merchants, shrines', cx, cy + 204);

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

export function getPauseMenuLayout(canvas, optionCount = 4) {
  const panelW = 300;
  const panelH = 150 + optionCount * 44;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    cx,
    cy,
    panelW,
    panelH,
    panelX: cx - panelW / 2,
    panelY: cy - panelH / 2 - 20,
    btnW: 220,
    btnH: 36,
    btnYStart: cy - 18
  };
}

export function getInteractionMenuLayout(canvas, optionCount = 3) {
  const panelW = Math.min(560, canvas.width - 80);
  const panelH = Math.max(260, 150 + optionCount * 58);
  const panelX = canvas.width / 2 - panelW / 2;
  const panelY = canvas.height / 2 - panelH / 2;
  return {
    panelW,
    panelH,
    panelX,
    panelY,
    optionX: panelX + 26,
    optionY: panelY + 102,
    optionW: panelW - 52,
    optionH: 46,
    optionGap: 12
  };
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
  line('WASD or Arrow Keys move in cardinal directions. Q/E/Z/C moves diagonally.');
  line('Enemies act in real time on cooldowns, so positioning matters even while you hesitate.');
  line('Walk into an enemy to strike. Spears can attack from two tiles away down open lanes.');
  line('Weapons change tempo: faster blades reposition well, heavy weapons break armor, cursed gear bites back.');
  line('Press SPACE or . to wait. Good timing matters when archers and hazards share a room.');

  // --- Items ---
  heading('ITEMS');
  line('Health Potions restore HP. Warding Elixirs add ward charges that soften incoming hits.', COLORS.ITEM_POTION);
  line('Quickstep Elixirs grant floor-long speed. Scrolls of Blinding disrupt the nearest visible threat.', COLORS.ITEM_SCROLL);
  line('Weapons define your build: daggers and rapiers are accurate, spears control lanes, axes and mauls crack armor.', COLORS.ITEM_WEAPON);
  line('Armor trades mobility for durability. Dragonscale keeps lava manageable.', COLORS.ITEM_ARMOR);
  line('Gold is auto-collected and spent at Quartermasters inside some sanctuaries.', COLORS.ITEM_GOLD);
  line('Floor Keys are auto-collected and unlock sealed stairs once enough are found.', '#ffd700');
  gap();
  line('Cursed items are stronger than they look, but every hit costs blood.', '#8b00ff');

  // --- Enemies ---
  heading('ENEMIES');
  line('Skeletons are patient anchors. They hold space well and do not panic.', COLORS.SKELETON);
  line('Goblins are fragile skirmishers. Ice helps them, and they flee if a fight turns bad.', COLORS.GOBLIN);
  line('Archers look for firing lanes and prefer hazard buffers between you and them.', COLORS.ARCHER);
  line('Trolls are juggernauts. Lava empowers them instead of slowing them down.', COLORS.TROLL);
  gap();
  line('Elite enemies gain extra durability, more gold, and more pressure in key rooms.');
  line('Enemy markers: gray = idle, red = chasing, yellow = fleeing.');
  line('Hazards affect enemies too. Watch who avoids them, who uses them, and who does not care.');

  // --- Leveling ---
  heading('LEVELING UP');
  line('Kill enemies to earn XP. Level up for +5 max HP, +1 STR, full heal.');
  line('XP thresholds: Lv2=10, Lv3=25, Lv4=45, Lv5=70, Lv6=100, Lv7=140');

  // --- Room Types ---
  heading('ROOM TYPES');
  line('Dusty Chambers are standard rooms with balanced pressure and scavenging.');
  line('Vaults are rich but exposed. They reward quick looting and sharp exits.');
  line('Guard Posts are structured kill-zones with better defenders and cleaner ranged lines.');
  line('Sanctuaries have no combat spawns and contain one strong feature: fountain, shrine, or merchant.');

  // --- Hazards ---
  heading('ENVIRONMENTAL HAZARDS (Floor 2+)');
  line('Lava burns most units, but some monsters become stronger inside it.', COLORS.LAVA);
  line('Ice carries movement forward. Goblins slide especially well.', COLORS.ICE);
  line('Spike traps punish careless routing and can finish weakened enemies.', COLORS.SPIKE_TRAP);

  // --- Floors ---
  heading('FLOOR PROGRESSION');
  line('Each floor requires keys to unlock the stairs. Explore to find them!');
  line('Difficulty changes enemy durability, damage, XP, and total item density.');
  line('Early floors offer more sustain. Later floors compress item supply and raise room pressure.');
  line('Sanctuaries and merchants create build pivots mid-run instead of simple stat padding.');
  line('Floor 5 ends with The Ancient One, whose later phases change tempo and arena control.');
  gap();
  line('The Ancient One has 4 phases and eventually begins leaving lava behind while fighting.');

  // --- HUD ---
  heading('READING THE SCREEN');
  line('Bottom bar: HP, XP, floor, room name, weapon/armor, gold, ward, speed, keys, and your contextual action.');
  line('Top-left: Combat messages (fade after 3 seconds).');
  line('Top-right: Minimap. Room colors hint at vaults, guard posts, and sanctuaries once explored.');
  line('Large room banners appear when you enter important spaces for faster recognition.');

  // --- Tips ---
  heading('TIPS');
  line('Pull archers around corners or force them to move off their ideal firing lane.');
  line('Let hazards do work for you, but remember some enemies gain value from them too.');
  line('Spend gold on identity, not panic. Quartermasters are strongest when they sharpen a plan.');
  line('Shrines trade permanent power for permanent cost. Pick the drawback your run can absorb.');
  line('Hover enemies and items for deeper readouts, and watch room banners for immediate intent.');
  line('Press B for colorblind mode and use the pause menu for audio controls.');
  line('Press D on the main menu to change difficulty, S for a custom seed, and T for the daily run.');

  // --- Controls Reference ---
  heading('CONTROLS');
  line('WASD / Arrows  -  Move / Attack (bump into enemy)');
  line('Q/E/Z/C        -  Diagonal movement (NW/NE/SW/SE)');
  line('F              -  Interact, equip, drink, or open a sanctuary menu');
  line('SPACE or .     -  Wait (skip turn)');
  line('ENTER or >     -  Descend stairs');
  line('ESC            -  Pause menu / close overlays');
  line('B              -  Toggle colorblind mode');
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
export function drawPauseMenu(ctx, canvas, selectedOption, hoverOption = -1, audioMuted = false) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const options = ['Resume', audioMuted ? 'Audio: Muted' : 'Audio: On', 'Restart', 'Quit to Menu'];
  const layout = getPauseMenuLayout(canvas, options.length);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, layout.panelX, layout.panelY, layout.panelW, layout.panelH, 8);
  ctx.fillStyle = 'rgba(13, 13, 30, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 214, 10, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 28px monospace';
  ctx.fillText('PAUSED', layout.cx, layout.cy - 78);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.cx - 92, layout.cy - 58);
  ctx.lineTo(layout.cx + 92, layout.cy - 58);
  ctx.stroke();

  for (let i = 0; i < options.length; i++) {
    const btnY = layout.btnYStart + i * 44;
    const active = i === selectedOption || i === hoverOption;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, layout.cx - layout.btnW / 2, btnY - layout.btnH / 2, layout.btnW, layout.btnH, 4);
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

    ctx.fillStyle = active ? COLORS.PLAYER : (i === 1 && audioMuted ? '#e63946' : '#aaa');
    ctx.font = active ? 'bold 15px monospace' : '14px monospace';
    ctx.fillText(options[i], layout.cx, btnY + 5);
  }

  ctx.fillStyle = '#444';
  ctx.font = '11px monospace';
  ctx.fillText('ESC to resume  \u2022  Click or ENTER to select', layout.cx, layout.panelY + layout.panelH - 20);
}

export function drawInteractionMenu(ctx, canvas, menu, selectedOption = 0, hoverOption = -1) {
  if (!menu) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const layout = getInteractionMenuLayout(canvas, menu.options.length);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, layout.panelX, layout.panelY, layout.panelW, layout.panelH, 10);
  ctx.fillStyle = 'rgba(12, 16, 28, 0.96)';
  ctx.fill();
  ctx.strokeStyle = menu.color || COLORS.PLAYER;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.fillStyle = menu.color || COLORS.PLAYER;
  ctx.font = 'bold 26px monospace';
  ctx.fillText(menu.title, layout.panelX + 24, layout.panelY + 38);
  ctx.fillStyle = '#b8bccd';
  ctx.font = '13px monospace';
  ctx.fillText(menu.subtitle || '', layout.panelX + 24, layout.panelY + 62);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(layout.panelX + 24, layout.panelY + 78);
  ctx.lineTo(layout.panelX + layout.panelW - 24, layout.panelY + 78);
  ctx.stroke();

  for (let i = 0; i < menu.options.length; i++) {
    const option = menu.options[i];
    const y = layout.optionY + i * (layout.optionH + layout.optionGap);
    const active = i === selectedOption || i === hoverOption;
    const disabled = !!option.disabled;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, layout.optionX, y, layout.optionW, layout.optionH, 6);
    if (active && !disabled) {
      ctx.fillStyle = 'rgba(255, 214, 10, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 214, 10, 0.36)';
    } else {
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)';
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = disabled ? '#646878' : (active ? '#fff4c2' : '#f2e9e4');
    ctx.font = 'bold 15px monospace';
    ctx.fillText(option.title, layout.optionX + 16, y + 20);
    ctx.fillStyle = disabled ? '#5c6070' : '#a8adbe';
    ctx.font = '12px monospace';
    ctx.fillText(option.description, layout.optionX + 16, y + 36);

    if (option.cost !== null && option.cost !== undefined) {
      ctx.fillStyle = disabled ? '#606570' : COLORS.ITEM_GOLD;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${option.cost}g`, layout.optionX + layout.optionW - 16, y + 28);
      ctx.textAlign = 'left';
    } else if (disabled) {
      ctx.fillStyle = '#606570';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('taken', layout.optionX + layout.optionW - 16, y + 28);
      ctx.textAlign = 'left';
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#666';
  ctx.font = '11px monospace';
  ctx.fillText('Enter or F to confirm  \u2022  ESC to leave', canvas.width / 2, layout.panelY + layout.panelH - 18);
}

export function drawRoomBanner(ctx, canvas, banner) {
  if (!banner) return;

  const elapsed = banner.until - Date.now();
  if (elapsed <= 0) return;

  const duration = CONFIG.ROOM_BANNER_MS;
  const progress = 1 - elapsed / duration;
  const fadeIn = Math.min(1, progress / 0.18);
  const fadeOut = Math.min(1, elapsed / 450);
  const alpha = Math.min(fadeIn, fadeOut);
  const width = Math.min(520, canvas.width - 70);
  const x = canvas.width / 2 - width / 2;
  const y = 26;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  roundRect(ctx, x, y, width, 66, 10);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.92)';
  ctx.fill();
  ctx.strokeStyle = banner.color || COLORS.PLAYER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = banner.color || COLORS.PLAYER;
  ctx.font = 'bold 19px monospace';
  ctx.fillText(banner.title, canvas.width / 2, y + 24);
  ctx.fillStyle = '#d4dae8';
  ctx.font = '12px monospace';
  ctx.fillText(banner.subtitle, canvas.width / 2, y + 45);
  ctx.restore();
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
