# Wild Frontier — Technical Architecture

Status: living document · Last updated: 2026-11-23

## 1. Technology decision (ADR-001)

**Context.** The repository had no engine installed and no game code. The project's
template points to Godot 4.7, but there's no Godot binary in this container, and
the editor can't be downloaded here. The game also has to be launched,
driven and screenshotted headlessly so every change can be verified.

**Decision.** Build the game as an **HTML5 Canvas 2D + TypeScript** application,
bundled with **esbuild**, with no runtime dependencies. All art and audio are
generated procedurally at runtime.

**Consequences.**
- It runs in any modern browser, with no install, and ships as a single self-contained HTML file.
- It's fully testable: Node runs the unit tests and headless Chromium (Playwright) runs the end-to-end tests.
- Canvas 2D sets the performance ceiling, so the world uses chunk streaming and simulation tiers.
- The Godot engine reference docs in `docs/engine-reference/` don't apply to this code base.
  A later port can reuse the data and logic layers (`src/data`, `src/horse`, `src/systems`)
  almost unchanged, because they don't touch rendering.

## 2. Module map

```
src/
  main.ts              boot, title menu, character creator, frame loop
  game.ts              Game hub: owns world, systems, entities; update order; services
  core/                rng & noise, math, typed EventBus, remappable Input
  data/                ALL tunable content (pure data)
    balance.ts         global tuning knobs
    breeds.ts          13 horse breeds (16 stats each, coats, patterns, trait biases)
    coats.ts           18 coat colours, 9 patterns, face/leg markings, mane/tail styles
    personalities.ts   12 traits, each with 12 mechanical modifiers
    items.ts           ~90 items: weapons, food, medicine, horse food/medicine, tack
    shops.ts           24 shops: stock, buy categories, services, horse inventories
    wildlife.ts        18 species: archetype, senses, yields, horse-fear, look params
    world.ts           macro geography: regions, rivers, lakes, roads, rail, settlements, POIs
    schema.ts          types for authored content (conditions, effects, dialogue, quests…)
    story/             narrative content: NPCs, dialogue, barks, quests, lore, encounters
  horse/               THE HORSE SIMULATION (pure logic, unit-tested)
    horse.ts           persistent HorseData model
    generator.ts       unique individual generation (genes, coat, traits, preferences)
    stats.ts           derived ride stats (breed × genes × age × traits × training × bond × condition × gear)
    bonding.ts         behaviour-driven bonding with diminishing returns + penalties
    care.ts            needs over time, injuries & healing, care actions
    brain.ts           utility-scored behaviour state machine (unridden AI)
    economy.ts         appraisal / asking / offer prices
    breeding.ts        foal inheritance (genes, coat, pattern, traits)
  world/               tile vocabulary, World container + queries, worldgen, settlements, A* paths
  entities/            Entity + SpatialHash, Player, HorseEntity (AI + riding), Npc, Animal
  systems/             quests, dialogue, script (conditions/effects), law, reputation, combat,
                       economy (regional trade, property), jobs (notice boards, 19 job templates),
                       interactions, camp, activities, taming, horsethief, spawner (+ spawnQuota:
                       wildlife groups), social (NPC routines, work behaviours, NPC↔NPC talk, memory),
                       skills, save, time, weather
  data/social.ts       26 occupation routines, relationships, conversation topic pools
  data/jobs.ts         job templates, notice boards, trade goods, homestead plots and improvements
  render/              pixmap (hand-drawn pixel grids + master palette), terrain chunk cache,
                       renderer (lighting/weather/particles), sprite builders: horse, human, portrait,
                       animal, prop, building (+ *Pixel.ts drawing files)
  core/i18n.ts         localisation (English keys → locale dictionary)
  audio/               Web Audio synthesis: hooves, neighs, guns, ambience, generative score
  ui/                  DOM UI: HUD, prompts, every menu; western design system (style.ts)
tests/unit/            node:test suites (horse, brain, systems/data integrity)
tools/                 build.mjs, smoke.mjs, story-test.mjs, story-full.mjs, shot.mjs, gen-preview.ts
```

## 3. Frame update order (`Game.update`)

