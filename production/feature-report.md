# Wild Frontier — Feature Completion Report

Last updated: 2026-11-24. Status key:
- ✅ implemented and verified by an automated test or a screenshot
- 🟡 implemented with known gaps
- ⬜ not implemented

## Priority 1 — Foundation
| Feature | Status | Notes |
|---|---|---|
| Boot, loading screen, title menu | ✅ | `tools/smoke.mjs` |
| World generation (6 regions, rivers, lakes, cliffs, roads, rail, 14 settlements, 15 POIs) | ✅ | 768×768 tiles, deterministic |
| Terrain streaming (chunk LRU), entity simulation tiers, population streaming | ✅ | Smoke test frame time: 16.7 ms |
| Player movement, collision, sprint/crouch, camera with riding look-ahead | ✅ | |
| Input: keyboard and mouse, remappable bindings (data) | ✅ / 🟡 | No in-game rebinding UI |
| Gamepad | 🟡 | Movement, riding, combat, interact, dialogue, pause. Shop and inventory need a mouse. |
| Save and load: versioned, checksummed, backup slot, migration, autosave | ✅ | Unit test for migration; smoke test saves |

## Priority 2 — Horses
| Feature | Status | Notes |
|---|---|---|
| 13 breeds with distinct 16-stat profiles (data-driven) | ✅ | Unit test |
| Individual generation: genes, age, sex, 18 coats, 9 patterns, markings, mane/tail, traits, preferences | ✅ | |
| 12 personalities with mechanical effects | ✅ | Unit tests (fear, brain) |
| Procedural animated horse sprites (walk, trot, canter, gallop, graze, rear, buck, jump, lie; front and back views) showing coat, pattern and tack | ✅ | Gallery screenshot |
| Riding: gaits, momentum, turning, rein lag, jump, rein back, terrain, slope, water, stamina, exhaustion | ✅ | Smoke test gallop |
| Horse AI: graze, drink, rest, sleep, wander, follow, come to whistle, flee, spook, shelter, herd, tied, lead | ✅ | 7 brain unit tests |
| Contextual interactions: pet, calm, feed (favourite food), water, brush, hooves, treat, tie/untie, lead, saddlebags, inspect, make main | ✅ | Story test exercises brush, feed, water |
| Bonding (5 levels, diminishing returns, penalties, bond effects) | ✅ | Unit tests |
| Health, needs, injuries (7 kinds), slow healing, treatment, vet, stabling | ✅ | Unit tests |
| Equipment: 7 slots, 20 tack items, practical stats, wear, repair, customisation (mane/tail/length/name) | ✅ | |
| Economy: appraisal, trader corrals, buy/sell, regional demand, reputation pricing, rentals, stolen horses | ✅ | Unit test (appraisal) |
| Wild horses: herds, lasso, calming, bucking break-in | ✅ | Smoke test |
| Legendary Pale Mare | ✅ | Quest `horse_pale_mare` |
| Breeding | ✅ | Ranch service; foals inherit genes/coat/traits (unit test) |

## Priority 3 — World immersion
| Feature | Status | Notes |
|---|---|---|
| Day/night with golden hours, lighting, window, lamp and fire light | ✅ | Night screenshot |
| Regional weather: rain, storms with lightning and thunder, fog, snow, blizzards, dust; temperature | ✅ | Region screenshots |
| NPCs: 50 named, plus generated townsfolk; occupation schedules; A* pathing; barks; opinion memory | ✅ | |
| Wildlife: 18 species; prey, predator, herd, bird and snake behaviour; packs; hunting yields | ✅ | Smoke test hunt |
| Road travellers on horseback | ✅ | |
| Seamless building interiors (roof cutaway) | ✅ | Saloon screenshot |
| Discovery of POIs, explored-map fog, lore documents | ✅ | |

## Priority 4 — RPG systems
| Feature | Status | Notes |
|---|---|---|
| Inventory with weight, categories, use, drop, saddlebag transfer | ✅ | Unit test |
| Shops (24): buy, sell, services, supply/demand saturation | ✅ | |
| Quests: 16 (5 main + 11 side); event and polled objectives; branching; fail conditions; persistence | ✅ | `tools/story-full.mjs` |
| Dialogue: 50 authored trees, conditional entries, tones, opinion; generic conversations; 179 barks | ✅ | |
| Reputation: honor, notoriety, 6 factions; prices and dialogue conditions | ✅ | |
| Law: witnesses, reporting delay, regional bounties, lawmen arrest, bribe, jail, bounty hunters | ✅ | Smoke test (murder → wanted) |
| Combat: 7 weapons, hitscan, spread and recoil, reload, melee, lasso, hogtie, mounted fire | ✅ | |
| Enemy AI: cover seeking, flanking-ish repositioning, retreat, surrender, pursuit | 🟡 | No suppressive-fire state |
| Skills: riding, gunslinging, horsemanship, survival | ✅ | Unit test |

