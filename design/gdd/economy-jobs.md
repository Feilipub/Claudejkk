# Economy, Trade and Work — GDD

> Many frontier lives: drover, freighter, mail rider, miner, logger, barkeep,
> smith's striker, bounty hunter, trader, homesteader. Honest work keeps you fed;
> risk and hauling make you comfortable; land is where the money goes.

Code: `src/systems/jobs.ts` (job system, prompts, mini-games), `src/systems/economy.ts`
(prices, trade, homesteads, every pure formula), `src/data/jobs.ts` (all job, board,
trade and property data), `src/data/balance.ts` → `jobs`, `trade`, `property`.
Tests: `tests/unit/systems/economy-jobs.test.ts`.

## 1. Overview
- **Notice boards.** 17 settlements post a board at the door of one building, such as the sheriff's office, the depot or the ranch house. Each board posts 2–4 offers a day. The offers are deterministic per (board, day) and rotate every morning.
- **Asking for work.** A townsperson whose trade matches a posted job offers that job when you choose **Ask for work**. For example, a bartender offers a saloon shift and a sheriff offers bounties.
- **Seven kinds of job**, each with its own gameplay loop:
  - deliveries (freight, mail, strongbox runs)
  - labour and harvest contracts (ore, timber, wheat, fish, pelts)
  - cattle drives
  - flagged chores (mend fences, feed stock, strike at the anvil)
  - colt breaking
  - bounties
  - saloon shifts
- **Pay** scales with skill, faction reputation, your standing with that employer, the day's demand and how well you did the job. You hold one job at a time.
- **Self-directed labour** needs no job:
  - Dig ore at mine entrances with a pick.
  - Fell timber with an axe.
  - Harvest wheat while on a harvest contract.
  - Each of these uses the same strike mini-game and produces trade goods.
- **Regional trade.**
  - Eight trade goods are cheap where they are produced and dear where they are scarce.
  - Market saturation is tracked per region, so hauling beats dumping everything in one town.
  - Trade posts add stock to some shops and add buy lists to others, so every region has a buyer.
- **Homesteads** are the long-term money sink:
  - Buy a deed at a land office (Larkspur, Port Ashby).
  - Build improvements: well, cabin, garden, coop, stable, pasture. They yield produce and services.
  - Pay a daily tax.

## 2. Player Fantasy
- You ride into a town broke and read the board. There's always something a pair of hands can do.
- A week later you are the rider the depot trusts with the payroll, and the Coldiron foreman pays you more because you never lose a steer.
- You learn the territory as a trader learns it: whiskey is cheap at the Ashby wharf and dear in a dry mining camp, and coffee is gold in the high camps.
- At the end you have a roof of your own on the Calder bend, hens in the yard and your horses resting in your own lean-to. You worked for every board of it.

## 3. Detailed Rules

### 3.1 Notice boards (`JOB_BOARDS`)
- **Where the board is.** At the door tile of the first listed building type that exists in the settlement. The prompt **Read the notice board** appears within about 34 px of that door.
- **Brannigan** stays closed until `main_arrival` is complete.
- **Daily offers.**
  - `rollBoardOffers(board, day)` seeds an RNG with `hash(settlementId:day)`.
  - It fills up to `slots` offers from the board's templates, weighted by `template.weight`, with no template repeated.
  - A template is skipped when the local world cannot host it: there are no chore objects, there is no corral, or there is no delivery destination in range.
- **Each offer rolls:**
  - a demand multiplier
  - units: gather quantity, number of steers, gang size
  - a destination: a board settlement within `[minTiles, maxTiles]` straight-line tiles
  - a bounty camp: one of the 3 camps nearest the board
- **One job at a time.** Taking an offer marks it as taken for the day. While a job is active, the board shows turn-in actions and **Quit current job**.
- **Land office.** The Larkspur and Port Ashby boards add **Land office: homesteads**.
- **Ask for work** (`OCCUPATION_WORK`) opens the same board, filtered to the templates that NPC's trade can offer.

