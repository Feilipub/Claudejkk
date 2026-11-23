/**
 * Main and side quests. Journal entries are the protagonist's diary: first
 * person, never naming themselves. Coordinates are tile positions.
 */
import type { QuestDef } from '../schema.ts';

export const QUESTS: QuestDef[] = [
  // =========================================================================
  // MAIN 1 — A Letter from Larkspur
  // =========================================================================
  {
    id: 'main_arrival',
    title: 'A Letter from Larkspur',
    kind: 'main',
    giver: 'josiah',
    region: 'dustfall',
    summary: 'Uncle Silas wrote asking for help with the spring drive. Get to the Brannigan ranch and find out why the letter sounded worried.',
    autoStart: { not: { flag: 'disabled_main_arrival' } },
    stages: [
      {
        id: 'livery',
        journal:
          'April 3rd, 1888. Larkspur. Off the train with a saddle on my shoulder and Silas\'s letter in my coat. Thirty-one head gone since Christmas, he says, and wolves don\'t take halters. He says Josiah Oakes at the livery will see me mounted. I hope Josiah owns something better than the horse I was imagining.',
        onEnter: [{ lore: 'doc_silasLetter' }],
        objectives: [{ id: 'josiah', type: 'talk', target: 'josiah', text: 'Find Josiah Oakes at the Larkspur Livery', x: 372, y: 382 }],
        next: 'ride_ranch',
      },
      {
        id: 'ride_ranch',
        journal:
          'Josiah lent me a Morgan called Biscuit who has the temperament of a church pew and roughly its speed. He says Silas has not been to town in a week, which is not like him. The ranch is south-west along the river road.',
        objectives: [{ id: 'ranch', type: 'goto', text: 'Ride to the Brannigan Horse Ranch', x: 296, y: 436, radius: 8 }],
        next: 'foreman',
      },
      {
        id: 'foreman',
        journal:
          'The corrals are near empty. There should be fifty head on this place in April. There is a man on the porch with his arm in a sling and a rifle across his knees.',
        objectives: [{ id: 'hollis', type: 'talk', target: 'hollis', text: 'Speak with the foreman', x: 296, y: 436 }],
        next: 'choose',
      },
      {
        id: 'choose',
        journal:
          'Hollis Tolliver, foreman. Rustlers hit the place again on the 29th; he and Silas caught them at a freight wagon on the south road and there was shooting. Hollis took a ball in the arm. Silas rode after them alone and has not come back. Five days. Hollis says there are three horses left worth the name, and one of them is mine if I can sit it.',
        objectives: [{ id: 'pick', type: 'flag', target: 'starter_horse_chosen', text: 'Choose a horse from the ranch corral (talk to Hollis)', x: 296, y: 436 }],
        next: 'care',
      },
      {
        id: 'care',
        journal:
          'A horse that has been standing in a half-empty corral listening to gunfire for a week needs more than a saddle on its back. Brush, feed, water. Let it learn my hands before it has to trust them.',
        objectives: [
          { id: 'brush', type: 'flag', target: 'care_brushed', text: 'Brush your horse' },
          { id: 'feed', type: 'flag', target: 'care_fed', text: 'Feed your horse' },
          { id: 'water', type: 'flag', target: 'care_watered', text: 'Water your horse' },
        ],
        next: 'reward',
      },
      {
        id: 'reward',
        journal:
          'Hollis watched the whole business from the porch and pretended not to. I should tell him we\'re ready.',
        objectives: [{ id: 'hollis2', type: 'talk', target: 'hollis', text: 'Tell Hollis the horse is settled', x: 296, y: 436 }],
        onComplete: [
          { give: 'saddleStock' },
          { give: 'bridleSnaffle' },
          { give: 'bagsSmall' },
          { give: 'bedroll' },
          { give: 'hay', qty: 3 },
          { give: 'oats', qty: 3 },
          { give: 'carrot', qty: 5 },
          { notify: 'Hollis gave you a stock saddle, snaffle bridle, saddlebags, a bedroll and feed.' },
        ],
      },
    ],
    rewards: { money: 10, rep: { ranchers: 5 } },
  },

  // =========================================================================
  // MAIN 2 — Empty Corrals
  // =========================================================================
  {
    id: 'main_tracks',
    title: 'Empty Corrals',
    kind: 'main',
    giver: 'hollis',
    region: 'redstone',
    summary: 'Follow the stolen Brannigan horses from a burned freight wagon to wherever they ended up, and find out which way Silas went.',
    autoStart: { quest: 'main_arrival', state: 'completed' },
    stages: [
      {
        id: 'wagon',
        journal:
          'Hollis says the fight was at a freight wagon a couple of miles west on the south road. The rustlers set it alight when they ran. Burned wagons don\'t tell you much, but rustlers don\'t usually drive railroad freight wagons, either.',
        objectives: [{ id: 'wagon', type: 'discover', target: 'brokenWagon', text: 'Search the Burned Freight Wagon', x: 262, y: 432 }],
        onComplete: [{ give: 'wagon_manifest' }, { lore: 'doc_wagonManifest' }],
        next: 'fort',
      },
      {
        id: 'fort',
        journal:
          'A Meridian & Western requisition, half burned, for "remount stock", signed E.V. And a note about turning a Rocking B into a Diamond H. Remounts are what the cavalry buys. The nearest cavalry is Fort Rourke, down in Redstone. I know quartermasters. I know how badly they want horses in spring.',
        objectives: [{ id: 'abernathy', type: 'talk', target: 'abernathy', text: 'Ask the Fort Rourke quartermaster about remounts', x: 455, y: 572 }],
        next: 'roost',
      },
      {
        id: 'roost',
        journal:
          'Lt. Abernathy bought eleven head off a "Hadley Remount Company", three with Silas\'s brand botched underneath. He\'s ashamed of it, which is more than most officers would be. The broker\'s men came up from the box canyon south-east of the fort, the one the troopers call Coyle\'s Roost. Silas would have tracked them there. So will I.',
        onEnter: [{ spawnEncounter: 'enc_roost' }],
        objectives: [
          { id: 'reach', type: 'goto', text: 'Reach Coyle\'s Roost', x: 515, y: 690, radius: 14 },
          { id: 'rustlers', type: 'kill', target: 'coyle_rustler', count: 4, text: 'Deal with Coyle\'s rustlers', optional: true },
          { id: 'finch', type: 'flag', target: 'finch_decided', text: 'Question the rustler who surrendered', x: 517, y: 688, hidden: true },
        ],
        next: 'lead',
      },
      {
        id: 'lead',
        journal:
          'Silas was here. He was shot here. And he got away, north, toward the high country. The boy says Coyle answers to "the railroad man". There are Brannigan horses in the pen. They\'re coming home.',
        objectives: [{ id: 'lead', type: 'lead', target: 'brannigan_stolen', count: 2, text: 'Bring the stolen Brannigan horses home', x: 296, y: 436, radius: 10 }],
        next: 'report',
      },
      {
        id: 'report',
        journal:
          'Two horses back in a corral built for sixty. It is a start, and it is more than anyone else in the valley has managed this spring.',
        objectives: [{ id: 'hollis', type: 'talk', target: 'hollis', text: 'Tell Hollis what you found', x: 296, y: 436 }],
        onComplete: [{ lore: 'doc_wantedCoyle' }],
      },
    ],
    rewards: { money: 40, rep: { ranchers: 10, army: 5 } },
  },

  // =========================================================================
  // MAIN 3 — The Surveyor's Notebook
  // =========================================================================
  {
    id: 'main_surveyor',
    title: 'The Surveyor\'s Notebook',
    kind: 'main',
    giver: 'hollis',
    region: 'blackwater',
    summary: 'A railroad man is paying rustlers. Silas mentioned a surveyor asking about the river. The Ashby Clarion has been asking the same questions in print.',
    autoStart: { quest: 'main_tracks', state: 'completed' },
    stages: [
      {
        id: 'editor',
        journal:
          'Hollis remembered the surveyor\'s name: Pruitt. The Ashby Clarion ran a piece in February asking where he\'d gone. Port Ashby is two days east by the river road, or one by rail if I want to sit next to men who sell land for a living.',
        objectives: [{ id: 'cordelia', type: 'talk', target: 'cordelia', text: 'Visit the Ashby Clarion office in Port Ashby', x: 600, y: 396 }],
        next: 'camp',
      },
      {
        id: 'camp',
        journal:
          'Cordelia Fontaine: ink on her cuffs and a mind like a sprung trap. She thinks the filed rail survey carries Pruitt\'s name but not his route, and that Pruitt ran rather than sign off on it. His winter camp was in the Tinaja country, south-west in Redstone. Nobody has been back since the fire.',
        objectives: [{ id: 'camp', type: 'discover', target: 'surveyCamp', text: 'Search the Abandoned Survey Camp', x: 205, y: 640 }],
        next: 'mission',
      },
      {
        id: 'mission',
        journal:
          '"Gone to the saints. Bring water. Beans if you love me." The only saints out here are the ruins of San Isidro, west of the camp. Somebody else read this note before me and wrote "nothing" under it. I hope that means they did not understand it.',
        objectives: [{ id: 'mission', type: 'goto', text: 'Ride to Mission San Isidro', x: 118, y: 622, radius: 8 }],
        next: 'supplies',
      },
      {
        id: 'supplies',
        journal:
          'There is a thin man in the mission chapel with a pistol he plainly does not know how to use. He wants water before he wants to talk, which is fair.',
        objectives: [
          { id: 'water', type: 'deliver', target: 'pruitt', item: 'canteenWater', count: 1, text: 'Bring Pruitt a canteen of water', x: 120, y: 620 },
          { id: 'beans', type: 'deliver', target: 'pruitt', item: 'beans', count: 2, text: 'Bring Pruitt two cans of beans', x: 120, y: 620 },
        ],
        next: 'notebook',
      },
      {
        id: 'notebook',
        journal:
          'Thaddeus Pruitt, Deputy Surveyor, eating beans with his fingers. He ran the true line in \'85 along the treaty stones and somebody filed a different one under his name. He still has the field book. He wants to know why he should trust me with it.',
        objectives: [{ id: 'book', type: 'collect', target: 'pruitt_notebook', count: 1, text: 'Obtain Pruitt\'s field notebook', x: 120, y: 620 }],
        onComplete: [{ lore: 'doc_pruittNotebook' }],
      },
    ],
    rewards: { money: 25, rep: { townsfolk: 5 } },
  },

  // =========================================================================
  // MAIN 4 — Snow on the Pass
  // =========================================================================
  {
    id: 'main_highcountry',
    title: 'Snow on the Pass',
    kind: 'main',
    giver: 'pruitt',
    region: 'sierra',
    summary: 'Silas fled north into the High Sierra with a bullet in him. Find him before Coyle does.',
    autoStart: { quest: 'main_surveyor', state: 'completed' },
    stages: [
      {
        id: 'whitepeak',
        journal:
          'Pruitt\'s book proves where the line should have gone. It doesn\'t prove who moved it. Silas saw something at the Roost worth shooting him over. North, the boy said. In April that means snow above Whitepeak. Wool won\'t do for a horse up there; a heavy blanket from a trading post might. Abel Musgrave keeps the post at Whitepeak and knows every cabin above it.',
        objectives: [{ id: 'musgrave', type: 'talk', target: 'musgrave', text: 'Ask Abel Musgrave at Whitepeak about Silas', x: 248, y: 84 }],
        next: 'cabin',
      },
      {
        id: 'cabin',
        journal:
          'Musgrave saw a lame horse with a Rocking B go by ten days ago, rider slumped over the horn, heading west for Hollow Crown, where a woman named Minerva Lindqvist traps. He said Silas courted her once. He said it like it explained a great deal.',
        objectives: [{ id: 'cabin', type: 'goto', text: 'Find Hollow Crown Cabin', x: 160, y: 120, radius: 6 }],
        next: 'reunion',
      },
      {
        id: 'reunion',
        journal:
          'Smoke from the chimney. A rifle barrel in the window that lowered when I called his name.',
        objectives: [
          { id: 'silas', type: 'talk', target: 'silas', text: 'Speak with Uncle Silas', x: 160, y: 122 },
          { id: 'minerva', type: 'talk', target: 'minerva', text: 'Speak with Minerva Lindqvist', x: 162, y: 123 },
        ],
        next: 'affidavit',
      },
      {
        id: 'affidavit',
        journal:
          'He\'s alive. Thinner, greyer, a shoulder Minerva sewed up like a flour sack, and exactly as stubborn as I remember. He saw Ellery Vance — the railroad\'s land agent, the man with the smile — paying Dutch Coyle by lantern light. He\'ll put it in writing if I sit still long enough for him to find the words.',
        objectives: [{ id: 'affidavit', type: 'collect', target: 'silas_affidavit', count: 1, text: 'Get Silas\'s signed statement', x: 160, y: 122 }],
        onComplete: [{ lore: 'doc_affidavit' }],
      },
    ],
    rewards: { money: 0, items: { horseReviver: 1, coffee: 3 }, rep: { ranchers: 10 } },
  },

  // =========================================================================
  // MAIN 5 — The Reckoning
  // =========================================================================
  {
    id: 'main_reckoning',
    title: 'The Reckoning',
    kind: 'main',
    giver: 'silas',
    region: 'blackwater',
    summary: 'A notebook, an affidavit, a scorched requisition. Take them to Port Ashby and decide who should have them.',
    autoStart: { quest: 'main_highcountry', state: 'completed' },
    stages: [
      {
        id: 'return',
        journal:
          'Silas won\'t say what to do with the evidence. "You carried it. You choose. I\'ll argue with you after." There are three people in Port Ashby who want it: a marshal who\'ll take it to court, an editor who\'ll take it to the presses, and a land agent who\'ll take it to the stove.',
        objectives: [{ id: 'ashby', type: 'goto', text: 'Return to Port Ashby with the evidence', x: 600, y: 396, radius: 15 }],
        next: 'decide',
      },
      {
        id: 'decide',
        journal:
          'Marshal Kincaid at the Territorial office. Cordelia at the Clarion. Vance at the depot, who will certainly have heard I\'m in town. Each of them will do something different with what I\'m carrying, and none of the somethings is clean.',
        objectives: [
          { id: 'choice', type: 'flag', target: 'reckoning_choice', text: 'Decide who gets the evidence' },
          { id: 'k', type: 'talk', target: 'kincaid', text: '(Option) The Territorial Marshal', x: 600, y: 396, optional: true },
          { id: 'c', type: 'talk', target: 'cordelia', text: '(Option) The Ashby Clarion', x: 600, y: 396, optional: true },
          { id: 'v', type: 'talk', target: 'vance', text: '(Option) Ellery Vance, at the depot', x: 600, y: 396, optional: true },
        ],
        next: [
          { cond: { flag: 'ending_law' }, stage: 'law_warrant' },
          { cond: { flag: 'ending_press' }, stage: 'press_sayen' },
          { stage: 'bribe_ranch' },
        ],
      },
      {
        id: 'law_warrant',
        journal:
          'Kincaid read every page twice, Pruitt\'s figures three times, and then swore out a warrant in a hand so neat it looked engraved. She wants me there when she serves it. "Witnesses keep men honest," she said, "including me."',
        objectives: [{ id: 'arrest', type: 'flag', target: 'vance_arrested', text: 'Serve the warrant on Ellery Vance at the depot', x: 600, y: 396 }],
        onComplete: [{ lore: 'doc_clarionArrest' }],
        next: 'showdown',
      },
      {
        id: 'press_sayen',
        journal:
          'Cordelia will print. But she won\'t print the Sayen agreement on the word of a railroad clerk\'s copy — she wants the council\'s own statement, and she wants it before Vance\'s friends can wire Chicago. I\'m to ride to Sayen Valley and ask Tolani Ashe and the council for it. They may not thank me. A rerouted line runs along their boundary.',
        objectives: [{ id: 'statement', type: 'flag', target: 'press_sayen_statement', text: 'Get the Sayen Council\'s statement for the Clarion', x: 458, y: 172 }],
        onComplete: [{ lore: 'doc_clarionExpose' }, { lore: 'doc_sayenStatement' }, { npcLeave: 'vance' }],
        next: 'showdown',
      },
      {
        id: 'bribe_ranch',
        journal:
          'Five hundred dollars. It sat in my hand heavier than any gun. Vance says the ranch will be "left out of the second phase", and Silas can sell or stay as he likes. He says it like a man who has said it before. I should tell Hollis something. I haven\'t decided what.',
        objectives: [{ id: 'hollis', type: 'talk', target: 'hollis', text: 'Ride back to the ranch', x: 296, y: 436 }],
        next: 'showdown',
      },
      {
        id: 'showdown',
        journal:
          'There is a black horse tied at the ranch gate and a man in a black hat sitting on Silas\'s porch, eating one of Mateo\'s biscuits. Dutch Coyle has come to settle accounts. He has been polite about it, so far.',
        objectives: [
          { id: 'talk', type: 'talk', target: 'dutch_coyle', text: 'Face Dutch Coyle at the ranch', x: 296, y: 436 },
          { id: 'duel', type: 'flag', target: 'duel_won_dutch_coyle', text: 'Win the duel', hidden: true },
        ],
        onComplete: [{ setFlag: 'silas_home', value: true }],
        next: [
          { cond: { flag: 'ending_law' }, stage: 'epilogue_law' },
          { cond: { flag: 'ending_press' }, stage: 'epilogue_press' },
          { stage: 'epilogue_bribe' },
        ],
      },
      {
        id: 'epilogue_law',
        journal:
          'Coyle is dead in the yard and Vance is in the Ashby jail, where his company\'s lawyers have already called him "a former employee acting wholly on his own account". The Commission has stopped the land grant pending a new survey. Nothing is finished; everything is postponed, which out here is the same as winning. Silas rode home today. He wants to see me.',
        objectives: [{ id: 'silas', type: 'talk', target: 'silas_ranch', text: 'Talk to Silas at the ranch house', x: 296, y: 436 }],
      },
      {
        id: 'epilogue_press',
        journal:
          'The Clarion sold out three printings. Meridian & Western stock fell nine points in Chicago, and Vance took the night train east with two valises before anyone could arrest him for anything. The Commission refused the valley route; the company must build north along the treaty line or lose its grant. The ranchers keep their river. The Sayen get their fee, their siding, and a railroad on their doorstep. Silas came home today.',
        objectives: [{ id: 'silas', type: 'talk', target: 'silas_ranch', text: 'Talk to Silas at the ranch house', x: 296, y: 436 }],
      },
      {
        id: 'epilogue_bribe',
        journal:
          'Coyle came to kill me because Vance told him I was a loose end. Vance was right about that much. I have five hundred dollars, a dead outlaw in the yard, and a valley that will be sold off one ranch at a time over the next two years, quietly, for fair-sounding prices. Silas came home today. I don\'t know yet what I\'ll tell him.',
        objectives: [{ id: 'silas', type: 'talk', target: 'silas_ranch', text: 'Talk to Silas at the ranch house', x: 296, y: 436 }],
      },
    ],
    rewards: { money: 50 },
  },

  // =========================================================================
  // SIDE QUESTS
  // =========================================================================
  {
    id: 'side_larkspur_cup',
    title: 'The Larkspur Cup',
    kind: 'horse',
    giver: 'josiah',
    region: 'dustfall',
    summary: 'Josiah Oakes runs the Larkspur Cup every spring. Five dollars to enter, fifty to the winner, and a silk rosette nobody admits they want.',
    stages: [
      {
        id: 'entry',
        journal:
          'The Larkspur Cup: a mile and a quarter of open ground, any horse not lame. Josiah wants five dollars and a promise I won\'t cross the church lawn.',
        onEnter: [{ lore: 'doc_cupPoster' }],
        objectives: [{ id: 'enter', type: 'flag', target: 'cup_entered', text: 'Pay Josiah the $5 entry fee', x: 372, y: 382 }],
        next: 'race',
      },
      {
        id: 'race',
        journal:
          'Entered. Ticket number fourteen, "no pushing" written on the back. A horse that trusts me will run for me. One that doesn\'t will run for itself, which is sometimes faster and always in the wrong direction.',
        objectives: [{ id: 'race', type: 'race', target: 'larkspur_cup', text: 'Win the Larkspur Cup', x: 372, y: 382 }],
        next: 'purse',
      },
      {
        id: 'purse',
        journal: 'Won it. The rosette is purple and absurd and I am keeping it.',
        objectives: [{ id: 'josiah', type: 'talk', target: 'josiah', text: 'Collect the purse from Josiah', x: 372, y: 382 }],
      },
    ],
    rewards: { money: 50, items: { decorRibbon: 1 }, rep: { townsfolk: 5 } },
  },
  {
    id: 'side_ashby_derby',
    title: 'The Ashby Derby',
    kind: 'horse',
    giver: 'benito',
    region: 'blackwater',
    summary: 'Port Ashby\'s richer, faster, better-dressed race. Benito Ruiz takes the entries.',
    stages: [
      {
        id: 'entry',
        journal: 'The Ashby Derby runs along the lakeshore past the hotels, where people with parasols can watch people without them fall off. Ten dollars to enter.',
        objectives: [{ id: 'enter', type: 'flag', target: 'derby_entered', text: 'Pay Benito the $10 entry fee', x: 600, y: 396 }],
        next: 'race',
      },
      {
        id: 'race',
        journal: 'Thoroughbreds from back East, a Sayen Appaloosa, and Ada Musgrave on a mountain horse with feet like dinner plates. And me.',
        objectives: [{ id: 'race', type: 'race', target: 'ashby_derby', text: 'Win the Ashby Derby', x: 600, y: 396 }],
        next: 'purse',
      },
      {
        id: 'purse',
        journal: 'First past the post. A man in a silk hat tried to buy my horse before it had stopped blowing. I said no. It felt good.',
        objectives: [{ id: 'benito', type: 'talk', target: 'benito', text: 'Collect the purse from Benito', x: 600, y: 396 }],
      },
    ],
    rewards: { money: 120, items: { bridleSilver: 1 }, rep: { townsfolk: 5 } },
  },
  {
    id: 'horse_pale_mare',
    title: 'The Pale Mare',
    kind: 'horse',
    giver: 'gideon',
    region: 'dustfall',
    summary: 'Old Gideon Platt swears a white mustang mare has run free on Mustang Flats for eleven years and never been roped. He would like to see her once more before he dies.',
    stages: [
      {
        id: 'flats',
        journal:
          'Gideon says she\'s white as a bleached skull, runs at the back of the herd so she can see everything, and has broken three lariats and one man\'s collarbone. Mustang Flats is west of the ranch. Bring a rope, he says, and more patience than rope.',
        onEnter: [{ spawnEncounter: 'enc_pale_mare' }],
        objectives: [{ id: 'flats', type: 'goto', text: 'Look for the Pale Mare on Mustang Flats', x: 190, y: 390, radius: 14 }],
        next: 'catch',
      },
      {
        id: 'catch',
        journal:
          'She\'s real. Older than Gideon\'s story, grey at the muzzle, and smarter than the rest of the herd put together. If I can get a rope on her quietly I can walk her to the Brannigan corral.',
        objectives: [{ id: 'lead', type: 'lead', target: 'pale_mare', count: 1, text: 'Bring the Pale Mare to the Brannigan corral', x: 296, y: 436, radius: 10 }],
        next: 'gideon',
      },
      {
        id: 'gideon',
        journal:
          'She\'s standing in the corral like she owns it. Somebody ought to tell Gideon. Then somebody ought to decide what happens to her, and I have the feeling that\'s me.',
        objectives: [{ id: 'decide', type: 'flag', target: 'pale_mare_decided', text: 'Tell Gideon, and decide her fate', x: 372, y: 382 }],
      },
    ],
    rewards: { items: { sugarCube: 5 }, rep: { ranchers: 5 } },
  },
  {
    id: 'hunt_whitepeak_wolves',
    title: 'Wolves at Whitepeak',
    kind: 'hunting',
    giver: 'musgrave',
    region: 'sierra',
    summary: 'A wolf pack is taking Musgrave\'s calves in the snow. He wants three of them gone before the thaw.',
    stages: [
      {
        id: 'wolves',
        journal:
          'Abel Musgrave lost four calves this month to a pack running the timber above his place. He doesn\'t hate wolves, he says; he just can\'t afford them. Three of them should break the pack up.',
        objectives: [{ id: 'wolves', type: 'hunt', target: 'wolf', count: 3, text: 'Hunt wolves near Whitepeak', x: 260, y: 100 }],
        next: 'report',
      },
      {
        id: 'report',
        journal: 'Three wolves. The rest of the pack went over the ridge toward the Sayen side and I let them go.',
        objectives: [{ id: 'musgrave', type: 'talk', target: 'musgrave', text: 'Report to Abel Musgrave', x: 248, y: 84 }],
      },
    ],
    rewards: { money: 30, items: { blanketHeavy: 1 }, rep: { ranchers: 5 } },
  },
  {
    id: 'delivery_cedar_medicine',
    title: 'Doctor\'s Orders',
    kind: 'delivery',
    giver: 'okafor',
    region: 'pinehollow',
    summary: 'Dr. Okafor needs medicine carried to an injured logger at Cedar Notch, along with instructions the logger will not want to hear.',
    stages: [
      {
        id: 'deliver',
        journal:
          'Dr. Okafor has a patient at Cedar Notch with a crushed leg and a foreman who wants him back at the saw. One bottle of tonic, two rolls of bandage, and a letter, which the doctor says to deliver "with whatever firmness the situation requires".',
        objectives: [
          { id: 'tonic', type: 'deliver', target: 'rolf', item: 'tonicHealth', count: 1, text: 'Deliver the tonic to Rolf Haugen', x: 545, y: 200 },
          { id: 'bandage', type: 'deliver', target: 'rolf', item: 'bandage', count: 2, text: 'Deliver two bandages to Rolf Haugen', x: 545, y: 200 },
        ],
        next: 'advise',
      },
      {
        id: 'advise',
        journal: 'Rolf took the medicine. He did not take the advice. Not yet.',
        objectives: [{ id: 'advise', type: 'flag', target: 'rolf_advised', text: 'Convince Rolf to follow the doctor\'s orders', x: 545, y: 200 }],
        next: 'report',
      },
      {
        id: 'report',
        journal: 'Back to Larkspur to tell Dr. Okafor how his patient is getting on.',
        objectives: [{ id: 'okafor', type: 'talk', target: 'okafor', text: 'Report to Dr. Okafor', x: 372, y: 382 }],
      },
    ],
    rewards: { money: 15, items: { tonicHealth: 2 }, rep: { townsfolk: 5 } },
  },
  {
    id: 'side_halvorsen',
    title: 'Four Dollars an Acre',
    kind: 'ranch',
    giver: 'ingrid',
    region: 'dustfall',
    summary: 'A Townsite Company man is coming to the Halvorsen farm for an answer, and bringing large friends to help him hear it.',
    stages: [
      {
        id: 'confront',
        journal:
          'The Halvorsens have a letter offering four dollars an acre and hinting they might get nothing at all under "the revised survey". Initialled E.V. The Company\'s Mr. Haskett is at the house now. Ingrid wants him gone. Nils wants him gone without anyone getting shot. Those may be two different jobs.',
        onEnter: [{ lore: 'doc_halvorsenOffer' }],
        objectives: [{ id: 'haskett', type: 'flag', target: 'halvorsen_choice', text: 'Deal with Morton Haskett', x: 430, y: 318 }],
        next: [{ cond: { flag: 'halvorsen_fight' }, stage: 'fight' }, { stage: 'report' }],
      },
      {
        id: 'fight',
        journal: 'Haskett chose the hard way, or I did. His men are coming back up the lane.',
        onEnter: [{ spawnEncounter: 'enc_halvorsen_agents' }],
        objectives: [{ id: 'agents', type: 'kill', target: 'halvorsen_agent', count: 3, text: 'Drive off the Company men', x: 436, y: 324 }],
        next: 'report',
      },
      {
        id: 'report',
        journal: 'Haskett is gone, one way or another. Ingrid will want to hear it from me.',
        objectives: [{ id: 'ingrid', type: 'talk', target: 'ingrid', text: 'Talk to Ingrid Halvorsen', x: 430, y: 318 }],
      },
    ],
    rewards: { money: 20, items: { bread: 3 }, rep: { ranchers: 10 } },
  },
  {
    id: 'bounty_pike',
    title: 'Wanted: Rattler Pike',
    kind: 'bounty',
    giver: 'whitlock',
    region: 'drylands',
    summary: 'Sheriff Whitlock has a $200 bounty on Jubal "Rattler" Pike, who killed a stage driver and robbed the Sulfur Flats payroll.',
    stages: [
      {
        id: 'hunt',
        journal:
          'Jubal Pike. Killed a stage driver named Amos Hunnicutt who had six children, and took the mine payroll, which is why the Flats are being paid in scrip. Whitlock thinks he\'s holed up in the Drylands west of Sulfur Flats, near the old Rio Seco wells. He also said, quietly, that Pike used to ride for Coyle.',
        onEnter: [{ spawnEncounter: 'enc_pike' }, { lore: 'doc_wantedPike' }],
        objectives: [
          { id: 'pike', type: 'kill', target: 'pike', count: 1, text: 'Find and stop Jubal Pike', x: 95, y: 505, radius: 15 },
          { id: 'gang', type: 'kill', target: 'pike_gang', count: 2, text: 'Deal with Pike\'s cronies', optional: true },
        ],
        next: 'collect',
      },
      {
        id: 'collect',
        journal: 'Pike won\'t trouble anyone again. Whitlock owes me two hundred dollars and, I suspect, a conversation.',
        objectives: [{ id: 'whitlock', type: 'talk', target: 'whitlock', text: 'Collect the bounty from Sheriff Whitlock', x: 372, y: 382 }],
      },
    ],
    rewards: { money: 200, rep: { townsfolk: 10 } },
  },
  {
    id: 'horse_sayen_mares',
    title: 'Condemned Stock',
    kind: 'horse',
    giver: 'tolani',
    region: 'pinehollow',
    summary: 'The Agency trader reported two of Tolani Ashe\'s Appaloosa mares dead of colic. They are, in fact, in his holding pen on Pine Creek, waiting for a buyer.',
    stages: [
      {
        id: 'pen',
        journal:
          'Tolani Ashe\'s two best brood mares, Dusk and Quill, were "condemned as unfit" by the Agency trader, Kimbrough, and written off. Corin Ashe saw them alive yesterday in a pen east of Pine Creek. Tolani wants them back without starting a war with the Agency. Corin wants to start one. I am apparently the compromise.',
        onEnter: [{ spawnEncounter: 'enc_agency_trader' }],
        objectives: [
          { id: 'pen', type: 'goto', text: 'Find Kimbrough\'s holding pen east of Pine Creek', x: 520, y: 250, radius: 10 },
          { id: 'hands', type: 'kill', target: 'trader_hand', count: 2, text: 'Deal with Kimbrough\'s hired hands', optional: true },
        ],
        next: 'lead',
      },
      {
        id: 'lead',
        journal: 'Two spotted mares, sound as a bell, not a sign of colic on either. Time to take them home.',
        objectives: [{ id: 'lead', type: 'lead', target: 'sayen_mares', count: 2, text: 'Bring Dusk and Quill back to Sayen Valley Lodge', x: 458, y: 172, radius: 10 }],
        next: 'return',
      },
      {
        id: 'return',
        journal: 'The mares are home. Tolani is waiting at the Council House.',
        objectives: [{ id: 'tolani', type: 'talk', target: 'tolani', text: 'Speak with Tolani Ashe', x: 458, y: 172 }],
        onComplete: [{ setFlag: 'sayen_shop_open', value: true }, { lore: 'doc_traderLedger' }],
      },
    ],
    rewards: { money: 40, items: { oats: 5 }, rep: { sayen: 20 } },
  },
  {
    id: 'side_lost_pony',
    title: 'Clementine',
    kind: 'stranger',
    giver: 'tilly',
    region: 'dustfall',
    summary: 'Tilly Hargrove\'s pony bolted in the last storm. She has organised a search party of one and would like a second.',
    stages: [
      {
        id: 'search',
        journal: 'Clementine: brown, fat, "a little bit spotted on the bottom", bolted north-east during the thunder. Tilly has drawn me a map. It is mostly a picture of Clementine.',
        onEnter: [{ spawnEncounter: 'enc_lost_pony' }],
        objectives: [{ id: 'find', type: 'goto', text: 'Search north-east of Larkspur for Clementine', x: 395, y: 340, radius: 10 }],
        next: 'lead',
      },
      {
        id: 'lead',
        journal: 'Found her in a cottonwood draw eating something she shouldn\'t, very pleased with herself. Now to get her home.',
        objectives: [{ id: 'lead', type: 'lead', target: 'lost_pony', count: 1, text: 'Lead Clementine back to Larkspur', x: 372, y: 382, radius: 8 }],
        next: 'return',
      },
      {
        id: 'return',
        journal: 'Clementine is back. Tilly will want a full report.',
        objectives: [{ id: 'tilly', type: 'talk', target: 'tilly', text: 'Tell Tilly her pony is home', x: 372, y: 382 }],
      },
    ],
    rewards: { items: { apple: 3, sugarCube: 2 }, rep: { townsfolk: 5 }, honor: 5 },
  },
  {
    id: 'side_pettibone_hides',
    title: 'Hides for Pettibone',
    kind: 'hunting',
    giver: 'pettibone',
    region: 'dustfall',
    summary: 'Augustus Pettibone has an order for deer hides from a Port Ashby glover and nobody to fill it.',
    stages: [
      {
        id: 'hides',
        journal: 'Three good deer hides for Pettibone. He says "good" the way other men say "or else".',
        objectives: [
          { id: 'hunt', type: 'hunt', target: 'deer', count: 3, text: 'Hunt deer', optional: true },
          { id: 'deliver', type: 'deliver', target: 'pettibone', item: 'peltDeer', count: 3, text: 'Bring Pettibone three deer pelts', x: 372, y: 382 },
        ],
        next: 'settle',
      },
      {
        id: 'settle',
        journal: 'Pettibone took the hides and is now settling up, which for Pettibone is a performance in several acts.',
        objectives: [{ id: 'settle', type: 'flag', target: 'pettibone_settled', text: 'Settle up with Pettibone', x: 372, y: 382 }],
      },
    ],
    rewards: { money: 12, rep: { townsfolk: 5 } },
  },
  {
    id: 'treasure_ketterman',
    title: 'Widow Ketterman\'s Silver',
    kind: 'treasure',
    giver: 'vogel',
    region: 'drylands',
    summary: 'In 1884 Hester Ketterman\'s silver was stolen from her claim in the Drylands. The assayer who weighed it thinks her daybook may still be there.',
    stages: [
      {
        id: 'claim',
        journal: 'Conrad Vogel weighed Hester Ketterman\'s first silver and says she wrote everything down. Her claim is out past Sulfur Flats at the western edge of the Drylands. If the daybook survived, it might say where her silver went.',
        objectives: [{ id: 'claim', type: 'discover', target: 'lostMine', text: 'Search Widow Ketterman\'s Claim', x: 70, y: 450 }],
        next: 'chimney',
      },
      {
        id: 'chimney',
        journal: '"Sleep fine under the chimney till the Roost needs it." A rock that leans like a stovepipe, east of the box canyon in Redstone. That is Coyle\'s country. Hester said to drink one to Fritz.',
        objectives: [{ id: 'cache', type: 'goto', target: 'treasureA', text: 'Find the leaning rock east of Coyle\'s Roost', x: 548, y: 676, radius: 4 }],
        onComplete: [{ give: 'goldNugget', qty: 2 }, { give: 'silverOre', qty: 4 }, { money: 120 }],
        next: 'vogel',
      },
      {
        id: 'vogel',
        journal: 'Silver bars gone black with four years under a rock, some gold the outlaws added on their own account, and a hundred and twenty dollars in coin. Vogel says Hester Ketterman is alive and living with her sister in Port Ashby. Nobody would ever know if I kept it all.',
        objectives: [{ id: 'decide', type: 'flag', target: 'ketterman_decided', text: 'Tell Vogel what you found', x: 168, y: 470 }],
      },
    ],
    rewards: { items: { goldNugget: 1 } },
  },
];
