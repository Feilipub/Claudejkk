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

## Mobile playtest + art round 2 (2026-11-23)
- **Art round 2:** five specialists studied reference images (only Wikimedia Commons was reachable; the game wikis were blocked by the network). Evidence is in `production/qa/evidence/art2/`.
  - **Horses:** readable black coats, Roman and dished profiles, knee flex, realistic coat patterns, tack in all three views.
  - **Characters:** eyes that read on dark skin with dark hair, worn clothing, a redrawn cowboy hat.
  - **Terrain:** calmer ground, landscape-scale colour patches, litter under props, a new aspen grove, about 20% faster painting.
  - **Buildings:** weathered corrugated tin roofs, rear lean-tos, clerestories, a sign font, dark barns at night.
  - **Light and UI:** directional golden hour, night glow, storm vignette, a new rabbit, pixel icons on the HUD bars, wood-and-brass touch buttons.
- **Mobile playtest (4 testers, touch only):** reports are in `production/qa/playtests/mobile-p*/report.md`. Fixes:
  - **Josiah** waits on the street in front of the livery until you meet him (data: `greetUntilFlag`).
  - **Touch prompt** sits in the free middle band above the menu bar. A tap that turns into a swipe no longer fires a prompt option.
  - **Touch screens** hide keyboard hints, show touch-specific text and a touch controls list in the pause menu, and add Recarregar, Lampião and Agachar buttons.
  - **Compact layout:** the map fits a landscape phone, the title screen fits short screens, and the compass and tracker are rearranged.
  - **Law:**
    - Lawmen only shoot to kill on a murder or a bounty of $150+.
    - A pursuing lawman offers "Surrender", and the arrest dialog has "Resist arrest".
    - Lawmen in town come for a wanted player.
    - The witness message no longer suggests silencing the witness.
  - **Interaction:**
    - Prompts no longer mix a person or a trader's horse with a trough.
    - Troughs offer "Water <horse>" and mounted "Let horse drink".
    - The trough is named correctly.
  - **Collision:** riders and walkers wedged for about 1 s are moved to the nearest clear spot.
  - **Feedback and inventory:**
    - Shots show "Hit" / "Miss" and a longer muzzle flash.
    - Equipping a weapon no longer draws it.
    - Drop needs two taps.
    - The bandage option disappears once the injuries are treated.
  - **Starting money** is $26.50 (rifle plus bedroll).
  - **Fixes from earlier in this round:**
    - Jumps: the horse lines up fences, refuses less often, and says when you're too slow.
    - "I'm looking for…" works with any NPC.
    - Barks follow the time of day and avoid repeats.
    - Signposts use the right scale and name the town you're in.
    - You wake at the doctor fed.
    - The horse sheet shows Fed/Watered.
    - Dismounting never puts you inside a building.
    - The map zooms ×1 to ×4.
    - Josiah's line now matches Biscuit (a gelding).

## 2026-11-24 — "Make it feel drawn, make it feel lived in"
### Art, round 3 (hand-pixelled everything)
- New pipeline: `render/pixmap.ts` (text pixel grids → canvas through one master palette `PAL`, `recolor`/`flipX`/`compose`) and `design/art/pixel-art-bible.md`. No shape-painting or noise remains in final art.
- Ground: 16×16 hand-drawn tiles with 3–4 variants, organic transitions with a raised lip, cliffs with strata, roads with ruts, bridges, rails, shoreline foam; chunk painting 2.4× faster.
- Props: every tree, bush, cactus, rock, fence, well, trough, barrel, lamp, windmill, water tower, interior furniture redrawn; 3 variants each.
- Buildings: assembled from pixel modules (shingle/tin/adobe roofs, clapboard/board-and-batten/brick/log/adobe walls, windows with glints and curtains, doors, false fronts, porches, boardwalks, crisp signs).
- Characters: big readable heads, per-material tinted outlines, 8 hats, 6 hairstyles, 4 beards, layered clothes, all poses; portraits redrawn.
- Horses: 3 body templates by breed, 18 coats by palette swap, drawn pattern masks, per-leg markings, tack in all views, all gaits, lie/sleep pose.
- Wildlife: 11 quadrupeds, rabbit, 5 birds, snake redrawn; UI: wood-and-brass frames, leather HUD plaques, pixel icons, pressed-state buttons, touch buttons with icons.