### 3.2 Job kinds
| Kind | Loop | Ends when | Performance |
|---|---|---|---|
| deliver | You get cargo (it needs satchel room). The waypoint is set to the destination board. Ride. At that board, choose **Deliver**. Strongbox runs can be ambushed: 2–3 road agents spawn when you are 30–70 % of the way along the route and outside town. | Delivered; cancelled 6 game hours after the deadline | `deliveryPerformance` |
| gather | Bring `units` of the item to the board where you took the job. The item can be ore, timber, wheat, fish or a pelt. | Handed over; deadline in days | 1 |
| cattle | 4–6 steers spawn 26 tiles from the corral gate. Steers flee you as usual, and while fleeing they curve toward the gate (`herdPull`). A steer within `penRadius` of the gate is penned and stays inside the corral. | All steers penned or lost; time limit | penned ÷ total, +0.1 for a clean sweep |
| chores | Flags appear on spread-out fence, trough or anvil tiles. At each flag, the prompt starts the strike mini-game. Feeding uses up the hay you were handed. | Every flag done; time limit | `strikePerformance(all hits, all misses)` |
| breakHorse | Starts the existing colt-breaking session at the Brannigan corral. The stable still pays its own fee (`externalPay`); the contract adds a bonus. | Ride out the colt, or get thrown | 1 |
| bounty | Waypoint to the camp. The outlaw (and gang) spawn when you are within 700 px, already hostile, guarding the camp. Bring him in alive (hogtie, hand to any sheriff) and the job pays at once. If he dies, claim at the board at half pay. | Captured, claimed, or 3-day limit | 1 alive, `bountyDeadMul` dead |
| bartend | A chain of `g.ui.choice` orders, for example "something that burns going down" is Whiskey. Each pour takes 20 game minutes. You can end the shift early. | All orders done | `strikePerformance(right, wrong)`; units = right pours (tips) |

- **Failing or quitting a job:**
  - costs employer standing (−2) and faction reputation (−1)
  - takes back undelivered cargo
  - despawns the job's steers
- **Completing a job:**
  - pays out
  - adds employer standing (+1) and faction reputation (+1)
  - grants the template's skill XP

### 3.3 Strike mini-game
- **How it plays.** A bar fills and empties smoothly. It uses the shared HUD meter, the one fishing uses. Press **E** when the bar tops out (gauge ≥ `strikeSweet`).
- **Ending.** It ends after `strikes` hits, or after `strikes + strikeMissAllowance` misses.
- **Cancelling.** Moving cancels it.
- **Input.** While it runs, and for 0.35 s after, interaction prompts are suppressed. This stops the last swing from firing a prompt.
- **Uses:** dig ore (4 strikes), fell timber (3), harvest wheat (2), mend fence (2), feed trough (1), strike at the anvil (8).
- **Self-directed labour yield:**
  - Yield is `max(1, round(perf × yieldPerPerf))`.
  - It is capped per tile per day (`perTilePerDay`): a seam gives 8 ore a day; a tree or a wheat row gives 1.

### 3.4 Regional trade
| Good | Base $ | Produced (×0.7) | Scarce (×1.45) |
|---|---|---|---|
| Raw Galena Ore | 0.12 | drylands, sierra | blackwater |
| Split Timber | 0.15 | pinehollow | drylands, redstone |
| Wheat Sheaf | 0.06 | dustfall | pinehollow, sierra |
| Bundle of Furs | 9 | sierra | blackwater |
| Case of Whiskey | 6 | blackwater | drylands, redstone, sierra |
| Sack of Coffee | 4 | blackwater | sierra, pinehollow, drylands |
| Crate of Tools | 8 | blackwater | drylands, pinehollow |
| Bill of Sale: One Steer | 12 | dustfall, sierra | redstone, drylands, blackwater |

