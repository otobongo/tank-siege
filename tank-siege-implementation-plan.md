# Tank Siege — Implementation Plan for Claude Code

> **Working title:** Tank Siege (rename freely; must NOT ship as "Battle City" — this is an original homage. No Namco sprites, names, or assets may be reproduced. All art is procedurally drawn original pixel work.)
>
> **Audience of this document:** AI implementer (Claude Code). Issues are written to be executed one at a time, in dependency order, each with tasks, expected outcome, and test cases.
>
> **Repo:** new repository under `nuckecy` (suggested: `nuckecy/tank-siege`)
>
> **Stack:** Vanilla JavaScript (ES modules), HTML5 Canvas, Web Audio API, Gamepad API. Vite for dev server and build. Vitest for unit tests. No frameworks, no runtime dependencies.

---

## 1. Model dispatch strategy

Every issue carries a `MODEL:` label. Dispatch each issue to the labeled model in Claude Code.

| Model | Role | Issue types |
|---|---|---|
| **Fable 5** | Architecture-critical work where early mistakes poison everything downstream | Game loop, grid/terrain system, collision, bullet + brick destruction, input abstraction, player tank feel |
| **Opus 4.8** | Complex but bounded systems built on a fixed architecture | Enemy AI, spawn queue, power-ups, game state manager, audio synth, 2P co-op, base entity |
| **Sonnet 4.6** | High-volume, low-ambiguity work with fully specified formats | Scaffold, config, sprites, HUD, screens, particles, 35 stage data files, CRT filter, docs, QA |

**Dispatch rules:**

1. Execute issues in numeric order unless the dependency graph (section 6) allows parallel work.
2. Each issue must end with all its test cases passing before the next issue starts.
3. Fable 5 issues define public interfaces. Later issues must consume those interfaces as-is. If an interface change is genuinely required, the implementing model must document the change in `docs/DECISIONS.md` with a one-paragraph justification.
4. Do not refactor code owned by earlier issues while executing a later issue, except through the mechanism in rule 3.

---

## 2. Mechanics reference (ground truth — do not deviate)

This section encodes researched behavior of the 1985 original. It is the canonical spec. Implementers must not re-research or guess.

### Field and grid
- Playfield is 13×13 **blocks**. Author stages at this resolution.
- Movement/collision grid: 26×26 **half-cells** (tanks are 2×2 half-cells, i.e. one block). Tanks snap to 8px lanes when turning (half-cell alignment).
- Brick damage grid: 52×52 **quarter-cells**. A bullet strip removes a 2-quarter-deep × 4-quarter-wide swath perpendicular to travel. It takes 4 shots to fully breach a standard one-block brick wall from one side.
- Canvas: 416×416 playfield (16px per half-cell) + 128px sidebar = 544×416 logical resolution, integer-scaled to fit the window.

### Terrain types
| Char | Terrain | Tank passes | Bullet passes | Destructible |
|---|---|---|---|---|
| `.` | Empty | Yes | Yes | — |
| `B` | Brick | No | No (destroys quarters) | Yes, per quarter-cell |
| `S` | Steel | No | No | Only by tier-4 player bullets |
| `W` | Water | No | Yes | No |
| `I` | Ice | Yes (slides: momentum continues ~half a block after input release) | Yes | No |
| `T` | Trees | Yes (tank hidden, drawn under canopy) | Yes | No |

- The base (eagle) and its brick shield ring are injected by the engine at the bottom-center of every stage; stage files never encode them.
- Bullets travel over water and under trees. Field edges are indestructible walls.

