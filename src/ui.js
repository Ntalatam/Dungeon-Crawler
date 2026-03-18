// UI System - HUD, Menus, Message Log
import { COLORS, CONFIG, STATE } from './constants.js';

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
export function drawHUD(ctx, canvas, player, floor, messageLog) {
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

  // HP Bar
  const hpX = padding;
  const hpY = hudY + 12;
  const hpRatio = player.hp / player.maxHp;

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HP', hpX, hpY - 2);

  ctx.fillStyle = COLORS.HP_BAR_BG;
  ctx.fillRect(hpX + 25, hpY - 12, barWidth, barHeight);
  ctx.fillStyle = COLORS.HP_BAR;
  ctx.fillRect(hpX + 25, hpY - 12, barWidth * hpRatio, barHeight);

  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${player.hp}/${player.maxHp}`, hpX + 25 + barWidth / 2, hpY);

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

// Draw main menu screen
export function drawMainMenu(ctx, canvas, highScores) {
  // Dark overlay
  ctx.fillStyle = COLORS.BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 48px monospace';
  ctx.save();
  ctx.shadowColor = COLORS.PLAYER;
  ctx.shadowBlur = 20;
  ctx.fillText('DUNGEON CRAWLER', cx, cy - 120);
  ctx.restore();

  // Subtitle
  ctx.fillStyle = COLORS.HUD_TEXT;
  ctx.font = '16px monospace';
  ctx.fillText('A Procedural Roguelike', cx, cy - 80);

  // Controls
  ctx.fillStyle = '#888';
  ctx.font = '14px monospace';
  const controls = [
    'WASD / Arrow Keys - Move',
    'Bump into enemies to attack',
    'E - Pick up items',
    'SPACE - Wait a turn',
    'ENTER / > - Descend stairs',
    'ESC - Pause'
  ];
  for (let i = 0; i < controls.length; i++) {
    ctx.fillText(controls[i], cx, cy - 20 + i * 24);
  }

  // High scores
  if (highScores) {
    ctx.fillStyle = COLORS.STAIRS;
    ctx.font = '14px monospace';
    ctx.fillText(`Best Floor: ${highScores.highScore || 1}`, cx, cy + 140);
    ctx.fillText(`Best Kills: ${highScores.bestKills || 0}`, cx, cy + 164);
    ctx.fillText(`Games Played: ${highScores.gamesPlayed || 0}`, cx, cy + 188);
  }

  // Start prompt
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 18px monospace';
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.fillText('Press ENTER to start', cx, cy + 240);
  ctx.globalAlpha = 1;
}

// Draw pause menu
export function drawPauseMenu(ctx, canvas, selectedOption) {
  // Darken screen
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.PLAYER;
  ctx.font = 'bold 36px monospace';
  ctx.fillText('PAUSED', cx, cy - 60);

  const options = ['Resume', 'Restart', 'Quit to Menu'];
  for (let i = 0; i < options.length; i++) {
    ctx.fillStyle = i === selectedOption ? COLORS.PLAYER : COLORS.HUD_TEXT;
    ctx.font = i === selectedOption ? 'bold 20px monospace' : '18px monospace';
    const prefix = i === selectedOption ? '> ' : '  ';
    ctx.fillText(prefix + options[i], cx, cy + i * 36);
  }
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
  ctx.font = 'bold 18px monospace';
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.fillText('Press R to restart', cx, cy + 160);
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
  ctx.font = 'bold 18px monospace';
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.fillText('Press R to play again', cx, cy + 150);
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
