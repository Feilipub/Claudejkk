# Wild Frontier — Story Outline

> Canon level: **Established** for the main-quest beats and quest ids, which
> match `src/data/story/quests.ts`. **Provisional** for the epilogue tone notes.

## Premise

April 1888. A former Army remount wrangler answers a letter from their uncle,
horse rancher Silas Brannigan, asking for help with the spring drive. They
arrive to find empty corrals, a wounded foreman and Silas missing. Tracking the
stolen horses uncovers a land agent who forged a railroad survey to take the
Calder River away from the ranchers in a drought year. He paid outlaws to make
the ranchers sell. The protagonist finds the honest surveyor and the wounded
uncle, then has to decide who should hold the truth.

**It is a story about stewardship, not revenge.** The protagonist rescues
someone. They don't avenge anyone.

## Themes

1. **Paper vs. custom.** Ranchers shared the Calder "by the bucket" in 1871.
   Vance takes it with a forged plat. The Sayen kept their 1886 agreement in
   ink, and the railroad didn't. Every ending is about which paper wins.
2. **Care is the hero's skill.** The game's core verb, caring for a horse,
   mirrors the story's: earning trust slowly, standing still when things are
   frightening, never forcing it.
3. **No clean choices.** The press ending helps the ranchers and brings the
   railroad to the Sayen door. The law ending is slow and lets the company
   escape. The bribe ending protects one ranch and sells out the rest.
4. **Ordinary decency in compromised people.** Whitlock is tired, not bought.
   Abernathy confesses. Benito repays. Kessler leaks. Finch can be spared.

## Tone

Grounded, humane and morally grey, with dry humour. Most lines carry a small
joke or an understatement. Violence is sudden and has weight. Nobody
monologues.

## Structure

### Chapter 1 — `main_arrival` "A Letter from Larkspur" (Dustfall)
- **Beats:** Arrive in Larkspur and meet Josiah, who lends a rental Morgan called
  Biscuit. Ride to the ranch and meet Hollis, who explains the rustling, the
  fight at the freight wagon on March 29 and Silas riding after the thieves.
  **Choose a horse:** Juniper (steady quarter mare), Absalom (clever, stubborn
  Appaloosa) or Ransom (green-broke mustang stallion). Care tutorial: brush,
  feed, water. Hollis hands over Silas's spare tack.
- **Purpose:** Teach horse care and bond, and set up the mystery: "Wolves
  don't take halters."
- **Flags:** `starter_horse_chosen`, `starter_horse` = juniper / absalom /
  ransom.

### Chapter 2 — `main_tracks` "Empty Corrals" (Dustfall → Redstone)
- **Beats:** The burned M&W freight wagon yields a requisition for "remount
  stock" initialled E.V. At Fort Rourke, Lt. Abernathy confesses he bought
  re-branded Brannigan horses from "Hadley Remount Co." and gives a copy of the
  bill. The trail leads to **Coyle's Roost** (fight optional). Young rustler
  Tobias Finch surrenders. He tells the player that Silas was shot and fled
  **north**, and that Coyle answers to "the railroad man".
- **Finch choice:** spare him (`finch_spared`), send him to the fort to confess
  (`finch_turned_in`), or send him to warn Coyle (`finch_messenger`).
- **Close:** Lead two stolen horses home and report to Hollis, who remembers
  the surveyor, Pruitt.

### Chapter 3 — `main_surveyor` "The Surveyor's Notebook" (Blackwater → Redstone)
- **Beats:** Cordelia Fontaine at the *Clarion* explains the survey that bears
  Pruitt's name but not his route. At his burned camp a note reads "Gone to the
  saints. Bring water. Beans if you love me." The player finds Pruitt starving
  at Mission San Isidro, brings him water and beans, and wins his trust. Pruitt
  hands over his 1885 field book.
- **Tone beat:** Pruitt is comic and frightened, a brave man only in theory.
  He refuses to come to town: "If it's you, send a buggy."

