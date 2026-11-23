# Wild Frontier — Known Bugs & Limitations

Last updated: 2026-11-23. Severity: S1 blocker · S2 major · S3 minor · S4 cosmetic.

## Open bugs
| ID | Sev | Area | Description | Workaround |
|---|---|---|---|---|
| WF-B01 | S4 | NPCs | Mounted travellers and race rivals become full NPCs only when they are shot, robbed or knocked from the saddle. While riding they are simplified: you can greet or hold them up, but not hold a full conversation. | — |
| WF-B02 | S4 | Dialogue | 196 authored lines are longer than the 120-character guideline. The dialogue box now pages them at sentence boundaries ("Continue ▸ 1/3"), so the data still holds long lines. | — |
| WF-B03 | S3 | Map / quests | "Talk" objective markers point at a settlement's centre when the NPC isn't spawned yet, not at the NPC's scheduled spot. | Markers snap to the NPC once you're within about 900 px of the town. |
| WF-B04 | S3 | NPCs | Generic townsfolk can share a spot and overlap at the same table or corral position. | — |
| WF-B05 | S4 | Rendering | A horse facing exactly up or down uses a simpler front/back sprite with no rear/jump animation. Those animations play in side view only. | — |
| WF-B07 | S3 | Distance | Distances are "game-scale". The horse screen's "km ridden" counts 500 px as 1 km, which is time-compressed, not geographic. | — |
| WF-B08 | S3 | Weather | Teleporting between regions (fast-travel or the debug teleport) cross-fades the old region's precipitation over a few seconds. | — |
| WF-B09 | S3 | Accessibility | There's no in-game key-remapping UI. Bindings are data-driven in `core/input.ts`. A colour-blind palette, text scaling and reduced motion are available in Settings. | — |
| WF-B10 | S3 | Gamepad | Gamepad works for movement, riding, interact, aim and fire, menus via d-pad in dialogue, and pause. Shop and inventory screens are still mouse-driven. | — |
| WF-B12 | S3 | Save | Loading from the pause menu reloads the page to start from a clean world. That's intentional, because loading into a live session would duplicate horses. | — |
| WF-B11 | S3 | Localization | UI and content strings are English and inline. There's no string table yet, so the project's localization rule isn't met. | — |

## Fixed during this session (with the test that guards each)
| Bug | Fix | Guard |
|---|---|---|
| A quest talk objective advanced the stage before the dialogue entry was chosen, so NPCs skipped their quest-specific opening (Josiah). | The entry node is chosen before quest progress. | `tools/story-test.mjs` checks Josiah's opening line. |
| All horses in an encounter shared one id when several entries used the same tag. Only one stolen Brannigan horse existed, so the lead objective was impossible. | Encounter horse ids include the entry index. | `tools/story-full.mjs` (main_tracks lead stage). |
| Quest-tagged encounter horses were despawned by wild-herd streaming when the player was far away. | Herd streaming skips tagged horses. | `tools/story-full.mjs`. |
| The rental horse (Biscuit) satisfied the care-tutorial flags before you chose your own horse. | Care flags only count non-rental horses. | `tools/story-test.mjs` care stage. |
| The compass's cardinal letters rendered as white boxes because of a CSS class clash with blackjack cards. | Renamed the class. | Smoke screenshots. |
| Storefront upper windows overlapped the sign board and hid letters ("SALOO"). | Windows skip the sign area. | Smoke screenshot `03-start-larkspur.png`. |
| Building cutaways showed grass inside the walls. | The whole footprint is floored, with thicker interior wall columns. | `tools/scene.mjs` saloon interior shot. |
| A new story horse spawned out of view at the corral gate. | It spawns beside the player on a free tile. | `tools/story-test.mjs` screenshot `story-04-juniper.png`. |
| Dialogue keyboard and gamepad selection never fired, because input was cleared before UI update. | `endFrame` moved after UI update, with a 200 ms open guard. | Manual check. |
| main_surveyor was tagged `investigation`, so the journal and tracker didn't treat it as story. | Set to `main`. | `tools/story-full.mjs` side-mode filter. |
| Outlaws in a gang shot through each other in crossfire. Rustlers killed each other and completed the player's kill objective. | NPC hitscan ignores allies (same tag, or both hostile, or both neutral). | `tools/scene.mjs` roost check, plus `story-full`. |
| The Settings "reduced motion" toggle did nothing. | The renderer honours it and screen shake is disabled. | Manual check. |
| Hotels and depots (services only) opened on an empty Buy tab. | The first available tab is selected. | Manual check. |
| Horse rename used `prompt()`, which is blocked when the game is embedded as a page. | Replaced with an inline input. | Manual check. |
| A camp wasn't restored on load. | The campfire entity is restored. | `npm run test:persist` covers the save path. |