1. Game clock tick → `lastGameMinutes`, region detection, temperature, weather.
2. Spatial hash rebuild.
3. Entity updates by **simulation tier**. Entities within about 900 px of the player, the
   ridden horse, led horses and race rivals get a full update. Everything else gets
   `updateLow`: horse needs keep ticking and NPCs snap between schedule spots.
4. Taming, activities, combat tension, law (bounty hunters, decay), quests (poll + auto-start),
   spawner (streaming), camp, interactions, POI discovery, explored-map fog.
5. Autosave every 3 minutes when out of combat; audio listener and ambience.

Rendering (`Renderer.render`) runs every frame after update:
terrain chunks → water glints → y-sorted props, buildings, entities → particles and tracers →
weather → lighting (multiply ambient + additive light sources) → integer upscale → vignette.

## 4. World and streaming

- The **world** is 768 × 768 tiles. Each tile is 16 px, about 2 m. It's generated deterministically from
  `WORLD_SEED` in about 1–1.5 s, so the save never stores terrain.
- **Layers:** ground type, height, object, flags (road/rail/bridge/river/settlement/interior/trail), region index, building index.
- **Generation steps:** domain-warped Voronoi regions → per-climate elevation models blended
  by region weight → climate-based ground → lakes → wobbling rivers with banks → valley carving →
  slope-derived cliffs → roads, trails and rail (cliffs cleared, bridges flagged) → vegetation
  scatter by ecology → settlements → POI accessibility.
- **Terrain streaming:** 32×32-tile chunks are painted per pixel into 512² canvases.
  The painter uses organic warped borders, hill shading, ordered dithering, shore foam, cliff strata, rails and bridges.
  An LRU cache holds 24 chunks, and the renderer paints at most 2 new chunks per frame while pre-streaming ahead of a galloping horse.
- **Population streaming:**
  - Settlement NPCs spawn within 900 px and despawn past 1400 px. Their persistent state lives in `npcMemory`.
  - Wildlife spawns out of view by regional ecology and time of day, and despawns past 1100 px.
  - Wild herds spawn on the open ranges. Mustang Flats always has one.
  - Encounters spawn on approach, or from a quest stage's `onEnter`.

## 5. Horse system architecture

See `design/gdd/horse-system.md` for design. Code flow:

```
HorseData (persistent) ─┬─ stats.rideStats() ──► RideStats (gait speeds, accel, turn, stamina,
                        │                         drain/regen, obedience, fear, jump, terrain, rein lag)
                        ├─ care.tickHorseNeeds()   every frame (full tier) or coarse (low tier / sleep)
                        ├─ bonding.grantBond()     from care, riding km, time together, training, stress survived
                        └─ brain.decide()          utility AI when not ridden
HorseEntity
  updateRidden(): input → gait level → target speed × terrain × slope × water;
                  momentum (accel/decel), speed-dependent turning, rein lag, jumping,
                  stamina/energy, rough-ground injuries, fear spooks/bolts, bucking
  updateBrain():  executes BrainDecision with obstacle/cliff/deep-water avoidance
  draw():         procedural sprite set (side 10 anims, front/back) + rider composite
```

Breed data is completely separate from behaviour code. Adding a breed means adding one entry to `data/breeds.ts`.

## 6. Content and scripting

Story content is declarative data that follows `data/schema.ts`:
- Conditions such as flag, quest stage, reputation, opinion, item, money, time, bond, wanted and region.
- Effects such as setFlag, give/take, money, quest control, reputation, opinion, shop, giveHorse, encounter, lore, activity.

`systems/script.ts` interprets both. Dialogue trees choose their entry node by condition. The quest
system combines event-driven and polled objectives with branching `next` and `failIf`.

## 7. Persistence

`systems/save.ts` stores versioned JSON in localStorage, with three manual slots and an autosave.
- **Corruption handling:** an FNV checksum per save. The previous save is kept as `_bak` and loaded automatically if the main one is corrupt.
- **Migration:** `migrate()` upgrades older versions (currently v1 → v2).
- **What's saved:** the player (position, look, stats, inventory, weapons, skills), every owned horse (full HorseData, including bond, health, injuries, gear and history),
  clock, weather, flags, reputation, wanted state, quests, NPC memory (opinion, dead/left), discoveries,
  lore, explored fog, the economy (stock, market saturation, trader horses) and spare tack.