### Chapter 4 — `main_highcountry` "Snow on the Pass" (Sierra)
- **Beats:** Abel Musgrave at Whitepeak sent Coyle's trackers the wrong way and
  points the player to Hollow Crown. **Reunion with Silas**, alive and
  stubborn, being looked after by Minerva Lindqvist. Silas tells what he saw:
  Vance paying Coyle ("Nine ranches, Dutch. Not eight."). He hands over the
  affidavit Minerva made him write. He won't come down yet. "You carried it.
  You choose. I'll argue with you after."
- **Practical beat:** A heavy horse blanket, from Musgrave's shop or Minerva's
  second-best.

### Chapter 5 — `main_reckoning` "The Reckoning" (Blackwater → Dustfall)
- **Decision (in Port Ashby):** The choice sets `reckoning_choice` plus one
  ending flag.

| Choice | Flag | Immediate consequences | Aftermath stage |
|---|---|---|---|
| **Marshal Kincaid** | `ending_law` | Honor +10, ranchers +10, railroad −10 | `law_warrant`: serve the warrant on Vance at the depot (`vance_arrested`). Vance offers $1,000 at the last moment. |
| **Cordelia Fontaine** | `ending_press` | Honor +5, ranchers +10, townsfolk +10, railroad −25 | `press_sayen`: Cordelia won't print the Sayen side from a railroad copy, so the player rides to Tolani for the council's statement. Tolani: "The only choice anyone offers us is which kind of trouble." Vance flees east. |
| **Ellery Vance** | `ending_bribe` | +$500, honor −25, ranchers −20, coyle +10, railroad +15 | `bribe_ranch`: face Hollis. Telling him the truth costs less than lying. |

- **Showdown (`showdown`):** In every branch Dutch Coyle waits on the Brannigan
  porch eating Mateo's biscuits. His reason differs by branch:
  - *Law:* his paymaster is jailed and the lawyers have "decided he doesn't
    exist". He's unemployed and in your yard.
  - *Press:* the *Clarion* called him "of no particular distinction", and he
    takes it personally.
  - *Bribe:* Vance wired him "loose end, tidy". He was paid to kill the player.
    The bribe is what makes you a target.
  - If `finch_messenger` is set, Dutch mentions the message.
  - Dutch never draws early and asks for "civilised". The duel is won when
    `duel_won_dutch_coyle` is set. Then `silas_home` is set.
