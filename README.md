# Dungeon Crawler

A browser-playable vanilla-JavaScript roguelike built on HTML5 Canvas 2D. The game mixes seeded procedural generation, real-time enemy cooldowns, tactical positioning, room archetypes, sanctuary interactions, ranged pressure, hazard-aware AI, and run-based build choices without any external dependencies.

## Highlights

- Seeded BSP dungeon generation with repeatable runs and a daily seed mode
- Real-time-with-cooldowns combat loop instead of strict turn passing
- 8-direction movement, fog of war, minimap, hover tooltips, and local high scores
- Distinct room archetypes: vaults, guard posts, sanctuaries, entry halls, and sealed stairwells
- Sanctuary systems: healing fountains, oath shrines, and Quartermaster merchants
- Hazard-aware combat where lava, ice, and spike traps affect both the player and enemies
- Build-defining loot: reach weapons, armor tradeoffs, warding, speed elixirs, cursed gear, and gold economy
- Accessibility and polish features including colorblind mode, procedural audio, and pause-menu audio controls

## Running Locally

This project is a static ES module app, so it needs an HTTP server.

### Option 1: VS Code Live Server

1. Install the **Live Server** extension
2. Right-click `index.html`
3. Choose **Open with Live Server**

### Option 2: Python

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Option 3: `npx serve`

```bash
npx serve .
```

## Controls

| Key | Action |
|-----|--------|
| `W A S D` or arrow keys | Move |
| `Q E Z C` | Diagonal movement |
| `F` | Interact, equip, drink, read, or open sanctuary choices |
| `Space` or `.` | Wait |
| `Enter` or `>` | Descend stairs |
| `M` | Toggle enlarged minimap |
| `B` | Toggle colorblind mode |
| `Esc` | Pause / close overlays |
| `R` | Return to menu from game over or victory |
| Main menu `D` | Cycle difficulty |
| Main menu `S` | Enter a custom seed |
| Main menu `T` | Start the daily run |

## How It Plays

### Combat Loop

Movement and combat happen in real time on cooldowns. Enemies keep acting if you stall, so corridors, timing, and sight lines matter. Walking into an enemy performs a melee attack automatically. Some weapons alter cadence and range: rapiers and daggers are accurate, spears can attack from two tiles away down open lanes, and heavier weapons hit harder but slow movement.

### Room Identity

Rooms are intentionally specialized:

- **Dusty Chambers** are balanced baseline spaces
- **Vaults** lean toward richer loot with lighter resistance
- **Guard Posts** create stronger ranged pressure and tougher defense
- **Sanctuaries** remove enemy pressure and offer a one-time high-impact feature
- **Sealed Stairwells** are progression checkpoints gated by floor keys

Each new room type is called out with a banner and reinforced with distinct floor accents on the map and minimap.

### Sanctuaries

Sanctuaries are safe rooms with meaningful run-shaping choices:

- **Silver Fountain**: restore health and gain ward charges
- **Oath Shrine**: accept a permanent blessing with a permanent drawback
- **Quartermaster**: spend gold on gear or persistent run upgrades

Quartermasters are meant to create build decisions, not just emergency healing. Gold comes from enemy kills and gold caches.

### Hazards

Hazards affect everyone:

- **Lava** burns most units but empowers lava-affine enemies
- **Ice** extends movement and lets some enemies slide farther
- **Spike traps** punish careless routing and can finish weakened targets

Enemy pathing now accounts for hazard preferences, so archers try to use hazard buffers, fragile enemies avoid danger more aggressively, and juggernauts may ignore it.

### Items and Progression

Items are organized around clearer tactical roles:

- **Health Potions** for sustain
- **Warding Elixirs** for temporary damage mitigation
- **Quickstep Elixirs** for floor-long mobility
- **Weapons** with stronger identities, including reach and armor-piercing options
- **Armor** with defense and movement tradeoffs
- **Scrolls of Blinding** for control
- **Gold caches** that feed the merchant economy
- **Floor Keys** that unlock sealed stairs

Difficulty now changes both enemy scaling and overall item density.

### Enemies

- **Skeletons** are steady anchor enemies with modest defense
- **Goblins** are fast skirmishers that flee when fights sour
- **Archers** play for ranged lanes and spacing
- **Trolls** are slow juggernauts that hit hard and thrive in lava
- **Elite enemies** add tension to important rooms
- **The Ancient One** phases through the boss fight and eventually starts leaving lava behind

## Progression and Difficulty

- Floors 1-5 increase enemy counts, room pressure, and scarcity
- Later floors require more keys to open the stairs
- Difficulty presets adjust enemy HP, damage, XP, and item density
- Runs can be random, custom-seeded, or daily-seeded

## UI and Accessibility

- Hover an enemy or item for extra information
- Use the minimap for navigation and the enlarged map for macro routing
- Colorblind mode adds letter indicators to enemies, items, and interactables
- Audio is generated procedurally in real time and can be toggled from the pause menu

## Project Structure

- `src/main.js` orchestrates the game loop, state flow, input handling, interaction flow, and persistence
- `src/dungeon.js` generates BSP layouts, doors, hazards, stairs, and floor spawn points
- `src/rooms.js` assigns room archetypes and room-level spawn/hazard plans
- `src/interactables.js` defines sanctuary features and their menu-driven outcomes
- `src/entities.js` defines player, enemy, boss, and item data plus spawn logic
- `src/ai.js` handles pathfinding, ranged positioning, fleeing, and hazard-aware movement
- `src/hazards.js` centralizes hazard cost and hazard effect logic for enemies
- `src/combat.js` resolves attacks, loot, leveling, pickups, and defensive systems
- `src/renderer.js` draws the world, room accents, minimaps, interactables, particles, and effects
- `src/fov.js` computes visibility and exploration
- `src/ui.js` draws HUD, menus, overlays, room banners, and interaction panels
- `src/audio.js` produces procedural sound effects and mute control
- `src/constants.js` contains game balance data, colors, equipment tables, and state constants

## Tech

- Vanilla JavaScript with ES modules
- HTML5 Canvas 2D rendering
- `localStorage` for high-score and run stat persistence
- Static-file deployment friendly
