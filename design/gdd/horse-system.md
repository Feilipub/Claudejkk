# Horse System — GDD

> The horse is one of the main characters of the game.

## 1. Overview
- Every horse in Calder Territory is a simulated individual. That covers wild mustangs, trader stock, NPC mounts and your own.
- Each horse has:
  - **From its breed:** a statistical profile.
  - **Its own:** inherited genetic variation, a coat and markings, one or two personality traits, preferences, training, and needs that change over time.
  - **Health:** injuries that heal slowly.
  - **Its life with you:** a bond that grows from how you treat it, and a written life history.
- **Systems the horse drives:**
  - Riding: momentum-based gaits.
  - Autonomous behaviour when unridden: a utility AI.
  - The economy: appraisal-based prices.
  - Story: the starter-horse choice, stolen Brannigan horses, the Pale Mare and the Sayen mares.

## 2. Player Fantasy
- You learn one animal's quirks until you can predict it: the nervous Thoroughbred that flinches at gunfire, or the lazy Belgian that will not be hurried.
- You earn its trust through daily care and shared danger, then feel the payoff. It comes from farther away when you whistle, holds steady when wolves circle, and lets you gallop it hard knowing it will not quit on you.

## 3. Detailed Rules

### 3.1 Breeds (data/breeds.ts)
- 13 breeds: Quarter Horse, Thoroughbred, Arabian, Frontier Mustang, Appaloosa, American Paint, Tennessee Walker, Morgan, Missouri Fox Trotter, Andalusian, Belgian Draft, Shire and Borderland Criollo.
- Each breed defines:
  - 16 stats on a 1–10 scale: speed, acceleration, stamina, recovery, agility, handling, jumping, endurance, strength, courage, responsiveness, health, carry, trail, temperament, comfort.
  - Body type: light, stock, gaited, draft or pony. This drives sprite proportions and gait speeds; gaited breeds walk and trot faster.
  - Height range.
  - Base price and commonness.
  - Coat and pattern weights.
  - Trait biases.
  - Home regions, and whether the breed appears wild.
- A unit test enforces that every breed has a unique stat profile.

### 3.2 Individuals (horse/generator.ts)
- Each stat gets a genetic multiplier with mean 1.0 and standard deviation 0.045, clamped to 0.88–1.12.
- Each horse also gets:
  - Age (3–16 years), sex, coat (18 colours), pattern (9 types) and face/leg markings.
  - Mane and tail style and length.
  - 1–2 personality traits, never a conflicting pair.
  - A favourite food and a dislike: water, night, crowds, gunfire, dogs or none.
  - Training in five areas: groundwork, saddle, speed, jumping and desensitisation.
- Generation is deterministic per seed.

### 3.3 Personality (data/personalities.ts)
- 12 traits: calm, nervous, curious, aggressive, stubborn, loyal, energetic, lazy, social, independent, fearful and brave.
- Each trait sets 12 mechanical modifiers: fear, stamina drain, recovery, bond gain, obedience, wander tendency, follow slack, aggression, loneliness stress, speed, calm rate and affection.
- Examples:
  - **Nervous** horses gain stress from threats at 1.7× and spook more.
  - **Lazy** horses burn 18% less stamina but are slow and sometimes ignore your heels.
  - **Loyal** horses bond 30% faster, come from 30% farther, and run *to* you when frightened at bond 4 or higher.
  - **Social** horses get stressed when left alone.
  - **Stubborn** horses train at 60% speed.

### 3.4 Needs and care (horse/care.ts)
- **Needs, per game hour:**
  - Hunger falls by 2.2. Grazing restores 22 per hour.
  - Thirst falls by 3.2, 1.6× faster above 85°F.
  - Energy is the long-term fatigue reserve. Rest restores it.
  - Stress decays at a rate set by the calm trait.
  - Cleanliness and hoof condition wear with distance; unshod hooves wear faster on rough ground.
- **Effects of neglect:**
  - Low hunger or thirst shrinks maximum stamina and slows regeneration.
  - Starvation damages health.
  - Cold below 22°F felt temperature raises stress and drains energy. Blankets and shelter raise the felt temperature.
- **Care actions** (contextual, each with its own preconditions): pet, calm, feed (any horse food, favourite food counts double), water, brush, clean hooves, treat injuries (liniment for legs, ointment or bandage for wounds), tie or untie at hitching posts, lead, and saddlebags.