### 7.1 Added by the open-world expansion
Jobs (active job, board offers per day, standing per employer), property (plots, improvements, tax
debt), per-region market saturation and trade-post stock are serialised with the game; old saves
load with defaults. See `design/gdd/economy-jobs.md`.

## 8. Testing

| Layer | Tool | Command |
|---|---|---|
| Logic: horse stats, bonding, care, AI brain, breeding, economy, inventory, reputation, skills, clock, save migration, data integrity (30 tests) | node:test | `npm test` |
| Types | tsc (TS 7) | `npm run typecheck` |
| End-to-end smoke, 19 steps: boot, creator, movement, riding, care, UI screens, NPC talk, shop, regions, weather and night, hunting, taming, law, race, stagecoach, breeding, horse thief, save, frame time | Playwright | `npm run smoke` |
| Mission 1 through real interactions | Playwright | `npm run test:story` |
| Full main story to each ending | Playwright | `npm run test:story-full` |
| All 11 side quests, started through their givers | Playwright | `npm run test:side` |
| Save → reload → continue round trip, and corrupt-save fallback | Playwright | `npm run test:persist` |
| Visual QA of a scripted scene | Playwright | `node tools/scene.mjs out.png "<js>"` |

## 9. Performance budget

- Target is 60 fps. Headless software-rendered Chromium measured an average of 16.7 ms per frame.
- Chunk painting takes about 10–25 ms per chunk and is capped at 2 per frame.
- Sprite sets are cached: horse sets in an LRU of 60, the human cache holds up to 200, and building sprites are cached by id.

## 10. Art pipeline (round 3): hand-authored pixel grids

Earlier rounds painted sprites with canvas primitives (ellipses, polygons, gradients, noise) and then
snapped them to pixels. The result read as "smeared". The pipeline is now:

- `render/pixmap.ts` — `pixmap(rows, key)` turns a text grid (one character per pixel) into a canvas
  through the **master palette** `PAL` (named, hue-shifted ramps: cool shadows, warm highlights);
  `recolor()` swaps ramps (coats, clothes, siding), `flipX()` mirrors, `compose()` stacks layers.
- Drawings live next to their painter: `tiles16.ts` (ground tiles + transitions), `propsPixel.ts`,
  `buildingPixel.ts` (modular roofs/walls/windows/doors/porches/signs), `humanPixel.ts`,
  `horsePixel.ts`, `animalPixel.ts`, `ui/icons.ts` (pixel icons as data URIs).
- Rules are in `design/art/pixel-art-bible.md` (16 px grid, big readable heads, per-material tinted
  outline, 3–5 values per material, clusters not noise, calm ground / lively actors).
- Everything is still generated at load and cached; there are no image files in the repo.

## 11. Mobile presentation

- The renderer picks a whole number of **device** pixels per game pixel (`physScale`), so art is crisp
  on any DPR; the CSS scale follows from it. A camera setting (Far/Normal/Close) shifts the step.
- `viewport-fit=cover`; the UI root is inset by `env(safe-area-inset-*)`; `100dvh` body.
- Touch controls (`ui/touch.ts`): a floating joystick on the left half and action buttons on the right
  press the same key codes as the keyboard, so gameplay stays input-agnostic. The first touch requests
  fullscreen and a landscape lock where the browser allows it; portrait shows a rotate overlay.
- Phone layout is driven by `body.has-touch` rules in `ui/style.ts`.

## 12. Localisation

`core/i18n.ts`: English strings are the keys; `L(key, ...args)` / `` tr`…` `` look them up in the active
dictionary (`data/locale/pt-BR.ts`), falling back to English. `translateDom(root)` translates the text
nodes of rendered UI templates so large HTML templates stay readable English in code. The language is a
setting (auto-detected from the browser on first run). `tools/i18n-extract.mjs` lists the keys.

## 13. How the studio works on this code

Features and art are produced by specialist agents working in parallel on **disjoint file sets**
(ownership is stated in each brief), each verifying with `tsc`, unit tests, builds into their own
`WF_OUT` folder and scene screenshots. Human-style playtest agents play through `tools/playd.mjs`
(keyboard/mouse or phone emulation; no access to internals) and write reports in `production/qa/playtests/`.
An adversarial review pass (independent reviewers trying to break each change) runs before integration.