### Mobile controls hotfix (after the owner's report: "joystick e movimentação muito bugados")
- The phone menu bar was laid out over the joystick corner, so every attempt to walk opened a menu (WF-B27). It now sits top centre under the compass; icons only below 820 px wide; two rows of four on tiny phones.
- The joystick is claimed by where the thumb lands (document level), not by which element it hits: a thumb on a notification or the prompt still steers. The control layer is fixed to the real screen, so the ring sits under the thumb on notched phones (WF-B30).
- A ridden horse now answers a real, trembling thumb: rein lag restarts only on a new direction (`core/steer.ts`), and a slow sweep of the thumb is followed continuously (WF-B28).
- Walking into a wall or fence no longer creeps sideways; the doorway funnel only engages when you push at the facade; the sprite facing has hysteresis on diagonals; a half-pushed thumb walks instead of running (WF-B29, WF-B32).
- No empty prompt box while riding on a phone (WF-B31).
- New `npm run test:touch` (`tools/touch-check.mjs`): an emulated phone with per-frame thumb jitter checks all of the above and keeps screenshots in `production/qa/evidence/mobile-controls/`.

### Mobile
- Whole device pixels per game pixel on any DPR; Camera setting (Far/Normal/Close); viewport-fit=cover + safe-area insets; app-capable metas; rotate overlay in portrait; fullscreen + landscape lock on first touch (where allowed); scrollable prompt; compact phone HUD; blackjack fits a phone; doorway funnel so you can enter buildings without pixel-perfect alignment.

### Open world
- 4 new settlements (Harrow Junction, Las Golondrinas, Lodestar Camp, Toller's Landing) and 4 ranches/farms (Coldiron Cattle Co., Starling Horse Ranch, Arrieta Sheep Camp, Ashgrove Orchard), 11 roads, 17 signposts, 19 shops, 31 named NPCs.
- Jobs: notice boards in 17 settlements, 19 job templates (freight/mail/strongbox deliveries, gather contracts, cattle drives, fence/trough/forge chores, colt breaking, bounties, saloon shifts), a strike meter with a target zone, free work (dig ore, fell timber), reputation with employers.
- Trade: regional supply/demand prices, 8 trade goods, trade posts, per-region saturation, shop hints (made here / scarce here / flooded).
- Property: 3 homestead plots with 6 improvements and daily tax.
- NPC life: 26 occupation routines with Sunday church, visible work (hammering, sweeping, feeding, hoeing, patrols, kids' tag), NPC↔NPC conversations with topics and relationships, reactions to rain/night/gunfire/the player's reputation, shopkeepers greeting regulars by name.
- Wildlife quota counts groups, not heads (the plains were empty after one cattle herd).
- Journal "What now" tab: job, quest givers to find, boards with work, places left, the Pale Mare; HUD shows the active job and time left.
- Law: gunshots in town are heard (warning, then a charge); lawmen only shoot to kill for murder or big bounties; Surrender/Resist options; lawmen come for wanted players in town.
- Horses wake when you walk up or whistle; "Fed/Watered" labels; rider sprites carry their own legs.

### Localisation
- `core/i18n.ts` (English keys → dictionary, `L()`, tr``, `translateDom`), language setting (auto-detected), 1,739 strings extracted from data and being translated to pt-BR in per-slice dictionary files.

### Tooling and QA
- `tools/playd.mjs` phone emulation (touch-only playtests), `tools/phone-scene.mjs`, `WF_OUT` parallel builds, `WF_DUMP_SAVE`/`WF_SAVE` for post-story playtests, `tools/i18n-keys.mjs`.
- Post-story open-world playtest report (`production/qa/playtests/openworld/report.md`, 5/10 before the expansion).
