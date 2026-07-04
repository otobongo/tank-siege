# Tank Siege

Tank Siege is an original retro tank combat game for the browser: defend your
base, breach brick walls shot by shot, and survive 35 stages of escalating
enemy waves, solo or in two-player couch co-op. Built with vanilla JavaScript,
HTML5 Canvas, and the Web Audio API. No frameworks, no runtime dependencies,
and every sprite, sound, and stage is original work generated in code.

## Features

- 35 hand-authored stages with a difficulty curve, signature-shape boards,
  and infinite looping after stage 35 (looped stages keep their layouts but
  use the final stage's enemy roster and pacing)
- Four enemy types (basic, fast, power, heavy) with distinct AI personalities,
  including A* pathfinding heavies that will reach your base if ignored
- Seven power-ups: Star, Grenade, Helmet, Shovel, Stopwatch, Tank, and the
  rare Pistol
- Four-tier upgrade ladder: faster bullets, twin bullets, steel-breaking shots
- Two-player co-op with friendly-fire freeze, per-player scoring, a stage
  kill-leader bonus, and emergency life transfer
- Full keyboard and gamepad support with hot-plug, any 2P combination
- Synthesized retro soundscape (WebAudio, zero audio files) and a juice
  package: particles, screen shake, hit-stop, gamepad rumble, optional CRT
  filter; respects prefers-reduced-motion

## Run

```sh
npm install
npm run dev     # dev server
npm test        # unit tests (Vitest)
npm run build   # static bundle in dist/ (opens from file://, fully offline)
npm run lint
```

## Controls

| Action | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move | Arrow keys | WASD | D-pad or left stick |
| Fire | Space | F | Button 0 (A / Cross) |
| Pause | Escape or Enter | same | Start |
| Mute | M | same | - |
| CRT filter | C | same | - |

The first connected pad takes the first free player slot; the keyboard always
remains available for the other player. See [docs/CONTROLS.md](docs/CONTROLS.md).

## Architecture map

```
src/core      config (all tunables), fixed-step loop, state machine + session
src/input     virtual actions + edge detection; keyboard and gamepad backends
src/engine    grid (three-resolution terrain, quarter-cell brick damage),
              collision (flush movement, lane snap, ice, swept bullets),
              bullets (resolution order, event bus)
src/entities  tank base, player (tiers), enemy (4 types), base (eagle), powerup
src/ai        seeded RNG, per-type controllers, heavy A*, decoy roles
src/systems   spawner (20-slot queue), powerups (drops/effects/timers),
              coop (friendly fire, life transfer), flow (stage lifecycle,
              progression, tally)
src/audio     WebAudio synth voices, engine hum, base alarm, title jingle
src/render    procedural sprite atlas, renderer (cached terrain + dirty
              tiles), HUD, particles/juice, CRT filter
src/screens   title, stage intro, tally, game over, pause
src/stages    format validator + 35 stage data files
```

Systems communicate through a small event bus (`brickHit`, `tankHit`,
`tankDestroyed`, `baseHit`, ...). Audio and particles are pure subscribers.
Interface changes between issue-owned modules are logged in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Adding a stage

1. Copy `src/stages/stage35.js` to `stage36.js`, change `id`, and edit the
   13x13 `layout` (alphabet: `.` empty, `B` brick, `S` steel, `W` water,
   `I` ice, `T` trees). Keep row 0 columns 0/6/12 clear (enemy spawns) and
   row 12 columns 4-8 clear (base area, engine-injected).
2. Set `enemies` to exactly 20 of `b/f/m/h` (order = spawn order; the 4th,
   11th, and 18th become bonus tanks) and a `spawnInterval` in [0.8, 3.0].
3. Register it in `src/stages/index.js` and run `npm test`: the validator
   checks every rule, including base reachability from all three spawns.

One-line design notes for every stage live in [docs/STAGES.md](docs/STAGES.md).

## Scope notes

Browser storage (saved progress, high scores, persisted settings) is out of
scope for v1, as are survival/versus modes, touch controls, and anything
online. Stage-select memory lasts for the browser session only.