- **Epilogues (talk to Silas at the ranch house):**
  - **`epilogue_law`:** "Nothing's won. Everything's stopped. At my age that's
    the same thing." Silas offers a partnership on the deed (`ranch_partner`).
    Pruitt gets his buggy and testifies. Abernathy volunteers as a witness.
    The grant is frozen pending resurvey. The company escapes and Vance
    doesn't.
  - **`epilogue_press`:** The *Clarion* prints three runs and M&W stock falls
    nine points. The line must go north along the treaty boundary. The Sayen get
    their fee and siding, plus survey crews, timber men and whiskey sellers.
    Mareh: "A neighbour you can sue is better than a stranger you can't." Tolani
    wants a Pale Mare colt. Partnership is offered. Vance is never tried.
  - **`epilogue_bribe`:** Silas: "I keep the ranch and I lose the valley." The
    player can defend the choice, refuse to explain (Silas: "I won't air it
    again"), or give $400 of the hush money to clear the Halvorsens' note
    (`bribe_returned`). That doesn't fix it, but it's "a start of fixing". Ranches
    sell over the next two years. Pruitt is put on a train east.
  - Whatever the ending, if `finch_spared` is set, Finch's letter from Cedar
    Notch arrives (`doc_finchLetter`).

## Character Arcs

| Character | Arc |
|---|---|
| **Protagonist** | Arrives done with "other men's horses" and ends deciding what a family, a ranch and a valley are worth. The bond with their horse runs alongside the bond with Silas. |
| **Silas** | Goes from proud self-reliance (he rode out alone, hid alone) to accepting help and offering partnership. In the bribe ending, to a quiet heartbreak he refuses to turn into hatred. |
| **Hollis** | Goes from guilt at obeying the order to stay behind to defiant loyalty. He is the player's mirror in the bribe ending. |
| **Pruitt** | A coward in practice who became brave by refusing to sign. He ends either testifying or exiled. |
| **Abernathy** | From complicity by convenience to confession at the cost of his career. |
| **Tolani** | Starts with a commercial pragmatism that keeps her Sayen loyalty quiet. In the press ending she has to own a hard trade-off in public. |
| **Vance** | Doesn't change, which is the point. He is "an accountant with a better tailor". |
| **Dutch Coyle** | Wanted respectability more than money and dies in a yard he coveted. |
| **Finch** | Can become a logger who sleeps fine. |

## Side Quests

| Id | Title | Giver / Region | Summary & choice | Reward |
|---|---|---|---|---|
| `side_larkspur_cup` | The Larkspur Cup | Josiah / Dustfall | Pay $5, win race `larkspur_cup`. | $50, decorRibbon |
| `side_ashby_derby` | The Ashby Derby | Benito / Blackwater | Pay $10, win race `ashby_derby`. | $120, bridleSilver |
| `horse_pale_mare` | The Pale Mare | Gideon / Dustfall | Find the legendary white mustang on Mustang Flats and lead her to the ranch. **Choice:** keep her as your own green horse, give her to the ranch as a broodmare (ranchers +10), or free her (honor +10). | sugar cubes |
| `hunt_whitepeak_wolves` | Wolves at Whitepeak | Musgrave / Sierra | Hunt 3 wolves. The rest of the pack is let go. | $30, blanketHeavy |
| `delivery_cedar_medicine` | Doctor's Orders | Okafor / Pine Hollow | Deliver tonic and bandages to Rolf. **Choice:** persuade him to rest (honor) or let him work (`rolf_works`). Okafor's reaction differs. | $15, tonics |
| `side_halvorsen` | Four Dollars an Acre | Ingrid / Dustfall | Townsite man Haskett pressures the farm. **Choice:** negotiate (needs Chapter 3 done or honor ≥ 20), threaten (needs notoriety ≥ 25), bluff (fails), or fight (`enc_halvorsen_agents`). Nils is shaken by the fight path. | $20, bread |
| `bounty_pike` | Wanted: Rattler Pike | Whitlock / Drylands | Kill Pike at `enc_pike`. **Optional:** give $50 to the murdered driver's family. Pike's death restores coin pay at the Flats (Li Wen and Mulroney react). | $200 |
| `horse_sayen_mares` | Condemned Stock | Tolani / Pine Hollow | Recover two Appaloosa mares the Agency trader falsely condemned. A non-Sayen recovery keeps the army from hearing "uprising". Unlocks `stable_sayen`. Follow-up: Benito can repay the four mares he sold. | $40, sayen +20 |
| `side_lost_pony` | Clementine | Tilly / Dustfall | Find a child's pony after a storm and lead her home. | apples, honor +5 |
| `side_pettibone_hides` | Hides for Pettibone | Pettibone / Dustfall | Deliver 3 deer pelts. **Choice:** take coin, credit the Halvorsen account (honor), or credit Silas's account. | $12 (+$6 coin option) |
| `treasure_ketterman` | Widow Ketterman's Silver | Vogel / Drylands → Redstone | Read her daybook at the claim and find the cache at the leaning rock by the Roost. **Choice:** send Hester all ($120), half, or none. | gold, silver ore, $120 |

## Optional Investigation Threads (dialogue-driven)

- **Mrs. Crane's register** places Vance in Larkspur on March 28.
- **Dr. Okafor's bullet** carries an M&W paper patch, the kind issued to
  company guards.
- **Gatlin and Voss** link Army-pattern shoes to Ned Tarrant, who paid in
  railroad scrip.
- **Ingram** has sold 40 rifles charged to the "Right-of-Way Account, Special".
- **Celeste** saw Vance pay a man with a crooked tooth.
- **Kessler's telegram** copy reads "NINE NOT EIGHT … BRANNIGAN FIRST".
- **The hermit's confession** reveals the burned stakes. The Eagle Rock stake
  survives.

None of these are required. Together they let a curious player solve the
mystery before Silas confirms it.
