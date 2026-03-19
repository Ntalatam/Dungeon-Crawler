// Renderer - HTML5 Canvas 2D drawing
import { TILE, COLORS, CONFIG } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.targetCamera = { x: 0, y: 0 };
    this.effects = []; // floating damage numbers, flashes
    this.screenFlash = null;
    // Offscreen canvas for static map layer
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = CONFIG.MAP_WIDTH * CONFIG.TILE_SIZE;
    this.mapCanvas.height = CONFIG.MAP_HEIGHT * CONFIG.TILE_SIZE;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapDirty = true;
    // Store grit positions per tile for consistent texturing
    this.gritMap = null;
  }

  // Generate random grit dots for floor texturing (seeded)
  generateGrit(rng) {
    this.gritMap = [];
    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      this.gritMap[y] = [];
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        const dots = [];
        const count = Math.floor(rng() * 3) + 1;
        for (let i = 0; i < count; i++) {
          dots.push({
            dx: Math.floor(rng() * CONFIG.TILE_SIZE),
            dy: Math.floor(rng() * CONFIG.TILE_SIZE),
            alpha: 0.1 + rng() * 0.15
          });
        }
        this.gritMap[y][x] = dots;
      }
    }
  }

  // Update camera to follow target (smooth lerp)
  updateCamera(targetX, targetY) {
    this.targetCamera.x = targetX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.targetCamera.y = targetY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.camera.x += (this.targetCamera.x - this.camera.x) * CONFIG.CAMERA_LERP;
    this.camera.y += (this.targetCamera.y - this.camera.y) * CONFIG.CAMERA_LERP;
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
      x: Math.floor(this.canvas.width / 2 - this.camera.x),
      y: Math.floor(this.canvas.height / 2 - this.camera.y)
    };
  }

  // Redraw the static map layer
  renderMapLayer(map, visible, explored) {
    const ctx = this.mapCtx;
    const ts = CONFIG.TILE_SIZE;

    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
        const tile = map[y][x];
        const isVisible = visible[y][x];
        const isExplored = explored[y][x];

        if (!isVisible && !isExplored) continue; // completely dark

        const px = x * ts;
        const py = y * ts;
        const alpha = isVisible ? 1.0 : 0.4;

        ctx.globalAlpha = alpha;

        switch (tile) {
          case TILE.WALL:
            ctx.fillStyle = COLORS.WALL;
            ctx.fillRect(px, py, ts, ts);
            // Top edge highlight for pseudo-3D
            ctx.fillStyle = COLORS.WALL_TOP;
            ctx.fillRect(px, py, ts, 3);
            break;

          case TILE.FLOOR:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            // Draw grit texture
            if (this.gritMap && this.gritMap[y][x]) {
              for (const dot of this.gritMap[y][x]) {
                ctx.globalAlpha = alpha * dot.alpha;
                ctx.fillStyle = '#000';
                ctx.fillRect(px + dot.dx, py + dot.dy, 1, 1);
              }
              ctx.globalAlpha = alpha;
            }
            break;

          case TILE.CORRIDOR:
            ctx.fillStyle = isVisible ? COLORS.CORRIDOR_LIT : COLORS.CORRIDOR;
            ctx.fillRect(px, py, ts, ts);
            break;

          case TILE.DOOR:
            ctx.fillStyle = isVisible ? COLORS.CORRIDOR_LIT : COLORS.CORRIDOR;
            ctx.fillRect(px, py, ts, ts);
            // Draw door as brown vertical bar
            ctx.fillStyle = COLORS.DOOR;
            ctx.fillRect(px + ts * 0.3, py + 2, ts * 0.4, ts - 4);
            break;

          case TILE.STAIRS_DOWN:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            // Draw stairs symbol (descending lines)
            ctx.strokeStyle = COLORS.STAIRS;
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
              const sy = py + 6 + i * 6;
              const sx = px + 4 + i * 3;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(px + ts - 4 - i * 3, sy);
              ctx.stroke();
            }
            break;

          case TILE.STAIRS_UP:
            ctx.fillStyle = isVisible ? COLORS.FLOOR_LIT : COLORS.FLOOR;
            ctx.fillRect(px, py, ts, ts);
            // Draw stairs symbol (ascending lines)
            ctx.strokeStyle = COLORS.STAIRS;
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
              const sy = py + 6 + i * 6;
              const sx = px + ts - 4 - i * 3;
              ctx.beginPath();
              ctx.moveTo(px + 4 + i * 3, sy);
              ctx.lineTo(sx, sy);
              ctx.stroke();
            }
            break;
        }
      }
    }

    ctx.globalAlpha = 1.0;
  }

  // Draw the player entity
  drawPlayer(ctx, player, offset, gameStartTime) {
    const ts = CONFIG.TILE_SIZE;
    const px = player.x * ts + ts / 2 + offset.x;
    const py = player.y * ts + ts / 2 + offset.y;

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

        // "You" label
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', px, arrowY - 5);
        ctx.restore();
      }
    }

    // Glow effect
    ctx.save();
    ctx.shadowColor = COLORS.PLAYER;
    ctx.shadowBlur = 12;

    // Diamond shape (rotated square)
    const size = ts * 0.35;
    ctx.fillStyle = COLORS.PLAYER;
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size, py);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Draw an enemy entity
  drawEnemy(ctx, enemy, offset, visible) {
    if (!visible[enemy.y][enemy.x]) return;

    const ts = CONFIG.TILE_SIZE;
    const px = enemy.x * ts + ts / 2 + offset.x;
    const py = enemy.y * ts + ts / 2 + offset.y;
    const radius = ts * 0.3;

    // Glowing outline
    ctx.save();
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 8;

    // Circle body
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar (only if damaged)
    if (enemy.hp < enemy.maxHp) {
      const barWidth = ts * 0.8;
      const barHeight = 4;
      const barX = px - barWidth / 2;
      const barY = py - radius - 8;
      const hpRatio = enemy.hp / enemy.maxHp;

      ctx.fillStyle = COLORS.HP_BAR_BG;
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = COLORS.HP_BAR;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    }

    // State indicator dot (small dot above enemy)
    const dotColor = enemy.state === 'CHASE' ? '#ff0000' :
                     enemy.state === 'ATTACK' ? '#ff4444' :
                     enemy.state === 'FLEEING' ? '#ffff00' : '#666666';
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(px, py - radius - 14, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw an item on the ground
  drawItem(ctx, item, offset, visible) {
    if (!visible[item.y][item.x]) return;

    const ts = CONFIG.TILE_SIZE;
    const px = item.x * ts + ts / 2 + offset.x;
    const py = item.y * ts + ts / 2 + offset.y;

    if (item.type === 'weapon') {
      // Sword shape
      ctx.strokeStyle = COLORS.ITEM_WEAPON;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 4, py + 6);
      ctx.lineTo(px + 4, py - 6);
      ctx.stroke();
      // Crossguard
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 1);
      ctx.lineTo(px + 5, py - 1);
      ctx.stroke();
    } else if (item.type === 'potion') {
      // Plus symbol for potion
      ctx.fillStyle = COLORS.ITEM_POTION;
      ctx.fillRect(px - 1, py - 5, 3, 10);
      ctx.fillRect(px - 5, py - 1, 10, 3);
    } else if (item.type === 'scroll') {
      // Scroll icon
      ctx.fillStyle = COLORS.ITEM_SCROLL;
      ctx.fillRect(px - 4, py - 5, 8, 10);
      ctx.fillStyle = '#000';
      ctx.fillRect(px - 2, py - 3, 4, 1);
      ctx.fillRect(px - 2, py, 4, 1);
      ctx.fillRect(px - 2, py + 3, 4, 1);
    }
  }

  // Draw floating damage/heal numbers
  drawEffects(ctx, offset, deltaTime) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const eff = this.effects[i];
      eff.age += deltaTime;
      eff.y -= deltaTime * 0.03; // Float upward

      if (eff.age > 1000) {
        this.effects.splice(i, 1);
        continue;
      }

      const alpha = 1 - eff.age / 1000;
      const ts = CONFIG.TILE_SIZE;
      const px = eff.x * ts + ts / 2 + offset.x;
      const py = eff.y * ts + offset.y;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = eff.color;
      ctx.fillText(eff.text, px, py);
      ctx.restore();
    }
  }

  // Add a floating text effect
  addEffect(x, y, text, color) {
    this.effects.push({ x, y, text, color, age: 0 });
  }

  // Draw screen flash overlay
  drawScreenFlash(ctx) {
    if (!this.screenFlash) return;

    this.screenFlash.age += 16; // approximate frame time
    if (this.screenFlash.age > this.screenFlash.duration) {
      this.screenFlash = null;
      return;
    }

    const alpha = 0.3 * (1 - this.screenFlash.age / this.screenFlash.duration);
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
  drawMinimap(ctx, map, visible, explored, player, enemies, endRoom) {
    const mw = CONFIG.MINIMAP_WIDTH;
    const mh = CONFIG.MINIMAP_HEIGHT;
    const ms = CONFIG.MINIMAP_SCALE;
    const mx = this.canvas.width - mw - 10;
    const my = 10;

    // Background
    ctx.fillStyle = COLORS.MINIMAP_BG;
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);

    // Calculate offset to center minimap on player
    const offsetX = Math.floor(mw / 2) - player.x * ms;
    const offsetY = Math.floor(mh / 2) - player.y * ms;

    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();

    // Draw explored tiles
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
          ctx.fillStyle = COLORS.STAIRS;
          ctx.fillRect(px, py, ms, ms);
        } else {
          ctx.fillStyle = visible[y][x] ? '#555' : '#333';
          ctx.fillRect(px, py, ms, ms);
        }
      }
    }

    // Draw visible enemies
    for (const enemy of enemies) {
      if (!visible[enemy.y][enemy.x]) continue;
      const px = mx + enemy.x * ms + offsetX;
      const py = my + enemy.y * ms + offsetY;
      ctx.fillStyle = '#e63946';
      ctx.fillRect(px, py, ms, ms);
    }

    // Draw player
    const ppx = mx + player.x * ms + offsetX;
    const ppy = my + player.y * ms + offsetY;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ppx, ppy, ms, ms);

    ctx.restore();
  }

  // Main draw call
  draw(gameState) {
    const ctx = this.ctx;
    const { map, visible, explored, player, enemies, items } = gameState;
    const deltaTime = gameState.deltaTime || 16;

    // Update camera
    this.updateCamera(player.x, player.y);
    const offset = this.getOffset();

    // Clear screen
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render map layer (always re-render since FOV changes)
    this.renderMapLayer(map, visible, explored);

    // Draw map layer with camera offset
    ctx.drawImage(this.mapCanvas, offset.x, offset.y);

    // Draw items
    for (const item of items) {
      this.drawItem(ctx, item, offset, visible);
    }

    // Draw enemies
    for (const enemy of enemies) {
      this.drawEnemy(ctx, enemy, offset, visible);
    }

    // Draw player
    this.drawPlayer(ctx, player, offset, gameState.gameStartTime);

    // Draw effects
    this.drawEffects(ctx, offset, deltaTime);

    // Draw screen flash
    this.drawScreenFlash(ctx);

    // Draw minimap
    this.drawMinimap(ctx, map, visible, explored, player, enemies, gameState.endRoom);
  }
}
