// Field of View - Recursive Shadowcasting
import { TILE, CONFIG } from './constants.js';

// Recursive shadowcasting using octant-based approach
// Each octant is processed separately with coordinate transforms

const OCTANT_TRANSFORMS = [
  { xx: 1, xy: 0, yx: 0, yy: 1 },   // 0: E-NE
  { xx: 0, xy: 1, yx: 1, yy: 0 },   // 1: NE-N
  { xx: 0, xy: -1, yx: 1, yy: 0 },  // 2: N-NW
  { xx: -1, xy: 0, yx: 0, yy: 1 },  // 3: NW-W
  { xx: -1, xy: 0, yx: 0, yy: -1 }, // 4: W-SW
  { xx: 0, xy: -1, yx: -1, yy: 0 }, // 5: SW-S
  { xx: 0, xy: 1, yx: -1, yy: 0 },  // 6: S-SE
  { xx: 1, xy: 0, yx: 0, yy: -1 }   // 7: SE-E
];

function isOpaque(map, x, y) {
  if (x < 0 || x >= CONFIG.MAP_WIDTH || y < 0 || y >= CONFIG.MAP_HEIGHT) return true;
  return map[y][x] === TILE.WALL;
}

function castLight(map, visible, ox, oy, radius, row, startSlope, endSlope, transform) {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;

    for (let dx = -i, dy = -i; dx <= 0; dx++) {
      // Translate dx, dy into map coordinates using octant transform
      const mapX = ox + dx * transform.xx + dy * transform.xy;
      const mapY = oy + dx * transform.yx + dy * transform.yy;

      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rightSlope) continue;
      if (endSlope > leftSlope) break;

      // Check if tile is within radius
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius) {
        if (mapX >= 0 && mapX < CONFIG.MAP_WIDTH && mapY >= 0 && mapY < CONFIG.MAP_HEIGHT) {
          visible[mapY][mapX] = true;
        }
      }

      if (blocked) {
        if (isOpaque(map, mapX, mapY)) {
          nextStartSlope = rightSlope;
          continue;
        } else {
          blocked = false;
          startSlope = nextStartSlope;
        }
      } else if (isOpaque(map, mapX, mapY) && i < radius) {
        blocked = true;
        castLight(map, visible, ox, oy, radius, i + 1, startSlope, rightSlope, transform);
        nextStartSlope = rightSlope;
      }
    }

    if (blocked) break;
  }
}

// Compute FOV from a position, returns 2D boolean array of visible tiles
export function computeFOV(map, playerX, playerY, radius) {
  const visible = [];
  for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
    visible[y] = new Array(CONFIG.MAP_WIDTH).fill(false);
  }

  // Player's tile is always visible
  visible[playerY][playerX] = true;

  // Cast light in all 8 octants
  for (const transform of OCTANT_TRANSFORMS) {
    castLight(map, visible, playerX, playerY, radius, 1, 1.0, 0.0, transform);
  }

  return visible;
}

// Update the explored map (persistent across FOV updates)
export function updateExplored(explored, visible) {
  for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
    for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
      if (visible[y][x]) {
        explored[y][x] = true;
      }
    }
  }
}

// Create a fresh explored array
export function createExploredMap() {
  const explored = [];
  for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
    explored[y] = new Array(CONFIG.MAP_WIDTH).fill(false);
  }
  return explored;
}

// Check line of sight between two points (for enemy AI)
export function hasLineOfSight(map, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1, cy = y1;

  while (cx !== x2 || cy !== y2) {
    if (isOpaque(map, cx, cy) && (cx !== x1 || cy !== y1)) return false;

    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return true;
}
