# Outpost Zero source

The root `index.html` stays as the public entry point. It loads these classic
scripts in dependency order so the game works both on GitHub Pages/Vercel and
when `index.html` is opened directly with `file://`.

## Components

- `styles.css` — page, modal, and canvas-shell styling
- `js/networking.js` — Supabase auth, realtime, reports, and leaderboards
- `js/core.js` — canvas sizing and shared geometry helpers
- `js/audio.js` — music and sound effects
- `js/weapons.js` / `js/abilities.js` — weapon data and melee abilities
- `js/economy-state.js`, `js/progression.js`, `js/persistence.js` — tasks, rewards, shop, and profile saves
- `js/ui.js`, `js/rendering.js`, `js/admin-ui.js` — menus and drawing
- `js/world.js`, `js/enemies.js`, `js/state.js`, `js/upgrades.js` — simulation data
- `js/gameplay.js`, `js/combat.js`, `js/ai.js` — game flow, combat, and CPU logic
- `js/online.js`, `js/party-state.js`, `js/party.js`, `js/social.js` — online and social systems
- `js/input.js` — keyboard, mouse, and touch routing
- `js/loop.js` — fixed-step simulation and rendering loop
- `js/bootstrap.js` — final initialization after every component is loaded
- `sql/` — small, numbered Supabase setup files with their paste/run order documented inside

Keep the script order in the root page unless a component's dependencies are
also updated. Do not convert these files to modules without replacing direct
`file://` support.