### Win/lose
- 20 enemies per stage. Stage clears when all 20 are destroyed and none remain on field.
- Base destroyed by ANY bullet (including the player's own) → immediate game over regardless of lives.
- All player lives lost → game over.

### Enemy types
| Type | Key | HP | Move speed | Bullet speed | Points |
|---|---|---|---|---|---|
| Basic | `b` | 1 | slow | slow | 100 |
| Fast | `f` | 1 | fastest | normal | 200 |
| Power | `m` | 1 | normal | fast | 300 |
| Heavy | `h` | 4 | slow | normal | 400 |

- Heavy tanks flash/tint per remaining HP (visual hit feedback mandatory).
- Max simultaneous enemies on field: **4** (1P) / **6** (2P).
- Spawn interval: ~3.0s at stage 1, scaling down to <1.0s at stage 35 (see stage data spec for the per-stage value).
- Spawn points: three fixed positions at the top of the field (left corner, center, right corner), cycled in order. A spawn is deferred while its point is blocked.

### Bonus (flashing) tanks and power-ups
- The **4th, 11th, and 18th** tank in each stage's spawn queue is a bonus tank (flashes red).
- A power-up spawns at one of 16 predefined field locations when a bonus tank is **hit** (not necessarily destroyed — one hit on a flashing heavy triggers the drop and stops the flashing).
- Only ONE power-up may exist on the field; a new drop replaces the old one.
- Power-up pickup: 500 points.

| Power-up | Effect |
|---|---|
| Star | +1 upgrade tier (see below), persists across stages until death |
| Grenade | Destroys all enemies currently on field (no points awarded for them) |
| Helmet | Player invulnerability shield, ~10s |
| Shovel | Base shield ring turns to steel for ~20s, then reverts to (repaired) brick |
| Stopwatch | Freezes all field enemies ~10s |
| Tank | +1 life |
| Pistol (homage, rare) | Instant tier 4. From the unused original sprite; appeared in the Tank 1990 bootleg. Spawn weight ≤ 5% |

### Player upgrade tiers (Star)
1. **Tier 1 (default):** one bullet on field at a time, slow bullet.
2. **Tier 2:** faster bullet.
3. **Tier 3:** two simultaneous bullets.
4. **Tier 4:** bullets destroy steel; brick damage depth doubles (2 shots to breach a wall).

Death resets to tier 1. Tier persists across stage transitions.

### Two-player co-op
- P1 spawns bottom-left of base, P2 bottom-right.
- Friendly fire does NOT destroy the other player; the victim is frozen briefly (can still rotate/shoot).
- Max on-field enemies rises to 6.
- Kill counts tracked per player; the stage's kill leader gets +1000 at the tally screen.

### Scoring and progression
- Extra life at 20,000 points.
- Stage tally screen after each clear: per-type kill counts × points, totals per player.
- After stage 35, stages loop 1→35 again; **all looped stages (36–70) use the stage 35 enemy roster and spawn interval**. After 70, loop again, same rule. Score and player tier carry through loops.

### Misc rules
- Player spawn/respawn grants a brief invulnerability shimmer (~3s).
- Bullets from opposing sides cancel each other on collision.
- A tank can have this many bullets in flight: 1 (tiers 1–2), 2 (tiers 3–4). Enemies: 1.
- Pause available at any time during play (keyboard `Escape`/`Enter`, gamepad `Start`).

---

## 3. Project structure

```
tank-siege/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── docs/
│   ├── DECISIONS.md          # interface-change log (see dispatch rule 3)
│   └── CONTROLS.md
├── src/
│   ├── main.js               # bootstrap: canvas, loop, state machine
│   ├── core/
│   │   ├── config.js         # ALL tunable constants (single source of truth)
│   │   ├── loop.js           # fixed-step update / rAF render
│   │   └── state.js          # game state machine + session data
│   ├── input/
│   │   ├── actions.js        # virtual action definitions + per-player action state
│   │   ├── keyboard.js
│   │   └── gamepad.js
│   ├── engine/
│   │   ├── grid.js           # terrain: parse, expand, quarter-cell damage
│   │   ├── collision.js      # AABB vs grid, entity vs entity, lane snapping
│   │   └── bullets.js
│   ├── entities/
│   │   ├── tank.js           # shared tank base
│   │   ├── player.js
│   │   ├── enemy.js
│   │   ├── base.js           # eagle + shield ring
│   │   └── powerup.js
│   ├── ai/
│   │   └── ai.js             # per-type controllers + heavy-tank pathfinding
│   ├── systems/
│   │   ├── spawner.js        # 20-slot queue, bonus flags, spawn points
│   │   ├── powerups.js       # drop logic, effects, timers
│   │   └── coop.js           # P2, friendly fire, kill attribution
│   ├── audio/
│   │   └── audio.js          # WebAudio synth SFX + mixer
│   ├── render/
│   │   ├── renderer.js       # draw order orchestration
│   │   ├── sprites.js        # procedural pixel-art (offscreen canvas atlas)
│   │   ├── particles.js      # explosions, debris, muzzle flash, screen shake
│   │   ├── hud.js            # sidebar
│   │   └── crt.js            # optional filter
│   ├── screens/
│   │   ├── title.js
│   │   ├── stageIntro.js     # curtain + "STAGE N"
│   │   ├── tally.js          # score tally
│   │   ├── gameover.js
│   │   └── pause.js
│   └── stages/
│       ├── format.js         # stage schema + validator
│       ├── index.js          # ordered export of all 35
│       └── stage01.js … stage35.js
└── tests/
    ├── grid.test.js
    ├── collision.test.js
    ├── spawner.test.js
    ├── stages.test.js
    └── state.test.js
```

**Testing philosophy:** pure logic (grid, collision math, spawn queue, scoring, stage validation) gets Vitest unit tests. Feel and rendering get manual test checklists inside each issue. Do not attempt DOM/canvas snapshot testing.

---

## 4. Stage data specification

Every stage file exports one frozen object:

```js
// src/stages/stage01.js
export default {
  id: 1,
  layout: [
    ".B.B.B.B.B.B.",   // 13 strings × 13 chars, top row first
    /* …13 rows total… */
  ],
  // Exactly 20 entries. Order IS the spawn order.
  // Indices 3, 10, 17 (0-based) are auto-flagged as bonus tanks by the spawner.
  enemies: "bbbbbbbbbbbbbbbbbbff".split(""),
  spawnInterval: 3.0,   // seconds between spawn attempts
};
```

**Validation rules (enforced by `format.js`, tested in `stages.test.js`):**
1. `layout` is exactly 13 rows × 13 chars, alphabet `{. B S W I T}`.
2. Rows 0 must have `.` at columns 0, 6, 12 (spawn points clear).
3. Row 12 columns 4–8 must be `.` (base + player spawns are engine-injected).
4. `enemies.length === 20`, alphabet `{b f m h}`.
5. `spawnInterval` in `[0.8, 3.0]`.
6. Reachability: flood-fill from each spawn point through non-`S`/non-`W` terrain must reach the base shield ring (bricks count as passable for this check since they are destructible).

**Enemy roster curve (anchor data from the original, interpolate the rest):**

| Stage | b | f | m | h |
|---|---|---|---|---|
| 1 | 18 | 2 | 0 | 0 |
| 2 | 14 | 4 | 0 | 2 |
| 3 | 14 | 4 | 0 | 2 |
| 34 | 0 | 10 | 4 | 6 |
| 35 | 0 | 6 | 4 | 10 |

Interpolation rules for stages 4–33: totals always 20; `b` declines monotonically to 0 by ~stage 30; `h` rises steadily; `m` appears from ~stage 5 and peaks mid-to-late (4–8); `f` fluctuates 4–10. Every stage must be ≥ as hard as stage−2 (allow small local dips for rhythm). `spawnInterval` interpolates linearly 3.0 → 0.8 across stages 1→35.

**Layout design curve (original layouts must NOT be copied — design fresh ones honoring this curve):**
- Stages 1–5: brick-dominant, open corridors, no water/ice.
- Stages 6–12: introduce water and trees; first steel accents.
- Stages 13–20: ice fields appear; mixed mazes; tighter base approaches.
- Stages 21–28: steel-heavy fortresses; water moats with limited crossings.
- Stages 29–35: hostile layouts — multiple open lanes to the base, minimal cover, heavy steel. Stage 35 gets a large brick mass + a river with few crossings (spiritual nod to the original finale).
- At least 6 stages should feature a "signature shape" (letters, symbols, patterns) since those were the original's most memorable boards. Use original words/shapes (e.g. spell "SIEGE"), never "BATTLE CITY".

---

## 5. Issues

### Phase 0 — Foundation

---

**TS-001 · Project scaffold** — `MODEL: Sonnet 4.6`
*Depends on: nothing*

Tasks:
1. Init Vite vanilla-JS project with the exact structure from section 3 (empty module stubs with JSDoc headers are fine).
2. `index.html`: single `<canvas>`, black page background, canvas centered and integer-scaled to viewport (CSS + resize handler), `image-rendering: pixelated`.
3. Configure Vitest. Add `npm run dev / build / test / lint` scripts. ESLint flat config, no style zealotry.
4. Create `docs/DECISIONS.md` with the interface-change log template.
5. `README.md`: one-paragraph description, run instructions.

Expected outcome: `npm run dev` serves a centered black 544×416 canvas that scales with the window at integer multiples. `npm test` runs (0 tests) green.

Test cases:
- [ ] Fresh clone → `npm i && npm run dev` works with no errors.
- [ ] Window resize keeps canvas integer-scaled and centered, no blur.
- [ ] `npm run build` produces a static bundle that opens via `file://` (Vite `base: './'`).

---

**TS-002 · Config module** — `MODEL: Sonnet 4.6`
*Depends on: TS-001*

Tasks:
1. `src/core/config.js` exporting a single frozen `CONFIG` object containing EVERY tunable in section 2: grid dims, pixel sizes, tank speeds per type, bullet speeds per tier, all timer durations, spawn rules, scoring table, palette, canvas dims, input maps' defaults.
2. Palette: NES-adjacent but original — define named colors (playerYellow, enemySilver, brickRust, steelGray, waterBlue, iceWhite, treeGreen, uiGray, alertRed). No color literals allowed anywhere else in the codebase.

Expected outcome: one authoritative constants module; changing a speed or duration requires touching exactly one file.

Test cases:
- [ ] `CONFIG` is `Object.freeze`d (deep).
- [ ] Grep shows no magic numbers for speeds/timers/scores outside config (spot check acceptable).

---

### Phase 1 — Core engine (architecture-critical)

---

**TS-003 · Fixed-step loop + state machine** — `MODEL: Fable 5`
*Depends on: TS-002*

Tasks:
1. `loop.js`: fixed-step simulation at 60 updates/s with accumulator, rAF-driven rendering, interpolation-free (retro feel wants stepped motion), spiral-of-death guard (clamp accumulated time), pause/resume of the accumulator on tab blur.
2. `state.js`: finite state machine with states `TITLE, STAGE_INTRO, PLAYING, PAUSED, TALLY, GAME_OVER`. Each state gets `enter/update/render/exit` hooks. Session object (score per player, lives, tier, stage number, loop count) lives here.
3. Wire into `main.js`; render a debug state label until screens exist.

Expected outcome: deterministic 60Hz simulation independent of display refresh; clean state transitions with hooks.

Test cases:
- [ ] Unit: accumulator produces exactly 60 updates for 1.0s of injected time, 90 for 1.5s.
- [ ] Unit: transition `PLAYING → PAUSED → PLAYING` fires exit/enter hooks exactly once each, update not called while paused.
- [ ] Manual: throttle to a 30Hz display (devtools) — simulation speed unchanged.

---

**TS-004 · Grid & terrain system** — `MODEL: Fable 5`
*Depends on: TS-003*

Tasks:
1. `grid.js`: parse a 13×13 stage layout into the three-resolution model — 26×26 movement grid and 52×52 quarter-cell brick damage bitmask. Steel/water/ice/trees live at 26×26.
2. Inject base (eagle, 2×2 half-cells at bottom-center) + brick shield ring; expose `fortifyBase(steel:boolean)` and `repairBaseRing()` for the Shovel.
3. Damage API: `applyBulletDamage(x, y, dir, depth)` removes the correct 4-wide × depth-deep quarter swath; returns what was hit (`brick|steel|edge|base|none`). Tier-4 depth = 2× and steel-destroys.
4. Query API for collision: `isSolidForTank(rect)`, `isSolidForBullet(point)`, `isIce(rect)`, `isTree(rect)`.
5. Renderer contract: expose iterable of dirty tiles so rendering can cache the terrain layer and only repaint damaged cells.

Expected outcome: complete terrain model where four same-direction shots breach a one-block brick wall, and all terrain queries needed by collision/AI exist.

Test cases:
- [ ] Unit: parse a fixture stage; expanded grids have expected dimensions and content.
- [ ] Unit: 4 bullet hits at the same column fully breach one block; 3 do not.
- [ ] Unit: tier-4 damage breaches in 2 hits and destroys steel.
- [ ] Unit: `fortifyBase(true)` then `repairBaseRing()` restores pristine brick ring.
- [ ] Unit: base hit via `applyBulletDamage` returns `base`.

---

**TS-005 · Collision system** — `MODEL: Fable 5`
*Depends on: TS-004*

Tasks:
1. AABB helpers; tank-vs-terrain resolution (blocking, sliding not allowed — movement is axis-locked).
2. Lane snapping: when a tank turns 90°, snap perpendicular coordinate to the nearest 8px lane if within threshold, so corridors are traversable without pixel-hunting.
3. Ice physics: on ice, retain last movement vector decaying over ~half a block after input release.
4. Entity-vs-entity: tanks block tanks; bullet-vs-tank, bullet-vs-bullet, tank-vs-powerup overlap tests.
5. Swept bullet collision (bullets are fast; test the path, not just the endpoint).

Expected outcome: movement that feels like the original — snappy turns, no corner snagging, honest bullet hits.

Test cases:
- [ ] Unit: tank moving right into a wall stops flush at the wall boundary.
- [ ] Unit: turn near a lane snaps ≤ threshold, doesn't snap beyond it.
- [ ] Unit: swept bullet crossing a 1px-overlap tank registers a hit.
- [ ] Manual: drive through a one-block corridor after turning — no snag.
- [ ] Manual: ice slide overshoot feels ~half a block.

---

**TS-006 · Input abstraction (keyboard + gamepad)** — `MODEL: Fable 5`
*Depends on: TS-003*

Tasks:
1. `actions.js`: virtual actions per player — `up down left right fire pause start`. Consumers read only action state; edge detection (`justPressed`) included.
2. `keyboard.js`: event-driven pressed-map. Defaults: P1 arrows + Space, P2 WASD + F. Prevent default on game keys only.
3. `gamepad.js`: per-frame `navigator.getGamepads()` polling inside the update step; standard mapping (d-pad 12–15, button 0 fire, 9 start); left-stick with 0.3 radial deadzone quantized to 4 directions (larger axis wins); `gamepadconnected/disconnected` handling.
4. Assignment: first pad → first unassigned player slot; keyboard always available as fallback for P1 (or P2 if a pad took P1). Hot-plug mid-game reassigns cleanly. Simple event so UI can show "Controller connected: P1".
5. Direction conflict rule: latest-pressed direction wins (original behavior), not vector sum.

Expected outcome: game code that never touches hardware APIs; two players on any combination of keyboard and up to two pads.

Test cases:
- [ ] Unit: action state with mocked key events — press/hold/release and `justPressed` edges correct.
- [ ] Unit: stick (0.9, 0.2) → right; (0.2, 0.2) inside deadzone → none.
- [ ] Manual: pad hidden until first button press (browser privacy gate) then auto-assigns; unplug mid-game shows P2 as keyboard-fallback without crash.
- [ ] Manual: hold Up then also Right → tank goes Right; release Right → resumes Up.

---

**TS-007 · Tank base + player tank** — `MODEL: Fable 5`
*Depends on: TS-005, TS-006*

Tasks:
1. `tank.js`: shared kinematics (4-dir movement, speed, facing, fire cooldown, bullets-in-flight cap, alive/spawning/frozen states).
2. `player.js`: reads assigned action set; tier system (speeds/caps from config); spawn at fixed position with ~3s invulnerability shimmer; death → respawn if lives remain, tier reset.
3. Spawn animation state (blocks movement briefly) and shield state exposed to renderer.

Expected outcome: a controllable player tank with authentic feel and the full tier ladder functional (given TS-008 bullets).

Test cases:
- [ ] Unit: fire respects in-flight cap per tier (1,1,2,2).
- [ ] Unit: death resets tier to 1 and decrements lives.
- [ ] Manual: movement, turning snap, firing cadence feel stepped/retro, not floaty.

---

**TS-008 · Bullet system + destruction** — `MODEL: Fable 5`
*Depends on: TS-007*

Tasks:
1. `bullets.js`: pooled bullets with owner, tier/enemy class, speed, swept movement.
2. Resolution order per step: bullet-vs-bullet cancel → bullet-vs-tank → bullet-vs-terrain (`applyBulletDamage`) → bullet-vs-base (game over trigger) → edge.
3. Owner bookkeeping frees the in-flight slot on any termination.
4. Emit typed events (`brickHit`, `steelClang`, `tankHit`, `tankDestroyed`, `baseHit`, `bulletCancel`) consumed later by audio/particles — decoupled via a tiny event bus.

Expected outcome: complete combat resolution matching section 2, with an event stream that Phase 3/4 systems subscribe to without touching combat code.

Test cases:
- [ ] Unit: opposing bullets on a collision course cancel; same-owner bullets don't interact.
- [ ] Unit: tier-1 vs steel → `steelClang`, no damage; tier-4 → steel destroyed.
- [ ] Unit: player bullet hitting own base triggers `baseHit` (self-loss is possible, as in the original).
- [ ] Unit: bullet termination frees the owner's in-flight slot.

---

### Phase 2 — Combat cast

---

**TS-009 · Base entity** — `MODEL: Opus 4.8`
*Depends on: TS-008*

Tasks:
1. `base.js`: eagle entity, intact/destroyed states, destruction → explosion event + transition to `GAME_OVER` (bypasses lives).
2. Shovel integration hooks (`fortify/revert/repair` on grid) with its 20s timer owned by the power-up system, not the base.

Expected outcome: the lose condition is live and the base is a first-class entity.

Test cases:
- [ ] Unit: `baseHit` event → state machine enters `GAME_OVER` next tick regardless of lives.
- [ ] Manual: shooting your own base ends the game.

---

**TS-010 · Enemy spawner** — `MODEL: Opus 4.8`
*Depends on: TS-008*

Tasks:
1. `spawner.js`: consume `stage.enemies` as an ordered queue; flag indices 3/10/17 as bonus; three top spawn points cycled in order; defer while blocked; interval from stage data; concurrent cap 4/6 by player count.
2. Spawn telegraph animation state (the classic sparkle) before the tank materializes; tank is invulnerable and non-colliding until materialized.
3. Expose `remaining` count for the HUD and `allDefeated` for stage-clear.

Expected outcome: authentic wave pacing, correct bonus positions, no spawn-point overlap bugs.

Test cases:
- [ ] Unit: exactly tanks #4, #11, #18 (1-based) are bonus-flagged.
- [ ] Unit: cap respected — 5th spawn deferred until a slot frees (1P).
- [ ] Unit: blocked spawn point defers, doesn't skip queue order.
- [ ] Unit: `allDefeated` true only when queue empty AND field empty.

---

**TS-011 · Enemy tank types** — `MODEL: Opus 4.8`
*Depends on: TS-010*

Tasks:
1. `enemy.js`: the four types with stats from config; heavy = 4 HP with per-HP tint stepping and hit-flash; bonus flashing overlay; on-hit rules (bonus drop trigger on first hit, flashing stops).
2. Death → points to killer's score (event carries shooter identity), explosion event.
3. Stopwatch-freeze and spawn-telegraph states honored.

Expected outcome: all four enemy types alive on field with correct durability, scoring, and bonus behavior.

Test cases:
- [ ] Unit: heavy takes exactly 4 hits; each hit emits `tankHit`, 4th emits `tankDestroyed` with 400 points to shooter.
- [ ] Unit: hitting a flashing bonus tank emits `powerupDrop` once and clears the flag (even on a surviving heavy).
- [ ] Unit: frozen enemies don't move or fire but can be destroyed.

---

### Phase 3 — Systems

---

**TS-012 · Enemy AI** — `MODEL: Opus 4.8`
*Depends on: TS-011*

Tasks:
1. `ai.js` per-type controllers on a shared decision-tick (~every 0.5s or on collision/blocked):
   - **Basic:** original-style random walk with downward bias; fires on random cadence and always when player or base is in line-of-fire.
   - **Fast:** biased toward the emptier flank column, then descends; opportunistic firing.
   - **Power:** basic behavior, higher fire rate; prefers lanes with line-of-sight length.
   - **Heavy:** coarse-grid A* (26×26, bricks passable at a cost since it can shoot through) toward the base, re-planned every ~2s or when blocked; fires at bricks obstructing its path.
2. Decoy pressure: when ≥3 enemies on field, ensure at least one is targeting the base while others engage the player (roles reassigned on death).
3. Line-of-fire checks reuse collision raycasts. AI must be deterministic given a seeded RNG (inject RNG; store seed in session) for testability.
4. Freezing (stopwatch) gates the decision tick.

Expected outcome: readable difficulty tiers — basics feel dumb-but-swarmy, heavies feel like a threat that WILL reach your base if ignored.

Test cases:
- [ ] Unit (seeded): heavy on an open field reaches the base ring in bounded steps.
- [ ] Unit (seeded): heavy blocked by brick fires at the brick within one decision tick.
- [ ] Unit: with 3+ enemies, exactly ≥1 holds the base-attacker role.
- [ ] Manual: stage-1 basics feel like the original's aimless swarm, not laser assassins.

---

**TS-013 · Power-up system** — `MODEL: Opus 4.8`
*Depends on: TS-011, TS-009*

Tasks:
1. `powerups.js`: `powerupDrop` → pick from the 16 predefined field locations (skip water/steel-occluded ones); single-item rule; type weights (six classics even, Pistol ≤5%).
2. Effects: Star (+tier), Grenade (field wipe, no points), Helmet (10s shield), Shovel (fortify 20s + revert + repair), Stopwatch (10s freeze), Tank (+1 life), Pistol (tier=4).
3. Timers owned here; expiry events for audio/visual warnings; pickup = 500 points + event.
4. In co-op, effects apply to the collecting player (Grenade/Stopwatch/Shovel are global).

Expected outcome: all seven power-ups functional with original semantics.

Test cases:
- [ ] Unit: second drop despawns the first (never two on field).
- [ ] Unit: Shovel fortifies, reverts at t=20s, ring repaired to pristine brick.
- [ ] Unit: Grenade clears field, awards 0 kill points, doesn't touch the unspawned queue.
- [ ] Unit: Star at tier 4 stays tier 4; pickup still scores 500.

---

**TS-014 · Game state manager (session flow)** — `MODEL: Opus 4.8`
*Depends on: TS-010, TS-013*

Tasks:
1. Stage lifecycle: `STAGE_INTRO` (curtain + stage number) → `PLAYING` → clear → short hold → `TALLY` → next stage. Wire `GAME_OVER` (slide-up text, then title after input).
2. Progression: lives (start 3; +1 at 20,000 pts once per threshold), tier persistence, stage counter, loop logic — stage index wraps after 35 and every looped stage substitutes stage 35's `enemies` + `spawnInterval` while keeping its own layout.
3. Tally data: per-player per-type kill counts, totals, kill-leader +1000 in co-op.
4. Start options plumbing: 1P/2P selection and stage-select (title screen consumes this later).

Expected outcome: a full campaign is playable start to loop-2 with correct carry-over rules.

Test cases:
- [ ] Unit: stage 36 uses layout 1 + roster/interval of 35; stage 71 likewise.
- [ ] Unit: crossing 20,000 grants exactly one life; not again at 20,100.
- [ ] Unit: tier persists across `TALLY→STAGE_INTRO`, resets on death mid-stage.
- [ ] Unit: tally math matches emitted kill events (seeded sim fixture).

---

**TS-015 · Audio engine** — `MODEL: Opus 4.8`
*Depends on: TS-008 (event bus)*

Tasks:
1. `audio.js`: WebAudio synth SFX, no audio files. Voices: fire (short square blip), brick crunch (noise burst), steel clang (metallic ping via short FM), tank explosion (filtered noise + pitch drop), base explosion (longer, layered), power-up spawn arpeggio, pickup chime, spawn sparkle, pause blip, tally tick.
2. Engine hum: two-oscillator loop, idle vs moving pitch (player tank only — the original's signature).
3. Base alarm loop while the shield ring is breached (any ring cell destroyed) — modern addition, subtle.
4. Mixer: master gain, mute toggle (`M`), everything gated behind first user gesture (autoplay policy). Subscribe to the event bus; zero coupling into game logic.
5. Title jingle: short original composition (~4s). Do NOT reproduce the Namco theme.

Expected outcome: complete retro soundscape, all synthesized, driven purely by events.

Test cases:
- [ ] Manual: every event type audibly distinct; nothing plays before first input.
- [ ] Manual: hum pitch tracks movement start/stop; mute kills everything instantly.
- [ ] Unit: audio module subscribes without throwing in a headless env (guards on `AudioContext`).

---

**TS-016 · Two-player co-op** — `MODEL: Opus 4.8`
*Depends on: TS-014*

Tasks:
1. `coop.js`: P2 lifecycle (spawn point, own lives pool, own tier, own score), enemy cap → 6, friendly-fire freeze (victim frozen ~1.5s, can still shoot), kill attribution already event-borne.
2. Life transfer: if one player is at 0 lives and the other has ≥2, pressing fire on the dead player's controls borrows a life (original's emergency-transfer spirit).
3. HUD contract: expose both players' data.

Expected outcome: full couch co-op on keyboard+pad or pad+pad.

Test cases:
- [ ] Unit: P1 bullet hits P2 → P2 frozen, not destroyed, no points.
- [ ] Unit: cap is 6 with two players, drops to 4 if P2 is out of the session.
- [ ] Unit: life transfer decrements donor, revives recipient, refuses when donor has 1.
- [ ] Manual: pad+keyboard simultaneous play has no input crosstalk.

---

### Phase 4 — Content & polish

---

**TS-017 · Procedural sprite atlas** — `MODEL: Sonnet 4.6`
*Depends on: TS-007 (states to draw exist)*

Tasks:
1. `sprites.js`: draw all pixel art programmatically into an offscreen atlas at boot (16×16 logical, drawn at 1px = 1 canvas px, scaled by the renderer). Original designs throughout.
2. Set: player tank (2 tread frames × 4 dirs × 4 tiers with visual progression), enemy tanks (4 types × 4 dirs × 2 tread frames; heavy shows damage tinting), terrain tiles (brick with quarter-cell rendering, steel, water 2-frame shimmer, ice, tree canopy), eagle (intact/destroyed), 7 power-up icons, spawn sparkle frames, shield shimmer frames, flag, HUD icons.
3. Bonus flash = red tint overlay, stopwatch-frozen = blue tint overlay (tint via composite, not duplicate art).

Expected outcome: complete original art set, readable at a glance, evocative of the era without copying Namco pixels.

Test cases:
- [ ] Manual review sheet: render the full atlas to screen behind a debug flag; every state distinguishable.
- [ ] Unit: atlas exposes lookup for every (entity, dir, frame, tier) the entities can request; no missing-sprite fallbacks fire in a scripted sim.

---

**TS-018 · Renderer + HUD** — `MODEL: Sonnet 4.6`
*Depends on: TS-017*

Tasks:
1. `renderer.js` draw order: terrain (cached layer + dirty-tile repaint) → base → powerup (blinking) → tanks/bullets → tree canopy → particles → HUD.
2. `hud.js` sidebar: remaining-enemy icon grid (depletes as tanks SPAWN, like the original), per-player lives with P1/P2 tags, stage flag + number, loop indicator (small ×2 after first loop).
3. Tree occlusion: tanks under canopy are hidden (canopy drawn over).

Expected outcome: authentic presentation at stable frame rate.

Test cases:
- [ ] Manual: enemy icons decrement on spawn, not on death.
- [ ] Manual: tank driving under trees disappears; bullets remain visible.
- [ ] Manual: devtools performance — steady 60fps with 6 tanks + particles on a mid laptop.

---

**TS-019 · Screens** — `MODEL: Sonnet 4.6`
*Depends on: TS-014, TS-018*

Tasks:
1. Title: logo treatment (original name), 1P/2P/stage-select menu (stage select unlocked after reaching a stage; hold input to scroll), controller-connected toasts, "press any button" gamepad hint.
2. Stage intro: gray curtain closes/opens with "STAGE N".
3. Tally: per-type counts ticking up with SFX, totals, co-op kill-leader bonus reveal.
4. Game over: red text slide, then title. Pause overlay: dim + blinking PAUSE.

Expected outcome: complete presentation loop from boot to game over and back.

Test cases:
- [ ] Manual: full flow title→stage 2 without touching the keyboard (gamepad only), and again keyboard-only.
- [ ] Manual: stage select caps at highest reached stage; persists for the browser session.
- [ ] Unit: tally screen math re-verified against session data fixture.

---

**TS-020 · Particles & juice** — `MODEL: Sonnet 4.6`
*Depends on: TS-018*

Tasks:
1. `particles.js`: small/large explosions (expanding ring frames), brick debris chips flying perpendicular to the destroying bullet, muzzle flash, steel spark, base mega-explosion.
2. Screen shake: tiny on tank explosion, medium on base hit, respects a `reducedMotion` setting default-off... default ON respecting `prefers-reduced-motion`.
3. Gamepad rumble via `vibrationActuator` where available: light on your bullet connecting, strong on player death and base hit. Guard everything (Chromium-only).
4. Hit-stop: 2-frame freeze on heavy-tank final hit and player death (cheap, huge feel win).

Expected outcome: the game-feel package that separates this from the 1985 original.

Test cases:
- [ ] Manual: destroying a wall shows debris matching removed quarters' direction.
- [ ] Manual: `prefers-reduced-motion` emulation disables shake and hit-stop.
- [ ] Manual: rumble fires on supported pad; zero errors on unsupported pad/browser.

---

**TS-021 · Stage data — all 35 layouts** — `MODEL: Sonnet 4.6`
*Depends on: TS-004 stage format frozen; playable engine recommended (TS-014) for playtesting*

Tasks:
1. Author `stage01.js` … `stage35.js` per the section 4 spec: design curve, roster interpolation table (compute and hard-code each stage's 20-tank queue with sensible ordering — heavies rarely first; bonus positions land on varied types), interval interpolation.
2. Order enemy queues intentionally: early stages front-load basics; late stages open with fast tanks and salt heavies through the middle and end.
3. ≥6 signature-shape stages (spell original words/symbols in brick, e.g. "SIEGE", arrows, a tank silhouette).
4. Write `stages.test.js` running the full validator (section 4 rules 1–6) across all 35.
5. Add a `docs/STAGES.md` one-liner per stage (theme + intended pressure).

Expected outcome: full campaign content, machine-validated, hand-ordered for difficulty rhythm.

Test cases:
- [ ] Unit: all 35 pass validator rules 1–6 including reachability flood-fill.
- [ ] Unit: roster totals are 20 everywhere; monotonic-ish difficulty check (weighted-threat score of stage N ≥ stage N−2).
- [ ] Manual: play stages 1, 12, 24, 35 — each feels like its band of the curve.

---

**TS-022 · CRT filter + settings** — `MODEL: Sonnet 4.6`
*Depends on: TS-018*

Tasks:
1. `crt.js`: optional post-pass — scanlines + slight vignette + mild phosphor bleed, done as a cheap overlay (no per-pixel JS; CSS/canvas pattern tricks). Default OFF.
2. Settings surface (on title or pause): CRT toggle, master volume, mute, control reference (`docs/CONTROLS.md` content rendered in-game).

Expected outcome: nostalgia toggle with zero performance cost when off, minimal when on.

Test cases:
- [ ] Manual: toggling mid-game is instant and doesn't blur game pixels beyond the intended effect.
- [ ] Manual: fps unaffected when off, ≥55fps when on (mid laptop).

---

**TS-023 · QA pass, docs, release build** — `MODEL: Sonnet 4.6`
*Depends on: everything above*

Tasks:
1. Full-game QA sweep against section 2 as a checklist; file and fix small bugs (anything architectural goes back to the owning issue's model via `DECISIONS.md`).
2. `README.md` full version: features, controls, dev guide, architecture map, how to add a stage.
3. `npm run build` verified as a portable static bundle (double-click `index.html` works); note that browser storage features are out of scope for v1.
4. Tag `v1.0.0`.

Expected outcome: shippable build + docs good enough that a new contributor (human or AI) can add stage 36 in ten minutes.

Test cases:
- [ ] Full campaign 1→35→loop playable, keyboard-only, pad-only, and mixed 2P.
- [ ] Section 2 checklist: every rule verified and checked off in the PR description.
- [ ] Fresh machine: unzip build → open → play. No network required.

---

## 6. Dependency graph & suggested dispatch order

```
TS-001 → TS-002 → TS-003 → TS-004 → TS-005 ─┐
                     └──── TS-006 ──────────┼→ TS-007 → TS-008 ─┬→ TS-009 ─┐
                                                                ├→ TS-010 → TS-011 → TS-012
                                                                └→ TS-015  │           │
                                                       TS-013 ←────────────┘           │
                                                       TS-014 ←── (TS-010, TS-013)     │
                                                       TS-016 ←── TS-014               │
TS-017 (after TS-007) → TS-018 → TS-019/TS-020/TS-022                                  │
TS-021 (format frozen at TS-004; playtest after TS-014)                                 │
TS-023 last                                                                             │
```

**Parallelization windows** (if running multiple Claude Code sessions):
- After TS-008: TS-015 (Opus) and TS-017 (Sonnet) can run alongside TS-009/010/011 (Opus).
- After TS-014: TS-021 (Sonnet) can run alongside TS-016 (Opus) and TS-019/020/022 (Sonnet).

---

## 7. Definition of done (v1)

1. All 23 issues closed with test cases checked.
2. Full 35-stage campaign + looping, 1P and 2P co-op, all 7 power-ups, all 4 enemy types with tiered AI.
3. Keyboard and gamepad fully supported including hot-plug, any 2P combination.
4. Complete synthesized audio and the juice package (particles, shake, hit-stop, rumble).
5. Zero Namco-derived assets, names, or music anywhere in the repo.
6. Static build runs offline from the filesystem.

## 8. Explicit non-goals for v1 (backlog, do not build)

- Survival mode, versus mode, boss stages every 5 levels
- Construction mode + shareable stage codes
- Touch controls / mobile layout
- localStorage persistence (progress, high scores, settings)
- Online features of any kind