- **Category and selling.** Trade goods are `material`, so they show under *Goods & valuables* and sell at any store that buys material.
- **Trade posts** (`TRADE_POSTS`) add stock and buy categories to existing shops at runtime. They restock on the shop's own `restockDays`.
  - Ashby sells whiskey, coffee and tools.
  - Larkspur and Coldiron sell steers.
  - Whitepeak sells furs and steers.
  - Cedar Notch, Sulfur Flats, the fort, Lodestar and Golondrinas start buying material.
- **Ordinary goods** keep the original regional rule: remote regions ×1.1, and pelts in blackwater ×1.15.
- **Saturation**:
  - It is tracked per (region, item).
  - Each sale adds 0.06, or 0.12 for a trade good.
  - Price × (1 − sat × 0.85).
  - It recovers 0.25 a day.
  - Old saves that keyed saturation by item alone drop those keys on load.
- **Anti-arbitrage.** A shop never pays more than 90 % of its own asking price for an item it stocks.

### 3.5 Homesteads
- **Plots**, each priced with a daily tax:

  | Plot | Region | Price | Tax per day |
  |---|---|---|---|
  | Calder Bend Quarter-Section | dustfall | $60 | $0.10 |
  | Pine Creek Clearing | pinehollow | $45 | $0.08 |
  | Junction Flats Homestead | dustfall | $80 | $0.15 |

- **Upgrades**, built at the plot (**Build improvements**):

  | Upgrade | Cost | Requires | Gives |
  |---|---|---|---|
  | Well | $12 | — | **Draw water** for you and nearby horses, and refills your canteen |
  | Cabin | $35 | — | **Sleep** (opens the bed sleep menu, which autosaves) |
  | Garden | $10 | well | 3 carrots and 2 apples a day |
  | Coop | $8 | cabin | 2 eggs a day |
  | Stable | $30 | well | Once a day, horses near you are fully fed, watered and rested |
  | Pasture | $70 | stable | 0.25 steer bill and 2 hay a day |

- **Produce** accrues daily up to a cap. Collect it at the plot.
- **Tax:**
  - Tax is charged every morning.
  - If you can't pay, it becomes arrears.
  - Produce stops once arrears exceed 7 days of tax.
  - You can't build while you owe tax.
  - Settle tax at a land office.
