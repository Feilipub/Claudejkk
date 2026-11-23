# Wild Frontier — Changelog

The repository's root `CHANGELOG.md` belongs to the studio framework. This file tracks the game.

## 0.1.0 — 2026-11-23 — First playable

### Added
**Foundation**
- HTML5 Canvas + TypeScript game, bundled by esbuild into `dist/`. A single-file build is at `dist/wild-frontier.html`. See ADR-0001.
- Deterministic 768×768-tile Calder Territory:
  - Six climates: plains, basin, forest, alpine, desert, canyon.
  - Rivers, lakes, cliffs, roads, trails and a railroad with bridges.
  - 14 settlements and 15 points of interest.
- Chunked per-pixel terrain painter with hill shading and dithering, plus an LRU streaming cache.
- Entity simulation tiers, and population streaming for townsfolk, wildlife, herds and encounters.

**Horses**
- 13 breeds, 18 coats, 9 patterns, face and leg markings, and 12 personality traits with mechanical effects.
- Individual generation.
- Procedural animated horse sprites showing tack.
- Riding with momentum, gaits, rein lag, terrain and slope, water, jumping, stamina, exhaustion, spooks, bolts and bucking.
- Utility AI.
- Needs, injuries and healing.
- Bonding with diminishing returns.
- Care interactions.
- Equipment with wear.
- Economy and trader corrals.
- Wild herds and taming.
- Breeding.
- Horse-thief events.

**World and people**
- NPCs: 50 authored characters plus generated townsfolk, with schedules, A* pathing, barks, opinion memory and quest markers.
- Wildlife: 19 species (including cattle) with prey, predator, herd, bird and snake behaviour.
- Day/night lighting, regional weather (rain, storms, fog, snow, blizzards, dust) and temperature.

**RPG systems**
- Combat: hitscan firearms, melee, lasso, hogtie and mounted fire. Enemy AI uses cover, repositions, retreats and surrenders.
- Law: witnesses, bounties, arrest, bribes, jail and bounty hunters.
- Reputation (8 axes), skills (4) and shops (24).
- Supply and demand pricing.
- Camping, cooking and sleep.
- Stagecoach fast travel.

**Content**
- Main story: 5 missions with 3 endings.
- 11 side quests.
- 28 lore documents.
- A lore bible, story outline and character bible.

**Activities**
- Horse races with AI rivals, quick-draw duels, fishing, blackjack, prospecting, safe-cracking, training and ranch work.

**UI and presentation**
- Western DOM UI: HUD, compass, minimap, map with exploration fog, journal, horse screen, shops, dialogue, settings, saves, camp, character screen and character creator.
- Accessibility: text scaling, colour-blind palette, reduced motion and partial gamepad support.
- Procedural Web Audio: hooves by surface and gait, neighs, gunfire with echo, wildlife, ambience, and a generative regional score.
- Versioned, checksummed saves with a backup slot and migration.

### Tests
- 30 unit tests.
- 19-step end-to-end smoke test.
- Mission-1 story test.
- Full main-story runs reaching all three endings, and a run through all 11 side quests.
- Save/load round trip.
- Evidence screenshots in `production/qa/evidence/`.

## Graphics pass 2 (2026-11-23)
- Painterly `shade()` (multiply + cool violet glaze), `autoShade` silhouette lighting on people/animals.
- Terrain: clustered tiling noise, water depth/foam/ripples, wagon ruts, straight timber road bridges.
- Props redrawn: pines, saguaro, cholla, prickly pear, hoodoos, boulders, wheat.
- Horse sprite: new proportions, canter phases, 3/4 front/back views.
- Buildings: tin/shake roofs, chimneys with smoke, lamplit windows after dusk.
- Dialogue portraits generated from each NPC's look (`src/render/portrait.ts`). Evidence: `production/qa/evidence/26-dialogue-portrait.png`.

## Playtest round 1: fixes (2026-11-23)
Four AI playtesters played with keyboard, mouse and screenshots only (`tools/playd.mjs` + `tools/play.mjs`). Their reports are in `production/qa/playtests/p1..p4/report.md`. Scores: 5, 4, 4.5 and 4/10. Fixes:
- **First mission:** talk objectives track the live NPC instead of a stale map spot. Stable corrals get a gate facing the livery door.
- **Shooting:** a quick click now registers as a shot (taps used to be lost inside one frame). The reticle shows whenever a weapon is drawn, and drawing a weapon the first time shows a hint.
- **Law:** one incident counts once, however many people witness it. Pressing Esc at an arrest counts as resisting arrest: the bounty goes up and the law turns hostile.
- **Collision:**
  - Horses glance off posts and corners. A horse wedged against something drops to a walk. Hitching posts have a slimmer collider.
  - On foot, the player slips around trunks and corners and can step out of overlaps.
  - Road travellers who get stuck move on to the next waypoint.
- **Interaction:**
  - The person in focus stays in focus (hysteresis), so the prompt you read is the one E acts on.
  - Z/X scroll the options instead of drawing a weapon.
  - The E that closes a conversation no longer reopens it.
- **Waypoints** no longer untrack the mission. The quest box shows both, and the waypoint clears when you reach it.
- **Pacing:** a game day now lasts 24 real minutes (was 12). No predators spawn near settlements or in the first real hour. Predators give up chases that go nowhere. Uninjured horses heal faster.
- **Horses:**
  - The HUD status updates as soon as you tie or untie the horse.
  - Messages use his/her pronouns.
  - Gallop speed on the horse sheet is shown in realistic mph.
  - Being thrown from the saddle shows a banner.
  - A horse on a lead rope is drawn after you if it falls far behind.
  - Quest horses survive stray NPC fire. That fire had been breaking "Sayen mares" at random.
- **Economy:**
  - Larkspur sells a $15 varmint rifle, and the smithy sells a hunting bow.
  - Tack you buy is fitted straight onto your horse, or the game tells you where it went.
  - A bedroll kept with your spare tack counts for making camp.
  - Shop and other menus keep their scroll position after an action.
  - The shop shows lariat ownership correctly.
- **NPCs:**
  - Children are drawn with child proportions at 0.85 scale and only say children's lines.
  - Tilly's portrait shows her face.
  - Clementine is now a bay sabino Morgan mare, as the quest describes her.
- **UI:**
  - The map counts towns as discoveries, places labels without overlap and draws a larger horse marker.
  - The compass uses a serif font, and key caps use a clear monospace.
  - "Quit to title" asks for confirmation.
  - The name field selects its text on focus.
  - The rest screen no longer says "Under the stars" by day.
  - "an American".

## Art pass by 5 specialists (2026-11-23)
Five specialists, each owning one area: horses, characters and portraits, terrain and props, buildings, lighting/wildlife/UI. Before and after images are in `production/qa/evidence/art/*/`. All art is still original and generated in code. The specialists' Stardew Valley and RDR2 taste was used as a quality bar for principles, not as a source to copy.