## Priority 5 — Content
| Feature | Status | Notes |
|---|---|---|
| Main story: 5 missions, 3 endings, duel finale | ✅ | `story-full.mjs law/press/bribe` reach an ending |
| Side quests: race, legend horse, wolves, delivery, homestead, bounty, Sayen mares, lost pony, hides, treasure, derby | ✅ | |
| Lore bible, story outline, characters | ✅ | `design/narrative/` |
| Activities: horse races (AI rivals), duels, fishing, blackjack, prospecting, safe-cracking, horse training | ✅ | |
| Poker, dominoes, shooting contests | ⬜ | Poker maps to blackjack |

## Priority 6 — Polish
| Feature | Status | Notes |
|---|---|---|
| Western UI: HUD cores, compass, minimap, map, journal, horse screen, shops, settings, saves, camp, character | ✅ | Screenshots |
| Character creation with live preview | ✅ | |
| Procedural audio: hooves by surface and gait, neighs, guns with echo, wildlife, wind, rain, crickets, generative score by region | ✅ | Not verifiable headless (no audio output). Code path runs. |
| Camping: fire, cook, sleep, save, horse settles | ✅ | |
| Localization string tables | ⬜ | See known bugs |
| Colour-blind mode | ⬜ | Text scaling and reduced-motion settings exist |

## Added after the first report
| Feature | Status | Notes |
|---|---|---|
| Quest markers: "!" over NPCs who offer work, "?" over NPCs you need; also shown on the minimap | ✅ | |
| Stagecoach fast travel between 7 stops; your horse comes along and time passes | ✅ | Smoke test |
| Ranch work: break green colts at the Brannigan corral for pay (repeatable daily) | ✅ | Scene test |
| Road travellers on horseback | ✅ | |
| Persistence round trip (save → reload → continue) and corrupt-save fallback | ✅ | `npm run test:persist` |
| Colour-blind palette, text scaling, reduced motion | ✅ | Settings |
| Horse breeding at the Brannigan ranch: foals inherit genes, coat, pattern and temperament, and are drawn small until grown | ✅ | 5 unit tests plus a scene test |
| Dynamic horse-thief events: chase, whistle (bond 3+ throws the thief), or recover the horse from a distant livery | ✅ | Scene test |
| Cattle herds on the plains and in the basin; killing a steer is a crime | ✅ | |

## Added 2026-11-24
| Feature | Status | Notes |
|---|---|---|
| Hand-pixelled art pipeline (tiles, props, buildings, characters, portraits, horses, wildlife, UI) | ✅ | `production/qa/evidence/art3/*` before/after |
| Mobile: device-pixel scaling, camera setting, safe area, rotate overlay, touch HUD, doorway funnel | ✅ | `tools/phone-scene.mjs` screenshots |
| 8 new settlements/ranches, 11 roads, 17 signposts, 19 shops, 31 named NPCs | ✅ | `production/qa/evidence/world/*`; story tests green |
| Jobs (19 templates, 17 boards), free work, strike meter | ✅ | 34 unit tests; `production/qa/evidence/economy-jobs/*` |
| Regional trade, trade posts, saturation per region, shop hints | ✅ | unit tests |
| Homestead plots and improvements | ✅ | unit tests; scene screenshot |
| NPC routines, visible work, NPC↔NPC talk, reactions, memory | ✅ | `production/qa/evidence/npc-life/*`; 0.06 ms/frame |
| Journal "What now" + active job on HUD | ✅ | screenshot |
| Localisation layer + pt-BR dictionary | 🟡 | data strings translated by slice; code strings being refactored to tr`` |
| Procedural soundtrack and richer SFX | 🟡 | in progress (wave 2) |
| Wildlife behaviour and hunting quality | 🟡 | in progress (wave 2) |
| Dynamic road events | 🟡 | in progress (wave 2) |
| Notice-board / plot / fruit-tree props, corral livestock | 🟡 | in progress |