- **Other money sinks** were already in the game: horse tack, clothing (the tailor's `customize`), stable and vet fees, and ammunition.

## 4. Formulas
All constants live in `BALANCE.jobs`, `BALANCE.trade` and `BALANCE.property`. All functions live in `systems/economy.ts`.

**Pay.**
```
pay = round2( basePay × payMultiplier )
basePay       = base + perUnit × units + perTile × tiles
payMultiplier = min(maxMul 1.9,
                skillMul × repMul × standingMul × demand × perf)
skillMul      = 1 + 0.08 × (skillLevel − 1)          skillLevel ∈ 1..6 → 1.00 … 1.40
repMul        = clamp(1 + 0.005 × factionRep, 0.80, 1.25)
standingMul   = 1 + 0.01 × clamp(standing, −10, 20)  → 0.90 … 1.20
demand        ∈ [0.90, 1.15], rolled per offer per day
perf          = clamp(performance, 0.5, 1.2)
```

**Deliveries.**
```
deadline (game min) = grace[pace] + tiles × minutesPerTile[pace]
  normal: 25 + 0.40 × tiles
  express: 12 + 0.26 × tiles
performance  = on time: 1 + 0.15 × (1 − elapsed/limit)
               late:    1 − 0.30 × hoursLate
               (clamped; cancelled 6 h past the deadline)
```
- One game minute is one real second.
- A canter covers about 6.25 tiles/s, and the test checks that every route fits inside the deadline at a canter.

**Strike mini-game.**
```
gauge(t)    = (1 − cos(2π × 1.35 × t)) / 2
hit         = gauge ≥ 0.8
performance = clamp(hits / (hits + misses) × 1.2, 0.5, 1.2)
```

**Trade.**
```
buy  = list × shop.priceMul × regional × rep.priceMul
sell = list × shop.buyMul × regional × (1 − sat × 0.85) × (2 − rep.priceMul)
       capped at 0.9 × buy when the shop stocks it
regional = trade good: 0.70 produced / 1.45 scarce / 1.00 else
           ordinary:   1.10 sierra & drylands, 1.15 pelts in blackwater, else 1
```

**Hourly rate** (balance target, `hourlyRate`):
```
($ per real hour) = (pay + externalPay) / expectedMinutes × 60
expectedMinutes   = template.minutes (+ 0.35 min per 100 tiles for deliveries)
```

**Rates at skill 1, reputation 0, standing 0, demand 1, perf 1** (mid-size offer; deliveries at 220 tiles):

| Template | Risk | Pay $ | + external | Minutes | $/hour |
|---|---|---|---|---|---|
| cattle_drive (5 steers) | honest | 0.85 | — | 4 | 12.8 |
| mend_fences (4) | honest | 0.60 | — | 3.5 | 10.3 |
| feed_stock (3) | honest | 0.44 | — | 2.5 | 10.6 |
| freight | honest | 0.46 | — | 2.3 | 12.2 |
| mail_run | honest | 0.44 | — | 2.3 | 11.6 |
| ore_contract (5) | honest | 0.65 | — | 3.5 | 11.1 |
| lumber_contract (5) | honest | 0.70 | — | 3.5 | 12.0 |
| harvest_wheat (8) | honest | 0.55 | — | 3 | 11.0 |
| fish_trout / fish_bass (7) | honest | 1.37 | — | 6.5 | 12.6 |
| bartend (5) | honest | 0.40 | — | 2 | 12.0 |
| smith_helper | honest | 0.30 | — | 1.8 | 10.0 |
| strongbox | risky | 2.08 | — | 3.8 | 33.1 |
| hunt_deer / hunt_coyote | risky | 5.90 / 7.00 | — | 7 | 51 / 60 |
| break_colt | risky | 0.60 | 7 | 3 | 152 (one session per game day) |
| hunt_wolf | dangerous | 10.00 | — | 9 | 67 |
| bounty_petty / bounty_gang | dangerous | 4 / 8 | 15 | 8 / 10 | 143 / 138 |

- **Honest work.** Every honest template stays within **$5–15/h** for every quantity it can roll and every route it can draw. A unit test enforces this.
- **Risky and dangerous work.** All of it pays above $15/h, and dangerous work pays more than risky on average. Daily slots and caps limit how much of it there is.
- **A day of honest work.** One game day is 24 real minutes. Five or six honest jobs earn about $3–5, enough for a room, meals, feed and ammunition.

**Homestead.**
```
daily: due = taxPerDay + arrears
       paid in full if money ≥ due, else everything you have goes to tax and the rest becomes arrears
       produce += perDay (≤ cap) while arrears ≤ 7 × taxPerDay
payback = (plot + every upgrade) / (produce value per day − tax) > 30 days   (tested)
```

## 5. Edge Cases
- **No room for cargo.** You can't take the job: "You need X kg free". The cargo weight is checked before it is handed over.
- **Cargo in saddlebags.** Only the satchel counts at delivery or hand-over. The hint says so.
- **Wrong tool.** Lumber, ore and fishing contracts can't be taken without an axe, pick or rod. Dig ore without a pick shows a disabled prompt with a hint. Fell timber without an axe is hidden, so every tree doesn't nag.
- **Wanted.** Bounty jobs are refused while you are wanted in the current region.
- **Disgraced.** Honest work is refused below −60 honor.
- **Killing the bounty first.** Outlaws spawn already hostile, so shooting one first is not murder.
- **Strongbox ambush.** Road agents spawn outside town only. Bandits more than 900 px away despawn when the job ends.
- **Steers despawned or killed.** They count as lost. If no steer is penned, the job fails. A partial drive pays penned ÷ total. After a reload, the remaining steers respawn.
- **Reload during a job:**
  - Deliveries, gather contracts, chores and bounties persist, and the waypoint is restored.
  - The colt session and the bar shift do not survive a reload, so the job is dropped without penalty.
  - The bounty outlaw re-spawns on approach unless he is already dead (`npcMemory`).
- **Esc during a bar shift** ends the shift: you are paid for the orders served, or the job fails if you served none.
- **The last strike's E** does not fire the prompt underneath it. Interactions stay suppressed for 0.35 s.
- **Race running.** Chore flags don't overwrite race checkpoint flags (`raceMarkers` is shared).
- **Board in a settlement without a suitable building.** No board is posted; the settlement is not a delivery destination.
- **Taxes unpaid.** Produce stops past the grace period. A notification fires each day while arrears remain. You can't build improvements until you pay.
- **Old saves.** Missing `jobs` or `economy.property` keys default to empty. Item-only saturation keys are dropped.

## 6. Dependencies
- **Reads:**
  - Skills (`player.skills.level`) and reputation (`rep.get`)
  - Clock (`clock.minutes`, `clock.day`)
  - `world.objAt` / `findNear` / `blockedPx`, `buildingsOf`, `corrals`
  - `law.isWanted` / `inTown`, `quests.state`
- **Uses:**
  - `ui.choice`, `notify`, `ui.setFishing` (the strike meter), `ui.openSleep`
  - `raceMarkers` (flags), `waypoint`
  - `startRanchWork` + `taming` (colt), `turnInBounty` (`captured_<id>` flag)
  - the `npcKilled` bus event
  - `giveItem`, `advanceTime`
  - `spawner.findSpawnPoint`, `Npc`, `Animal`
- **Wiring:**
  - `game.ts`: construct, `update`, `daily`, save and load.
  - `interactions.ts`: interactions are suppressed while `jobs.busy`. Two prompt hooks: **Ask for work** on NPCs, and `jobs.worldTarget()` in world prompts.
- **Data:**
  - `data/items.ts`: axe, 8 trade goods, eggs, 3 cargo items
  - `data/shops.ts` (read only; trade posts are layered on at runtime)
  - `data/world.ts` (`SETTLEMENTS`)

## 7. Tuning Knobs
Each knob has a safe range. The unit tests re-check the honest-wage band after any change.

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `jobs.skillStep` | 0.08 | 0.04–0.12 | How much practice raises wages (×1.2–×1.6 at skill 6) |
| `jobs.repStep` / `repMin` / `repMax` | 0.005 / 0.8 / 1.25 | 0.003–0.008; 0.7–0.9; 1.1–1.35 | How much a faction's opinion of you moves pay |
| `jobs.standingStep` / `standingMax` | 0.01 / 20 | 0.005–0.02; 10–30 | Loyalty bonus for working one town |
| `jobs.maxMul` | 1.9 | 1.5–2.2 | Ceiling on late-game wages, so honest work never outpaces risky work |
| `jobs.demandMin` / `demandMax` | 0.9 / 1.15 | 0.8–1.0 / 1.05–1.3 | Day-to-day variety of offers |
| `jobs.perfMin` / `perfMax` | 0.5 / 1.2 | 0.3–0.7 / 1.1–1.3 | Reward for doing a job well |
| `jobs.deliveryGrace` / `minutesPerTile` | 25 + 0.40 normal; 12 + 0.26 express | normal ≥ 0.3/tile; express ≥ 0.2/tile | Tightness of deadlines. Below these, a canter can't make every route. |
| `jobs.earlyBonus` / `latePenaltyPerHour` / `lateCutoffHours` | 0.15 / 0.3 / 6 | 0–0.3 / 0.15–0.6 / 3–12 | Pressure to ride hard |
| `jobs.strikeSpeed` / `strikeSweet` | 1.35 / 0.8 | 0.9–2.0 / 0.7–0.9 | Mini-game difficulty. The sweet window must stay above 0.1 s (tested). |
| `jobs.strikeMissAllowance` | 3 | 1–5 | Forgiveness before a task is botched |
| `jobs.taskMinutes.*` | 5–30 | 5–60 | Game time a task takes (needs and the clock advance) |
| `jobs.herdPull` / `penRadius` | 0.55 / 44 | 0.3–0.9 / 32–64 | How easy steers are to drive (playtest) |
| `jobs.ambushWindow` | 0.3–0.7 | within 0.15–0.85 | Where on the route road agents strike |
| `jobs.bountyDeadMul` | 0.5 | 0.3–0.8 | Incentive to bring outlaws in alive |
| `jobs.minHonor` | −60 | −80 to −40 | When honest employers stop hiring you |
| `trade.producedMul` / `scarceMul` | 0.7 / 1.45 | 0.6–0.85 / 1.2–1.7 | Profit per trade run (must keep Ashby → Sulfur Flats whiskey profitable) |
| `trade.saturationPerSale` / `tradeSaturationPerSale` | 0.06 / 0.12 | 0.03–0.1 / 0.08–0.2 | How fast dumping goods in one region hurts |
| `trade.saturationDepth` / `saturationRecovery` | 0.85 / 0.25 | 0.5–0.9 / 0.1–0.5 | Floor price of a flooded market, and recovery per day |
| `trade.maxResaleRatio` | 0.9 | 0.7–0.95 | Anti-arbitrage cap. It must stay below 1. |
| `property.arrearsGraceDays` | 7 | 3–14 | How long produce keeps coming while you owe tax |

Content knobs live in `data/jobs.ts`:
- per-template pay, minutes, quantities, deadlines and risk
- board slots and templates
- `OCCUPATION_WORK`, `BOUNTY_CAMPS`, `BAR_ORDERS`
- `WORK_ACTIONS` (strikes, yield, daily caps)
- `TRADE_GOODS`, `TRADE_POSTS`, `PLOTS`, `UPGRADES`

## 8. Acceptance Criteria
- [x] At skill 1, every honest template earns $5–15 per real hour for every quantity and route it can roll. Risky and dangerous templates earn more than $15/h. (unit test)
- [x] Board offers are identical within a day, rotate the next day, respect slots, never repeat a template, and keep deliveries in range. (unit test)
- [x] Pay multipliers clamp at their documented limits, and their product never exceeds `maxMul`. (unit test)
- [x] Delivery performance is 1.15 at instant delivery, 1 at the deadline, 0.7 one hour late, and floored at 0.5. Every board route fits the deadline at a canter. (unit test)
- [x] Labour contracts beat the local market. Fish contracts are a floor that beats a flooded market. Hunting contracts pay at least list price. (unit test)
- [x] Hauling whiskey from Ashby to Sulfur Flats is profitable. No shop buys back its own stock for more than 90 % of its price, at any honor. Every region has a buyer for trade goods. Saturation is regional. (unit test)
- [x] Homestead tax, arrears, produce caps and the produce stop work as specified. Payback takes more than 30 days. (unit test)
- [x] All job, trade and property data references exist. (unit test)
- [x] An end-to-end scene, run with the real UI and input:
  - Take freight from the Larkspur board through its buttons, deliver it at the destination with **E**, and get paid.
  - Dig ore with real key presses timed to the gauge.
  - Pen a cattle drive at Brannigan and get paid.
  - Buy a plot and build on it; produce shows on the plot prompt.
  - Show chore flags with the strike meter.
  - Evidence: `production/qa/evidence/economy-jobs/jobs-loop-scene.png`
- [x] A second scene covers the bar shift, a bounty (spawn → kill → claim), a save/load round trip in the middle of a job, and a whiskey trade.
- [ ] Playtest: herding steers by riding alone, without scripted help, takes about 3–5 minutes. Tune `herdPull` and `penRadius` from that playtest.
- [ ] Render team: a notice-board prop at each board door, and homestead props per upgrade (see the report's wiring requests).
