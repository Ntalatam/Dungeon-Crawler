# Dungeon Crawler

A browser-playable top-down roguelike dungeon crawler built with vanilla JavaScript and HTML5 Canvas 2D. No frameworks, no dependencies — pure JS with procedural dungeon generation, A* pathfinding, and shadowcasting FOV.

## How to Run

Since this is a pure static web app using ES6 modules, you need an HTTP server (browsers block module loading from `file://` URLs).

### Option 1: VS Code Live Server (Recommended)
1. Install the **Live Server** extension in VS Code (by Ritwick Dey)
2. Right-click on `index.html` in the file explorer
3. Select **"Open with Live Server"**
4. Your browser opens automatically at `http://localhost:5500`

### Option 2: Python local server
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

### Option 3: npx serve
```bash
npx serve .
```

## Controls

| Key | Action |
|-----|--------|
| **W / Arrow Up** | Move up |
| **A / Arrow Left** | Move left |
| **S / Arrow Down** | Move down |
| **D / Arrow Right** | Move right |
| **E** | Pick up item (weapons, scrolls) |
| **Space** or **.** | Wait (skip your turn — enemies still act) |
| **Enter** or **>** | Descend stairs |
| **Escape** | Pause menu |
| **R** | Restart (from game over / victory screen) |

## How to Play

### Core Gameplay

**Movement & Turn System**: Every time you move or act, all enemies get a turn too. It feels real-time but is actually turn-based — nothing happens until you press a key.

**Attacking**: Walk *into* an enemy to attack (bump attack). There's no separate attack key. You have an 85% hit chance, and damage depends on your equipped weapon + strength stat.

**Fog of War**: You can only see tiles within 8 tiles line-of-sight. Explored areas stay dimmed on the map. Unexplored areas are pitch black.

**Stairs**: Each floor has stairs down (yellow lines on the ground). Stand on them and press **Enter** or **>** to descend. Your goal is to reach and clear Floor 5.

### Items

- **Health Potions** (red + symbol): Auto-picked up when you walk over them. Restores 15 HP.
- **Weapons** (blue sword symbol): Press **E** while standing on them to equip. Four tiers:
  - *Dagger* (1-4 dmg) — available from Floor 1
  - *Shortsword* (2-6 dmg) — available from Floor 1
  - *Longsword* (3-8 dmg) — appears from Floor 2+
  - *Battle Axe* (5-12 dmg) — appears from Floor 3+
- **Scroll of Blinding** (purple rectangle): Press **E** to use. Blinds the nearest visible enemy for 5 seconds, reducing their detection range to 1 tile.

### Enemies

| Type | Color | HP | Speed | Behavior |
|------|-------|----|-------|----------|
| **Skeleton** | Beige | 30 | Slow (acts every 2 turns) | Chases and fights to the death |
| **Goblin** | Green | 12 | Fast (acts every turn) | Flees when below 25% HP |
| **Troll** | Brown | 60 | Very slow (acts every 3 turns) | Heavy damage, appears Floor 3+ |

Enemies have a colored dot above them showing their AI state: gray = idle/patrol, red = chasing you, yellow = fleeing.

### Leveling Up

You earn XP from kills. XP thresholds: 10, 25, 45, 70, 100, 140 for levels 2-7. Each level-up gives **+5 max HP**, **+1 strength**, and a **full heal**.

### Floor Progression

| Floor | Enemies | Notes |
|-------|---------|-------|
| 1 | 5-8 skeletons & goblins | High item density |
| 2 | 8-12 skeletons & goblins | Longswords start appearing |
| 3 | 10-15 + trolls | Battle Axes start appearing |
| 4 | 12-18 + more trolls | Low item density |
| 5 | 15-20 + **The Ancient One** (120 HP boss troll) | Beat the boss, descend to win |

### HUD

- **Bottom bar**: HP bar (red), XP bar (yellow), current floor, equipped weapon, strength, kill count
- **Top-left**: Combat message log (fades after 3 seconds)
- **Top-right**: Minimap (white dot = you, red dots = visible enemies, yellow = stairs)

### Tips

- Don't rush into rooms full of enemies — lure them into corridors for 1v1 fights
- Pick up every Health Potion you can find, items get scarcer on deeper floors
- Goblins are fast but fragile — kill them quickly before they swarm you
- Wait (Space) strategically to let enemies come to you
- Use Scrolls of Blinding on Trolls — they hit extremely hard

## Tech Stack

- **Runtime**: Vanilla JS, ES6 modules
- **Rendering**: HTML5 Canvas 2D API
- **Storage**: localStorage for high scores
- **Deployment**: Static files only — deployable to GitHub Pages or Netlify

## Architecture

- `src/dungeon.js` — BSP tree dungeon generation with seeded RNG (Mulberry32)
- `src/renderer.js` — Two-layer Canvas 2D rendering with smooth camera lerp
- `src/fov.js` — Recursive shadowcasting field-of-view
- `src/entities.js` — Player, Enemy, Item classes with floor-based spawning
- `src/ai.js` — A* pathfinding (min-heap priority queue) + 5-state enemy FSM
- `src/combat.js` — Hit resolution, damage, loot drops, leveling
- `src/ui.js` — HUD, message log, menus (all drawn on canvas)
- `src/main.js` — Game loop, state machine, input handling
- `src/constants.js` — All configuration, tile types, colors, enemy stats