### 3.5 Injuries
- Seven kinds: cut, limp, strain, bruise, stone bruise, gunshot and colic. Each has a severity from 0 to 100.
- **Causes:**
  - Galloping on rough ground (risk scales with the horse's trail stat and shoes).
  - Downhill stumbles at a gallop.
  - Crashing into obstacles.
  - Predator attacks.
  - Gunfire.
  - Overexertion from forcing an exhausted horse.
- **Effects:**
  - Leg injury above 15 caps the gait at canter; above 30, trot; above 55, walk.
  - Total injury load lowers speed, jumping and value.
  - Untreated cuts and gunshot wounds bleed health.
- **Healing:**
  - Untreated injuries heal at 2 per hour, treated ones at 6.
  - Stabling triples the rate, rest gives ×1.5, and poor nutrition gives ×0.3.
  - Injuries never heal instantly. Even the vet service only reduces severity to 30% and marks the injury treated.

### 3.6 Bonding (horse/bonding.ts)
- **Levels:**
  - Five levels: Wary, Familiar, Trusting, Devoted, Kindred.
  - Level thresholds are 0, 120, 340, 700 and 1250 XP.
- **What gives XP:** pet, calm, brush, feed, favourite food, water, hooves, treating injuries, each km ridden (scaled by comfort), each hour together, surviving stress, training, shelter, and a well-cared-for day.
- **Spam control:**
  - Repeating an activity more than twice in one game day multiplies its XP by 0.35^n.
  - XP is also scaled by trust (0.5–1.5×).
  - A test shows that 500 pets in one day cannot pass level 2.
- **What removes XP and trust:**
  - Starvation, dehydration, exhaustion and overexertion.
  - Falls and hitting.
  - Abandonment in storms, and firing next to its head.
  - A daily neglect review.
- **What bond affects:**
  - Obedience (+0.07 per level).
  - Turn rate (+4% per level).
  - Stamina drain (−3% per level).
  - Fear (−6% per level).
  - Rein lag (−0.015 s per level).
  - Whistle range: 180, 320, 520, 820, then 1400 px.
  - Whether it comes when called.
  - Holding its ground against threats at bond 3+, and running to you at bond 4+ (loyal).
  - Knowing its favourite food at bond 2 and its dislike at bond 3.

### 3.7 Behaviour AI (horse/brain.ts)
- **Interrupt layer:**
  - **Threats** (predators by species horse-fear, gunfire, thunder): the horse flees, spooks (rears) or warily watches. The choice depends on fear × threat and on bond near its owner.
  - **Tied:** the horse grazes or stands, and pulls at the rope when spooked.
  - **Whistle:** an obedience roll, then the horse comes at a gait matched to distance.
  - **Lead:** the horse follows at a walk or trot.
- **Utility layer:** graze, drink (goes to visible water), rest, sleep (night), idle, wander (curious horses more), investigate, socialise (social horses), shelter (storms), follow its owner (bond 2+), and herd (wild horses follow the stallion).
- **Movement:** local steering avoids obstacles, cliffs and deep water.

### 3.8 Riding (entities/horse.ts)
- **Gait controls:**
  - Four gait levels (walk, trot, canter, gallop) plus halt and rein-back.
  - Shift raises the gait level; at a gallop it is a spur burst costing stamina and trust. Ctrl lowers the gait level.
- **Momentum:**
  - Acceleration and deceleration come from the acceleration and strength stats.
  - Turn rate interpolates between slow and fast values from agility, handling gear and bond.
- **Rein lag:** steering input is applied after a delay set by responsiveness and bond.
- **Terrain:**
  - Ground speed × the horse's trail stat × shoes.
  - Uphill slope slows the horse and drains stamina; downhill is slightly faster but carries stumble risk.
  - Shallow water slows; deep water means swimming with a stamina drain.
  - Water-shy horses balk at the water's edge.
- **Stamina:**
  - Regenerates at walk and halt, holds at trot, drains at canter and gallop. Rates come from the gait table, endurance, traits, saddle and bond.
  - An exhausted horse drops to a trot. Forcing it costs health and bond and risks a strain.
- **Jumping:**
  - Space at a trot or faster.
  - Clears fences, logs and hay bales, with a success chance from the jump stat, training, bond and obedience.
  - A refusal stops the horse dead and can throw the rider.
- **Fear while ridden:** at stress above 70, the horse may spook and rear (possible throw) or bolt. Calming it with Ctrl or E succeeds based on bond.
- **Bucking:** horses with low saddle training buck.
- **Crashes:** hitting a solid object above canter speed causes stress, possible injury and a possible fall.
- **Mounted combat:** firing is allowed from the saddle, with extra spread. Gunfire near the horse's head stresses it.

### 3.9 Equipment (data/items.ts → gear)
- **Slots:** saddle, bridle, blanket, bags, shoes, bedroll and decoration.
- **Gear effects:** stamina drain and regeneration, speed (racing saddle), comfort, carry, terrain (shoes), handling (bridle) and warmth (blankets).
- **Wear:** condition drops per km. Worn gear loses up to half of its benefit. A smith or stable can mend it.
- **Customisation:** mane style, tail style, mane length and name, at stables.
- **Visuals:** the sprite shows saddle, blanket colour, bags, bedroll, bridle, conchos and ribbons.

### 3.10 Economy
- **Asking price:**
  - Starts from the breed base and is scaled by age, health and injuries, training, temperament, genes, coat and pattern rarity, stallion premium, tameness, and tack value.
  - Then scaled by the regional market (local breeds are cheaper, plus a price drift every 3 days), reputation, and the trader's markup (1.25×).
- **Sale offer:** 0.55× of the asking price, or 0.22× for stolen horses (which also costs honor).
- **Trader stock:** traders keep seeded inventories that restock and stand physically in corrals, so you can inspect them before buying.
- **Other ways to get a horse:** wild herds tamed with the lasso, story horses, and rental hacks.

## 4. Formulas (selected)
- `maxStamina = 100 × (0.55 + stamina × 0.09) × ageFactor × (1 + speedTraining/400) × (0.55 + 0.45 × energy/100) × (hungry/thirsty ? 0.75 : 1)`
- `gallop px/s = 150 × (0.6 + speed × 0.08) × age × traitSpeed × gearSpeed × condition × (1 − min(0.5, legInjury/160)) × (1 + speedTraining/600)`
- `obedience = clamp(0.35 + handling × 0.025 + bond × 0.07 + groundwork/500 + saddle/500 + traitObedience − stress/400 + (trust − 50)/500, 0.05, 1)`
- `fear = traitFear × (1.6 − courage × 0.1) × (1 − desensitised/250) × (1 − (bond − 1) × 0.06)`
- `bondXP = base × scale × 0.35^max(0, repeats − 1) × traitBondGain × (0.5 + trust/100)`

All constants live in `data/balance.ts`.

## 5. Edge Cases
- **Horse dies:** for example from gunshot damage. Its history is recorded and the main horse is reassigned.
- **Whistling from more than 2500 px away:** the horse "makes its way" and is placed near you, untied.
- **Rental horse:** returned automatically after its due day, once you own a real horse.
- **Lassoed wild horse dragged more than 140 px:** the rope breaks.
- **Breaking a wild horse with tameness under 40:** the horse rears and refuses.
- **Mounting someone else's horse:** reported as horse theft, and the horse becomes "stolen".

## 6. Dependencies
- World: terrain, slope, water and shelter.
- Weather: temperature, storms and thunder.
- Wildlife: predators.
- Combat: noise and damage.
- Law: horse theft.
- Economy.
- Quests: lead and bond objectives.
- Save.
- UI: horse screen and HUD cores.

## 7. Tuning Knobs
- In `data/balance.ts`: gait speeds and stamina rates, need decay rates, bond thresholds and activity XP, diminish factor, penalties, whistle ranges, trader markup and buyback.
- Breed and trait tables are pure data.

## 8. Acceptance Criteria
All automated, and passing:
- 12 horse unit tests and 7 brain tests: determinism, distinct breeds, no conflicting traits, breed performance differences, personality fear differences, diminishing bond, spam cap, mistreatment, injuries limit gait and heal slowly (faster when treated), needs decay, favourite-food bond, appraisal, grazing, drinking, flight from threats, whistle obedience by bond, tied horses don't wander, storm shelter.
- End-to-end checks: mount and gallop, care actions and flags, horse screen, lasso, calm, break and own a wild mustang.
