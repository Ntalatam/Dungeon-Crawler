// Renderer - HTML5 Canvas 2D drawing
import { TILE, COLORS, CONFIG } from './constants.js';

// Ease-out cubic for smooth deceleration
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.targetCamera = { x: 0, y: 0 };
    this.effects = [];
    this.particles = [];
    this.screenFlash = null;
    this.screenShake = { x: 0, y: 0, intensity: 0, decay: 0 };
    // Offscreen canvas for static map layer
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = CONFIG.MAP_WIDTH * CONFIG.TILE_SIZE;
    this.mapCanvas.height = CONFIG.MAP_HEIGHT * CONFIG.TILE_SIZE;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.gritMap = null;
    this.time = 0;
    this.keysCollected = 0;
    this.keysRequired = 0;
    this.projectiles = [];
    this.colorblindMode = false;
    this.playerHpRatio = 1;
    this.bossRevealed = false;
    this.bossRevealTime = 0;
    this.mapDirty = true; // Map layer needs redraw
  }

  // Generate random grit dots for floor texturing (seeded)
  generateGrit(rng) {
    this.gritMap = [];
    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      this.gritMap[y] = [];
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        const dots = [];
        const count = Math.floor(rng() * 3) + 2;
        for (let i = 0; i < count; i++) {
          dots.push({
            dx: Math.floor(rng() * CONFIG.TILE_SIZE),
            dy: Math.floor(rng() * CONFIG.TILE_SIZE),
            alpha: 0.05 + rng() * 0.1
          });
        }
        this.gritMap[y][x] = dots;
      }
    }
  }

  // Update camera to follow target (smooth lerp)
  updateCamera(targetX, targetY, deltaTime) {
    this.targetCamera.x = targetX + CONFIG.TILE_SIZE / 2;
    this.targetCamera.y = targetY + CONFIG.TILE_SIZE / 2;
    // Frame-rate independent lerp
    const t = 1 - Math.pow(0.001, deltaTime / 1000);
    this.camera.x += (this.targetCamera.x - this.camera.x) * t;
    this.camera.y += (this.targetCamera.y - this.camera.y) * t;
  }

  // Snap camera immediately (on floor change)
  snapCamera(targetX, targetY) {
    this.camera.x = targetX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.camera.y = targetY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.targetCamera.x = this.camera.x;
    this.targetCamera.y = this.camera.y;
  }

  // Get screen offset for drawing
  getOffset() {
    return {
      x: Math.floor(this.canvas.width / 2 - this.camera.x + this.screenShake.x),
      y: Math.floor(this.canvas.height / 2 - this.camera.y + this.screenShake.y)
    };
  }

  // Update screen shake
  updateShake(deltaTime) {
    if (this.screenShake.intensity > 0.1) {
      this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
      this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
      this.screenShake.intensity *= Math.pow(this.screenShake.decay, deltaTime / 16);
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
      this.screenShake.intensity = 0;
    }
  }

  // Trigger screen shake
  shake(intensity = 6, decay = 0.85) {
    this.screenShake.intensity = intensity;
    this.screenShake.decay = decay;
  }

  // Mark map as needing redraw (call when FOV changes)
  invalidateMap() {
    this.mapDirty = true;
  }

  // Redraw the static map layer (only when dirty)
  renderMapLayer(map, visible, explored) {
    if (!this.mapDirty) return;
    this.mapDirty = false;
    const ctx = this.mapCtx;
    const ts = CONFIG.TILE_SIZE;

    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        const tile = map[y][x];
        const isVisible = visible[y][x];
        const isExplored = explored[y][x];

        if (!isVisible && !isExplored) continue;

        const px = x * ts;
        const py = y * ts;
        const alpha = isVisible ? 1.0 : 0.35;

        ctx.globalAlpha = alpha;

        switch (tile) {
          case TILE.WALL:
            // Wall body with gradient feel
            ctx.fillStyle = COLORS.WALL;
            ctx.fillRect(px, py, ts, ts);
            // Top highlight
            ctx.fillStyle = COLORS.WALL_TOP;
            ctx.fillRect(px, py, ts, 4);
            // Bottom shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(px, py + ts - 2, ts, 2);
            // Side edges
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fillRect(px, py, 1, ts);
            ctx.fillRect(px + ts - 1, py, 1, ts);
            break;

          case TILE.FLOOR:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            // Subtle tile border
            if (isVisible) {
              ctx.fillStyle = 'rgba(0,0,0,0.04)';
              ctx.fillRect(px, py, ts, 1);
              ctx.fillRect(px, py, 1, ts);
            }
            // Grit texture
            if (this.gritMap && this.gritMap[y][x]) {
              for (const dot of this.gritMap[y][x]) {
                ctx.globalAlpha = alpha * dot.alpha;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(px + dot.dx, py + dot.dy, 1, 1);
              }
              ctx.globalAlpha = alpha;
            }
            break;

          case TILE.CORRIDOR:
            ctx.fillStyle = isVisible ? COLORS.CORRIDOR_LIT : COLORS.CORRIDOR;
            ctx.fillRect(px, py, ts, ts);
            if (isVisible) {
              ctx.fillStyle = 'rgba(0,0,0,0.06)';
              ctx.fillRect(px, py, ts, 1);
              ctx.fillRect(px, py, 1, ts);
            }
            break;

          case TILE.DOOR:
            ctx.fillStyle = isVisible ? COLORS.CORRIDOR_LIT : COLORS.CORRIDOR;
            ctx.fillRect(px, py, ts, ts);
            // Door frame
            ctx.fillStyle = '#5a4a20';
            ctx.fillRect(px + ts * 0.25, py + 1, ts * 0.5, ts - 2);
            // Door panel
            ctx.fillStyle = COLORS.DOOR;
            ctx.fillRect(px + ts * 0.3, py + 3, ts * 0.4, ts - 6);
            // Door handle
            ctx.fillStyle = '#d4a017';
            ctx.fillRect(px + ts * 0.55, py + ts * 0.45, 3, 3);
            break;

          case TILE.STAIRS_DOWN: {
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            const stairsLocked = this.keysCollected < this.keysRequired;
            ctx.strokeStyle = stairsLocked ? '#666' : COLORS.STAIRS;
            ctx.lineWidth = 2;
            ctx.shadowColor = stairsLocked ? '#444' : COLORS.STAIRS;
            ctx.shadowBlur = isVisible ? 4 : 0;
            for (let i = 0; i < 4; i++) {
              const sy = py + 6 + i * 6;
              const sx = px + 4 + i * 3;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(px + ts - 4 - i * 3, sy);
              ctx.stroke();
            }
            // Lock icon when locked
            if (stairsLocked && isVisible) {
              const cx = px + ts / 2;
              const cy = py + ts / 2;
              // Lock body
              ctx.fillStyle = '#888';
              ctx.fillRect(cx - 5, cy - 1, 10, 8);
              // Lock shackle
              ctx.strokeStyle = '#888';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(cx, cy - 1, 4, Math.PI, 0);
              ctx.stroke();
            }
            ctx.shadowBlur = 0;
            break;
          }

          case TILE.STAIRS_UP:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            ctx.strokeStyle = COLORS.STAIRS;
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
              const sy = py + 6 + i * 6;
              ctx.beginPath();
              ctx.moveTo(px + 4 + i * 3, sy);
              ctx.lineTo(px + ts - 4 - i * 3, sy);
              ctx.stroke();
            }
            break;

          case TILE.LAVA:
            ctx.fillStyle = isVisible ? '#331100' : '#220800';
            ctx.fillRect(px, py, ts, ts);
            if (isVisible) {
              ctx.fillStyle = COLORS.LAVA;
              ctx.globalAlpha = alpha * (0.4 + 0.2 * Math.sin(this.time * 3 + x * 2));
              ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
              ctx.globalAlpha = alpha;
              ctx.fillStyle = COLORS.LAVA_GLOW;
              ctx.globalAlpha = alpha * 0.15;
              ctx.fillRect(px, py, ts, ts);
              ctx.globalAlpha = alpha;
            }
            break;

          case TILE.ICE:
            ctx.fillStyle = isVisible ? '#c8e6f0' : '#6a8a94';
            ctx.fillRect(px, py, ts, ts);
            if (isVisible) {
              ctx.strokeStyle = 'rgba(255,255,255,0.3)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px + 4, py + ts / 2);
              ctx.lineTo(px + ts - 4, py + ts / 2);
              ctx.moveTo(px + ts / 2, py + 4);
              ctx.lineTo(px + ts / 2, py + ts - 4);
              ctx.stroke();
            }
            break;

          case TILE.SPIKE_TRAP:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            if (isVisible) {
              ctx.fillStyle = COLORS.SPIKE_TRAP;
              // Draw small triangle spikes
              for (let sx = 0; sx < 3; sx++) {
                for (let sy = 0; sy < 3; sy++) {
                  const spx = px + 5 + sx * 9;
                  const spy = py + 5 + sy * 9;
                  ctx.beginPath();
                  ctx.moveTo(spx, spy + 5);
                  ctx.lineTo(spx + 3, spy);
                  ctx.lineTo(spx + 6, spy + 5);
                  ctx.fill();
                }
              }
            }
            break;
        }
      }
    }

    ctx.globalAlpha = 1.0;
  }

  // Get interpolated pixel position for an entity
  getEntityPixelPos(entity, offset) {
    const ts = CONFIG.TILE_SIZE;
    const px = entity.renderX * ts + ts / 2 + offset.x;
    const py = entity.renderY * ts + ts / 2 + offset.y;
    return { px, py };
  }

  // Draw the player entity
  drawPlayer(ctx, player, offset, gameStartTime) {
    const ts = CONFIG.TILE_SIZE;
    const { px, py } = this.getEntityPixelPos(player, offset);

    // Bouncing arrow indicator above player (fades out after 5 seconds)
    if (gameStartTime !== undefined) {
      const elapsed = Date.now() - gameStartTime;
      if (elapsed < 5000) {
        const alpha = Math.max(0, 1 - elapsed / 5000);
        const bounce = Math.sin(elapsed / 200) * 4;
        const arrowY = py - ts * 0.8 - 12 + bounce;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.PLAYER;
        ctx.beginPath();
        ctx.moveTo(px, arrowY + 10);
        ctx.lineTo(px - 7, arrowY);
        ctx.lineTo(px + 7, arrowY);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', px, arrowY - 5);
        ctx.restore();
      }
    }

    // Hit flash effect
    const isHit = player.hitFlash && player.hitFlash > 0;

    // Glow effect
    ctx.save();
    ctx.shadowColor = isHit ? '#ff0000' : COLORS.PLAYER;
    ctx.shadowBlur = isHit ? 20 : 14;

    // Diamond shape (rotated square)
    const size = ts * 0.38;
    ctx.fillStyle = isHit ? '#ff6666' : COLORS.PLAYER;
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size, py);
    ctx.closePath();
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = isHit ? 'rgba(255,200,200,0.3)' : 'rgba(255,255,255,0.15)';
    const inner = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(px, py - inner);
    ctx.lineTo(px + inner, py);
    ctx.lineTo(px, py + inner);
    ctx.lineTo(px - inner, py);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Draw an enemy entity
  drawEnemy(ctx, enemy, offset, visible) {
    // Only draw if the enemy's actual tile position is visible
    if (!visible[enemy.y][enemy.x]) return;

    // Boss reveal animation trigger
    if (enemy.isBoss && !this.bossRevealed) {
      this.bossRevealed = true;
      this.bossRevealTime = this.time;
      this.shake(10, 0.88);
      this.flash('#ff4444', 500);
    }

    const ts = CONFIG.TILE_SIZE;
    const { px, py } = this.getEntityPixelPos(enemy, offset);
    const isElite = enemy.isMiniBoss || enemy.isBoss;
    const baseRadius = ts * (isElite ? 0.48 : 0.32);
    const radius = baseRadius;

    const isHit = enemy.hitFlash && enemy.hitFlash > 0;

    // Shadow under enemy
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + radius + 2, radius * 0.7, radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Elite/boss: pulsing outer ring aura
    if (isElite && !isHit) {
      const pulse = 0.4 + 0.3 * Math.sin(this.time * 4);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = enemy.isBoss ? '#ff4444' : enemy.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Glow (stronger for elites)
    ctx.shadowColor = isHit ? '#ffffff' : enemy.color;
    ctx.shadowBlur = isHit ? 16 : (isElite ? 16 : 10);

    // Circle body with slight scale on hit
    const drawRadius = isHit ? radius * 1.15 : radius;
    ctx.fillStyle = isHit ? '#ffffff' : enemy.color;
    ctx.beginPath();
    ctx.arc(px, py, drawRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner detail (face-like)
    if (!isHit) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(px - radius * 0.25, py - radius * 0.15, radius * 0.15, 0, Math.PI * 2);
      ctx.arc(px + radius * 0.25, py - radius * 0.15, radius * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Elite crown/spikes
      if (isElite) {
        ctx.fillStyle = enemy.isBoss ? '#ff4444' : 'rgba(255,255,255,0.4)';
        const crownY = py - radius - 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(px + i * 4 - 2, crownY);
          ctx.lineTo(px + i * 4, crownY - 5);
          ctx.lineTo(px + i * 4 + 2, crownY);
          ctx.fill();
        }
      }

      // Ranged enemy crosshair indicator
      if (enemy.isRanged) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - radius * 0.5, py);
        ctx.lineTo(px + radius * 0.5, py);
        ctx.moveTo(px, py - radius * 0.5);
        ctx.lineTo(px, py + radius * 0.5);
        ctx.stroke();
      }
    }

    ctx.restore();

    // HP bar (only if damaged)
    if (enemy.hp < enemy.maxHp) {
      const barWidth = ts * (isElite ? 1.0 : 0.8);
      const barHeight = isElite ? 5 : 4;
      const barX = px - barWidth / 2;
      const barY = py - radius - (isElite ? 14 : 10);
      const hpRatio = enemy.hp / enemy.maxHp;

      ctx.fillStyle = COLORS.HP_BAR_BG;
      ctx.fillRect(barX, barY, barWidth, barHeight);
      const hpColor = hpRatio > 0.5 ? COLORS.HP_BAR :
                       hpRatio > 0.25 ? '#ff8800' : '#ff0000';
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    // State indicator
    const indicatorY = py - radius - (isElite ? 18 : 14);
    if (enemy.state === 'CHASE' || enemy.state === 'ATTACK' || enemy.state === 'RANGED_ATTACK') {
      ctx.fillStyle = '#ff4444';
      ctx.font = `bold ${isElite ? 12 : 10}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('!', px, indicatorY);
    } else if (enemy.state === 'FLEEING') {
      ctx.fillStyle = '#ffff00';
      ctx.font = `bold ${isElite ? 12 : 10}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('~', px, indicatorY);
    }

    // Enemy name label below (always shown for visible enemies)
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(enemy.name, px, py + radius + 14);

    // Colorblind mode: large letter overlay on enemy body
    if (this.colorblindMode) {
      const letter = enemy.isBoss ? 'B' : enemy.type.charAt(0).toUpperCase();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${isElite ? 14 : 11}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(letter, px, py + 4);
    }
  }

  // Draw an item on the ground
  drawItem(ctx, item, offset, visible) {
    if (!visible[item.y][item.x]) return;

    const ts = CONFIG.TILE_SIZE;
    const px = item.x * ts + ts / 2 + offset.x;
    const py = item.y * ts + ts / 2 + offset.y;

    // Gentle hover animation
    const hover = Math.sin(this.time * 3 + item.x * 2 + item.y) * 2;

    ctx.save();

    if (item.type === 'weapon') {
      // Sword with glow (cursed weapons are purple)
      const wColor = item.data && item.data.cursed ? '#8b00ff' : COLORS.ITEM_WEAPON;
      ctx.shadowColor = wColor;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = wColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 4, py + 6 + hover);
      ctx.lineTo(px + 4, py - 6 + hover);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 1 + hover);
      ctx.lineTo(px + 5, py - 1 + hover);
      ctx.stroke();
    } else if (item.type === 'potion') {
      // Heart shape — immediately reads as health
      ctx.shadowColor = COLORS.ITEM_POTION;
      ctx.shadowBlur = 8;
      ctx.fillStyle = COLORS.ITEM_POTION;
      const hx = px;
      const hy = py + hover;
      ctx.beginPath();
      ctx.moveTo(hx, hy + 5);
      ctx.bezierCurveTo(hx - 7, hy - 2, hx - 7, hy - 7, hx - 3.5, hy - 7);
      ctx.bezierCurveTo(hx - 1, hy - 7, hx, hy - 5, hx, hy - 3);
      ctx.bezierCurveTo(hx, hy - 5, hx + 1, hy - 7, hx + 3.5, hy - 7);
      ctx.bezierCurveTo(hx + 7, hy - 7, hx + 7, hy - 2, hx, hy + 5);
      ctx.fill();
      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(hx - 2.5, hy - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === 'scroll') {
      ctx.shadowColor = COLORS.ITEM_SCROLL;
      ctx.shadowBlur = 6;
      ctx.fillStyle = COLORS.ITEM_SCROLL;
      ctx.fillRect(px - 5, py - 5 + hover, 10, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px - 3, py - 3 + hover, 6, 1);
      ctx.fillRect(px - 3, py + hover, 6, 1);
      ctx.fillRect(px - 3, py + 3 + hover, 6, 1);
    } else if (item.type === 'armor') {
      // Shield shape
      ctx.shadowColor = COLORS.ITEM_ARMOR;
      ctx.shadowBlur = 6;
      ctx.fillStyle = COLORS.ITEM_ARMOR;
      ctx.beginPath();
      ctx.moveTo(px, py - 6 + hover);
      ctx.lineTo(px + 6, py - 3 + hover);
      ctx.lineTo(px + 5, py + 3 + hover);
      ctx.lineTo(px, py + 7 + hover);
      ctx.lineTo(px - 5, py + 3 + hover);
      ctx.lineTo(px - 6, py - 3 + hover);
      ctx.closePath();
      ctx.fill();
      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(px - 1, py - 2 + hover, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === 'key') {
      // Gold key with glow
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd700';
      // Key head (circle)
      ctx.beginPath();
      ctx.arc(px, py - 3 + hover, 4, 0, Math.PI * 2);
      ctx.fill();
      // Key shaft
      ctx.fillRect(px - 1.5, py + 1 + hover, 3, 8);
      // Key teeth
      ctx.fillRect(px + 1.5, py + 5 + hover, 3, 2);
      ctx.fillRect(px + 1.5, py + 8 + hover, 2, 2);
    }

    // Colorblind mode: letter overlay on items
    if (this.colorblindMode) {
      const letters = { potion: 'P', weapon: 'W', scroll: 'S', key: 'K', armor: 'A' };
      const letter = letters[item.type] || '?';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(letter, px, py + 4 + hover);
    }

    ctx.restore();
  }

  // Draw floating damage/heal numbers
  drawEffects(ctx, offset, deltaTime) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const eff = this.effects[i];
      eff.age += deltaTime;

      if (eff.age > 1200) {
        this.effects.splice(i, 1);
        continue;
      }

      const progress = eff.age / 1200;
      // Fast rise then slow
      const rise = easeOutCubic(Math.min(progress * 2, 1)) * 40;
      const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
      // Scale pop on spawn
      const scale = progress < 0.1 ? 1 + (1 - progress / 0.1) * 0.5 : 1;

      const ts = CONFIG.TILE_SIZE;
      const px = eff.x * ts + ts / 2 + offset.x;
      const py = eff.y * ts - rise + offset.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(16 * scale)}px monospace`;
      ctx.textAlign = 'center';
      // Shadow for readability
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(eff.text, px + 1, py + 1);
      ctx.fillStyle = eff.color;
      ctx.fillText(eff.text, px, py);
      ctx.restore();
    }
  }

  // Add a floating text effect
  addEffect(x, y, text, color) {
    this.effects.push({ x, y, text, color, age: 0 });
  }

  // Spawn death particles at a position
  spawnDeathParticles(x, y, color) {
    const ts = CONFIG.TILE_SIZE;
    const cx = x * ts + ts / 2;
    const cy = y * ts + ts / 2;
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
      const speed = 40 + Math.random() * 60;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.3,
        age: 0,
        color: color,
        size: 2 + Math.random() * 3
      });
    }
  }

  // Spawn golden level-up particle burst
  spawnLevelUpParticles(x, y) {
    const ts = CONFIG.TILE_SIZE;
    const cx = x * ts + ts / 2;
    const cy = y * ts + ts / 2;
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.6 + Math.random() * 0.4,
        age: 0,
        color: i % 2 === 0 ? '#ffd60a' : '#ffffff',
        size: 2 + Math.random() * 4
      });
    }
  }

  // Add a projectile trail (for ranged attacks)
  addProjectile(fromX, fromY, toX, toY, color) {
    const ts = CONFIG.TILE_SIZE;
    this.projectiles.push({
      fromX: fromX * ts + ts / 2,
      fromY: fromY * ts + ts / 2,
      toX: toX * ts + ts / 2,
      toY: toY * ts + ts / 2,
      color,
      age: 0,
      life: 300
    });
  }

  // Draw projectile trails
  drawProjectiles(ctx, offset, deltaTime) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += deltaTime;
      if (p.age >= p.life) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const progress = p.age / p.life;
      const alpha = 1 - progress;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      // Draw arrow line from source to target
      const headProgress = Math.min(progress * 3, 1);
      const tailProgress = Math.max(0, progress * 3 - 0.5);
      const hx = p.fromX + (p.toX - p.fromX) * headProgress + offset.x;
      const hy = p.fromY + (p.toY - p.fromY) * headProgress + offset.y;
      const tx = p.fromX + (p.toX - p.fromX) * tailProgress + offset.x;
      const ty = p.fromY + (p.toY - p.fromY) * tailProgress + offset.y;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Update and draw particles
  drawParticles(ctx, offset, deltaTime) {
    const dt = deltaTime / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt; // gravity
      p.vx *= 0.97;

      const alpha = 1 - p.age / p.life;
      const size = p.size * alpha;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.fillRect(p.x + offset.x - size / 2, p.y + offset.y - size / 2, size, size);
      ctx.restore();
    }
  }

  // Draw screen flash overlay
  drawScreenFlash(ctx, deltaTime) {
    if (!this.screenFlash) return;

    this.screenFlash.age += deltaTime;
    if (this.screenFlash.age > this.screenFlash.duration) {
      this.screenFlash = null;
      return;
    }

    const progress = this.screenFlash.age / this.screenFlash.duration;
    const alpha = 0.25 * (1 - easeOutCubic(progress));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.screenFlash.color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  // Trigger a screen flash
  flash(color, duration = 200) {
    this.screenFlash = { color, duration, age: 0 };
  }

  // Draw minimap
  drawMinimap(ctx, map, visible, explored, player, enemies, items, keysCollected, keysRequired) {
    const mw = CONFIG.MINIMAP_WIDTH;
    const mh = CONFIG.MINIMAP_HEIGHT;
    const ms = CONFIG.MINIMAP_SCALE;
    const mx = this.canvas.width - mw - 10;
    const my = 10;

    // Background
    ctx.fillStyle = COLORS.MINIMAP_BG;
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 2, my - 2, mw + 4, mh + 4);

    const offsetX = Math.floor(mw / 2) - player.x * ms;
    const offsetY = Math.floor(mh / 2) - player.y * ms;

    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();

    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        if (!explored[y][x]) continue;

        const px = mx + x * ms + offsetX;
        const py = my + y * ms + offsetY;

        if (px < mx - ms || px > mx + mw || py < my - ms || py > my + mh) continue;

        const tile = map[y][x];
        if (tile === TILE.WALL) {
          ctx.fillStyle = '#3a3e59';
          ctx.fillRect(px, py, ms, ms);
        } else if (tile === TILE.STAIRS_DOWN) {
          // Show locked/unlocked stairs
          ctx.fillStyle = (keysCollected >= keysRequired) ? COLORS.STAIRS : '#666';
          ctx.fillRect(px, py, ms, ms);
        } else {
          ctx.fillStyle = visible[y][x] ? '#555' : '#333';
          ctx.fillRect(px, py, ms, ms);
        }
      }
    }

    // Visible keys on minimap (gold dots)
    if (items) {
      for (const item of items) {
        if (item.type !== 'key') continue;
        if (!explored[item.y] || !explored[item.y][item.x]) continue;
        const px = mx + item.x * ms + offsetX;
        const py = my + item.y * ms + offsetY;
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px, py, ms, ms);
      }
    }

    // Visible enemies (mini-bosses slightly larger on minimap)
    for (const enemy of enemies) {
      if (!enemy.isAlive || !visible[enemy.y][enemy.x]) continue;
      const px = mx + enemy.x * ms + offsetX;
      const py = my + enemy.y * ms + offsetY;
      if (enemy.isMiniBoss || enemy.isBoss) {
        ctx.fillStyle = '#ff6666';
        ctx.fillRect(px - 1, py - 1, ms + 2, ms + 2);
      } else {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(px, py, ms, ms);
      }
    }

    // Player
    const ppx = mx + player.x * ms + offsetX;
    const ppy = my + player.y * ms + offsetY;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ppx, ppy, ms + 1, ms + 1);

    ctx.restore();

    // Click hint
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[M] or click to expand', mx + mw / 2, my + mh + 14);
  }

  // Draw enlarged minimap overlay (full-screen)
  drawMinimapOverlay(ctx, map, visible, explored, player, enemies, items) {
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Calculate scale to fit map on screen
    const padding = 80;
    const availW = this.canvas.width - padding * 2;
    const availH = this.canvas.height - padding * 2;
    const scaleX = availW / CONFIG.MAP_WIDTH;
    const scaleY = availH / CONFIG.MAP_HEIGHT;
    const scale = Math.min(scaleX, scaleY, 12);

    const mapW = CONFIG.MAP_WIDTH * scale;
    const mapH = CONFIG.MAP_HEIGHT * scale;
    const ox = Math.floor((this.canvas.width - mapW) / 2);
    const oy = Math.floor((this.canvas.height - mapH) / 2);

    // Panel background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(ox - 4, oy - 4, mapW + 8, mapH + 8);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 4, oy - 4, mapW + 8, mapH + 8);

    // Draw map tiles
    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        if (!explored[y][x]) continue;

        const px = ox + x * scale;
        const py = oy + y * scale;
        const isVisible = visible[y][x];
        const tile = map[y][x];

        if (tile === TILE.WALL) {
          ctx.fillStyle = isVisible ? '#4a4e69' : '#333';
          ctx.fillRect(px, py, scale, scale);
        } else if (tile === TILE.STAIRS_DOWN) {
          ctx.fillStyle = COLORS.STAIRS;
          ctx.fillRect(px, py, scale, scale);
        } else if (tile === TILE.DOOR) {
          ctx.fillStyle = isVisible ? '#8b6914' : '#554010';
          ctx.fillRect(px, py, scale, scale);
        } else {
          ctx.fillStyle = isVisible ? '#666' : '#444';
          ctx.fillRect(px, py, scale, scale);
        }
      }
    }

    // Items (keys highlighted)
    if (items) {
      for (const item of items) {
        if (!explored[item.y] || !explored[item.y][item.x]) continue;
        const px = ox + item.x * scale;
        const py = oy + item.y * scale;
        if (item.type === 'key') {
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(px, py, scale, scale);
        } else if (visible[item.y][item.x]) {
          ctx.fillStyle = item.type === 'potion' ? '#e63946' :
                          item.type === 'weapon' ? '#90e0ef' : '#b185db';
          ctx.globalAlpha = 0.7;
          ctx.fillRect(px, py, scale, scale);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Enemies
    for (const enemy of enemies) {
      if (!enemy.isAlive || !visible[enemy.y][enemy.x]) continue;
      ctx.fillStyle = enemy.color;
      ctx.fillRect(ox + enemy.x * scale, oy + enemy.y * scale, scale, scale);
    }

    // Player (slightly larger, white with glow)
    ctx.save();
    ctx.shadowColor = COLORS.PLAYER;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + player.x * scale - 1, oy + player.y * scale - 1, scale + 2, scale + 2);
    ctx.restore();

    // Legend
    const legY = oy + mapH + 20;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.fillText('Click anywhere or press M / ESC to close', this.canvas.width / 2, legY);

    // Color legend
    const legX = ox;
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    const legends = [
      ['#ffffff', 'You'],
      ['#e63946', 'Enemy'],
      [COLORS.STAIRS, 'Stairs'],
      ['#ffd700', 'Key'],
    ];
    for (let i = 0; i < legends.length; i++) {
      const lx = legX + i * 100;
      ctx.fillStyle = legends[i][0];
      ctx.fillRect(lx, legY + 10, 8, 8);
      ctx.fillStyle = '#aaa';
      ctx.fillText(legends[i][1], lx + 14, legY + 18);
    }
  }

  // Main draw call
  draw(gameState) {
    const ctx = this.ctx;
    const { map, visible, explored, player, enemies, items } = gameState;
    const deltaTime = gameState.deltaTime || 16;
    this.time += deltaTime / 1000;
    this.keysCollected = gameState.keysCollected || 0;
    this.keysRequired = gameState.keysRequired || 0;
    this.playerHpRatio = player.hp / player.maxHp;

    // Update interpolation for all entities
    this.updateEntityInterpolation(player, deltaTime);
    for (const enemy of enemies) {
      if (enemy.isAlive) this.updateEntityInterpolation(enemy, deltaTime);
    }

    // Update shake
    this.updateShake(deltaTime);

    // Update camera using interpolated player position
    this.updateCamera(player.renderX * CONFIG.TILE_SIZE, player.renderY * CONFIG.TILE_SIZE, deltaTime);
    const offset = this.getOffset();

    // Clear screen
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render map layer
    this.renderMapLayer(map, visible, explored);
    ctx.drawImage(this.mapCanvas, offset.x, offset.y);

    // Draw items
    for (const item of items) {
      this.drawItem(ctx, item, offset, visible);
    }

    // Draw enemies
    for (const enemy of enemies) {
      if (enemy.isAlive) {
        this.drawEnemy(ctx, enemy, offset, visible);
      }
    }

    // Draw particles (dead enemy particles, etc.)
    this.drawParticles(ctx, offset, deltaTime);

    // Draw projectiles (ranged attacks)
    this.drawProjectiles(ctx, offset, deltaTime);

    // Draw player
    this.drawPlayer(ctx, player, offset, gameState.gameStartTime);

    // Draw effects (damage numbers)
    this.drawEffects(ctx, offset, deltaTime);

    // Draw screen flash
    this.drawScreenFlash(ctx, deltaTime);

    // Vignette overlay for atmosphere
    this.drawVignette(ctx);

    // Boss reveal banner
    if (this.bossRevealed && this.bossRevealTime > 0) {
      const elapsed = this.time - this.bossRevealTime;
      if (elapsed < 2.5) {
        this.drawBossRevealBanner(ctx, elapsed);
      }
    }

    // Draw minimap
    this.drawMinimap(ctx, map, visible, explored, player, enemies, items,
      gameState.keysCollected || 0, gameState.keysRequired || 0);

    // Decay hit flashes
    if (player.hitFlash > 0) player.hitFlash -= deltaTime;
    for (const enemy of enemies) {
      if (enemy.hitFlash > 0) enemy.hitFlash -= deltaTime;
    }
  }

  // Draw vignette overlay for atmospheric effect + low-health warning
  drawVignette(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Standard atmospheric vignette
    const gradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Low-health red vignette overlay (pulsing when HP < 30%)
    if (this.playerHpRatio < 0.3 && this.playerHpRatio > 0) {
      const severity = 1 - this.playerHpRatio / 0.3; // 0 at 30%, 1 at 0%
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      const alpha = severity * (0.15 + pulse * 0.1);
      const redGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.7);
      redGrad.addColorStop(0, 'rgba(230,57,70,0)');
      redGrad.addColorStop(1, `rgba(230,57,70,${alpha})`);
      ctx.fillStyle = redGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Boss reveal dramatic banner
  drawBossRevealBanner(ctx, elapsed) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Fade in (0-0.5s), hold (0.5-1.8s), fade out (1.8-2.5s)
    let alpha;
    if (elapsed < 0.5) {
      alpha = elapsed / 0.5;
    } else if (elapsed < 1.8) {
      alpha = 1;
    } else {
      alpha = 1 - (elapsed - 1.8) / 0.7;
    }

    // Dark bar across screen
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, h * 0.35, w, h * 0.18);

    // Red accent lines
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(0, h * 0.35, w, 2);
    ctx.fillRect(0, h * 0.53 - 2, w, 2);

    // Boss name text
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 20;
    ctx.font = 'bold 32px monospace';
    ctx.fillText('THE ANCIENT ONE', w / 2, h * 0.43);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cc8888';
    ctx.font = '14px monospace';
    ctx.fillText('A terrible power awakens...', w / 2, h * 0.49);

    ctx.restore();
  }

  // Smoothly interpolate entity render position toward actual position
  updateEntityInterpolation(entity, deltaTime) {
    if (entity.renderX === undefined) {
      entity.renderX = entity.x;
      entity.renderY = entity.y;
    }

    const dx = entity.x - entity.renderX;
    const dy = entity.y - entity.renderY;

    // If too far (teleport/floor change), snap
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      entity.renderX = entity.x;
      entity.renderY = entity.y;
      return;
    }

    // Smooth interpolation with ease-out feel
    const speed = 12; // tiles per second
    const maxStep = speed * deltaTime / 1000;

    if (Math.abs(dx) > 0.01) {
      entity.renderX += Math.sign(dx) * Math.min(Math.abs(dx), maxStep);
    } else {
      entity.renderX = entity.x;
    }

    if (Math.abs(dy) > 0.01) {
      entity.renderY += Math.sign(dy) * Math.min(Math.abs(dy), maxStep);
    } else {
      entity.renderY = entity.y;
    }
  }
}
