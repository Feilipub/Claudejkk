/**
 * Authored dialogue trees (one per named NPC, id `dlg_<npc>`) and ambient
 * barks. Entry points are ordered most-specific first; the first passing
 * entry picks the starting node.
 */
import type { Bark, Cond, DialogueOption, DialogueTree } from '../schema.ts';

// --- Small condition helpers (pure data builders) ---------------------------
const at = (quest: string, stage: string): Cond => ({ quest, state: 'active', stage });
const active = (quest: string): Cond => ({ quest, state: 'active' });
const done = (quest: string): Cond => ({ quest, state: 'completed' });
const fresh = (quest: string): Cond => ({ quest, state: 'notStarted' });
const hasEvidence: Cond = { all: [{ item: 'pruitt_notebook' }, { item: 'silas_affidavit' }] };
const canChoose: Cond = { all: [at('main_reckoning', 'decide'), hasEvidence, { notFlag: 'reckoning_choice' }] };
const shop = (id: string, text: string): DialogueOption => ({ text, effects: [{ openShop: id }], next: 'end' });
const bye = (text = 'Be seeing you.'): DialogueOption => ({ text, next: 'end' });

export const DIALOGUE: DialogueTree[] = [
  // ===========================================================================
  // LARKSPUR
  // ===========================================================================
  {
    id: 'dlg_josiah',
    npc: 'josiah',
    entry: [
      { cond: at('main_arrival', 'livery'), node: 'arrival' },
      { cond: at('side_larkspur_cup', 'purse'), node: 'cup_purse' },
      { cond: at('side_larkspur_cup', 'race'), node: 'cup_ready' },
      { cond: { all: [{ flag: 'ending_bribe' }, { flag: 'silas_home' }] }, node: 'bribe_cold' },
      { cond: { flag: 'silas_home' }, node: 'after' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'arrival',
        lines: [{ text: 'Well, now. You\'ve got Silas\'s chin and the Army\'s way of standing like the ground owes you money. You\'ll be his kin.' }],
        options: [
          { text: 'Silas wrote me. Said you\'d see me mounted.', tone: 'kind', next: 'arrival2' },
          { text: 'Where is he? The letter sounded wrong.', tone: 'firm', next: 'arrival2' },
          { text: 'The Army never stood like that. I did.', tone: 'joke', next: 'arrival2' },
        ],
      },
      {
        id: 'arrival2',
        lines: [{ text: 'Truth is, I don\'t know where he is. Hasn\'t been to town in a week, and Silas comes in Saturdays to lose at checkers to me whether he\'s busy or not. Hollis Tolliver came in last Thursday with a bullet in his arm and wouldn\'t say whose.' }],
        options: [{ text: 'Then I\'d better get out there.', next: 'arrival3' }],
      },
      {
        id: 'arrival3',
        lines: [{ text: 'Biscuit\'s saddled out front. Morgan mare, thirteen years old, hasn\'t surprised anybody since Grant was president. She knows the river road. Ranch is south-west, follow the water. Bring her back when Silas finds you something with more opinions.' }],
        options: [
          { text: 'I\'m obliged, Mr. Oakes.', tone: 'kind', next: 'end', effects: [{ opinion: 5 }] },
          { text: 'Biscuit. That\'s a name to strike fear.', tone: 'joke', next: 'biscuit' },
        ],
      },
      {
        id: 'biscuit',
        lines: [{ text: 'Named her after what she\'s shaped like. She don\'t strike fear. She don\'t strike anything. That is the whole point of Biscuit.' }],
        options: [bye('Fair enough.')],
      },
      {
        id: 'hub',
        lines: [
          { cond: { time: 'night' }, text: 'Lantern\'s still lit, so I suppose I\'m still open. What do you need?' },
          { cond: { horseBond: 4 }, text: 'That horse of yours follows you like a dog after a sausage. Good work. What can I do for you?' },
          { cond: { rep: 'notoriety', gte: 40 }, text: 'I\'ve heard some things about you. I\'ll hear your side, but I\'ll hear it with the gate shut.' },
          { text: ['Afternoon. Horse, hay, or harm?', 'Morning. Biscuit asks after you. She does not, but I like to think so.', 'Come on in. Mind the grey, he bites the left-handed.'] },
        ],
        options: [
          shop('stable_larkspur', 'Let\'s see what you\'ve got in the stalls.'),
          { text: 'Tell me about this Larkspur Cup.', cond: fresh('side_larkspur_cup'), next: 'cup_offer' },
          { text: 'Any word about Silas?', cond: { all: [done('main_arrival'), fresh('main_reckoning')] }, next: 'silas_news' },
          { text: 'How\'s the town holding up?', next: 'town' },
          bye(),
        ],
      },
      {
        id: 'town',
        lines: [
          { cond: { flag: 'vance_arrested' }, text: 'Town\'s breathing again. Half the men who sold out to that Townsite outfit are in the Gilded Spur working out whether they can buy back. They can\'t. But they\'re enjoying the arithmetic.' },
          { text: 'River\'s low, prices are high, and every month another family loads a wagon. Railroad men buy the land, then they buy drinks for the men they bought it off. It\'s very civil. Makes me want to spit.' },
        ],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'silas_news',
        lines: [
          { cond: done('main_highcountry'), text: 'You found him. I can see it on you. Lord, I\'d have bet the stable he was dead in a ditch and I\'d have been happy to lose it.' },
          { text: 'Nothing. But I\'ll tell you what I know about Silas Brannigan: a man that mean doesn\'t die of one bullet. He\'d consider it a waste.' },
        ],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'cup_offer',
        lines: [{ text: 'Twenty-third running. Mile and a quarter round the bluff and back to the church. Five dollars to enter, fifty to the winner, and a silk rosette in a purple I would not personally choose. Fella from the fort won it last year on an Army horse and they tell me he\'s still cleaning latrines.' }],
        options: [
          { text: 'Count me in. Here\'s five dollars.', cond: { money: 5 }, lockedHint: 'You need $5.', effects: [{ pay: 5 }, { startQuest: 'side_larkspur_cup' }, { give: 'cup_entry' }, { setFlag: 'cup_entered', value: true }], next: 'cup_signed' },
          { text: 'Maybe once my horse knows my name.', next: 'hub' },
        ],
      },
      {
        id: 'cup_signed',
        lines: [{ text: 'Number fourteen. Don\'t push, don\'t spur another man\'s horse, don\'t cross the church lawn. Reverend Shaw has a long memory and a short sermon and I don\'t want to lose either. Come see me when you\'re ready to run.' }],
        options: [
          { text: 'I\'m ready now.', effects: [{ startActivity: 'race' }], next: 'end' },
          bye('Soon.'),
        ],
      },
      {
        id: 'cup_ready',
        lines: [{ text: 'Field\'s gathering by the bluff. You running or admiring?' }],
        options: [
          { text: 'Running.', effects: [{ startActivity: 'race' }], next: 'end' },
          bye('Give me a minute.'),
        ],
      },
      {
        id: 'cup_purse',
        lines: [{ text: 'Fifty dollars and the ugliest rosette in the Territory. You rode that like you meant it. Silas would have hollered himself hoarse.' }],
        options: [bye('He\'d have bet against me.'), { text: 'Let me see the stock while I\'m here.', effects: [{ openShop: 'stable_larkspur' }], next: 'end' }],
      },
      {
        id: 'after',
        lines: [
          { cond: { flag: 'ending_press' }, text: 'Read that paper four times. Cordelia Fontaine spelled my name right, which is more than the census manages. Silas was in yesterday. Lost at checkers. Things are back where they belong.' },
          { text: 'Silas was in Saturday. Lost at checkers. He says you did the hard part and he did the bleeding. Sounds about right.' },
        ],
        options: [shop('stable_larkspur', 'Show me the stalls.'), bye()],
      },
      {
        id: 'bribe_cold',
        lines: [{ text: 'Silas was in. Didn\'t play checkers. Just sat. Whatever went on between the two of you, it\'s none of mine. But I sold you a horse once and I\'d like to have been wrong about who I sold it to.' }],
        options: [shop('stable_larkspur', 'Just the stalls, Josiah.'), bye('I know.')],
      },
    ],
  },
  {
    id: 'dlg_whitlock',
    npc: 'whitlock',
    entry: [
      { cond: at('bounty_pike', 'collect'), node: 'pike_paid' },
      { cond: { wanted: true }, node: 'wanted' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { rep: 'honor', lte: -30 }, text: 'Keep your hands where I can count them. What is it?' },
          { cond: { time: 'night' }, text: 'Jail\'s quiet. Keep it that way and we\'ll be friends.' },
          { text: ['Sheriff\'s office. Talk.', 'You need the law, or you just need to sit down somewhere the wind isn\'t?', 'Brannigan\'s kin. What can I do for you?'] },
        ],
        options: [
          { text: 'Any bounties going?', cond: fresh('bounty_pike'), next: 'pike_offer' },
          { text: 'My uncle Silas is missing. What are you doing about it?', cond: { all: [done('main_arrival'), fresh('main_highcountry')] }, tone: 'firm', next: 'silas' },
          { text: 'Who\'s been stealing the valley\'s horses, Sheriff?', cond: active('main_tracks'), next: 'rustling' },
          bye(),
        ],
      },
      {
        id: 'silas',
        lines: [{ text: 'What I can, which is not much. I\'ve got one deputy, a county the size of Connecticut, and no body. Silas rode out armed after men who\'d shot his foreman. That\'s his right. If he\'s found dead, it becomes my business.' }],
        options: [
          { text: 'That\'s a convenient rule.', tone: 'firm', next: 'silas2' },
          { text: 'I understand. I\'ll find him myself.', tone: 'kind', next: 'end', effects: [{ opinion: 5 }] },
        ],
      },
      {
        id: 'silas2',
        lines: [{ text: 'Everything\'s convenient for somebody. My mortgage is held by the Ashby Commercial Bank, and the bank\'s directors eat dinner with railroad men, and I am telling you that so you understand I know exactly how this looks. I\'m not bought. I\'m just tired. There\'s a difference, though I admit it\'s getting thin.' }],
        options: [bye('Thin enough to see through.')],
      },
      {
        id: 'rustling',
        lines: [{ text: 'If I knew for certain I\'d have a hanging. What I know for likely is a man named Dutch Coyle runs a crew out of the Redstone canyons. Territorial warrant on him from Port Ashby. My jurisdiction ends at the Tinaja, and frankly so does my courage.' }],
        options: [bye('Honest, at least.')],
      },
      {
        id: 'pike_offer',
        lines: [{ text: 'One. Jubal Pike. Shot Amos Hunnicutt off the box of the Sulfur Flats stage for the mine payroll. Amos had six kids. Two hundred dollars, and you won\'t take him alive, so don\'t break your heart trying. He\'s somewhere west of the Flats near the old Rio Seco wells. He used to ride with Coyle, if that interests you.' }],
        options: [
          { text: 'I\'ll take it.', effects: [{ startQuest: 'bounty_pike' }], next: 'end' },
          { text: 'Not my kind of work.', next: 'end' },
        ],
      },
      {
        id: 'pike_paid',
        lines: [{ text: 'Two hundred, as promised. I\'ll send word to Mrs. Hunnicutt. She won\'t thank anybody, and she shouldn\'t have to. Obliged to you. Truly.' }],
        options: [
          { text: 'Give fifty of it to the Hunnicutt family.', tone: 'kind', effects: [{ pay: 50 }, { rep: 'honor', amount: 10 }, { rep: 'townsfolk', amount: 5 }, { opinion: 15 }], next: 'pike_kind' },
          bye('Glad it\'s done.'),
        ],
      },
      { id: 'pike_kind', lines: [{ text: '...I\'ll see it gets there. Every cent. Huh. Silas raised you better than he raises horses.' }], options: [bye()] },
      {
        id: 'wanted',
        lines: [{ text: 'You\'ve got paper on you in this county and you walked into my office. Either you\'re brave or you think I\'m slow. Pay the fine or turn around.' }],
        options: [
          { text: 'I\'ll pay. ($40)', cond: { money: 40 }, lockedHint: 'You need $40.', effects: [{ pay: 40 }, { bountyClear: true }], next: 'paid' },
          { text: 'I\'ll turn around.', next: 'end' },
        ],
      },
      { id: 'paid', lines: [{ text: 'Paid in full. Don\'t make me write your name again; my hand\'s bad.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_dane',
    npc: 'dane',
    entry: [{ cond: { metNpc: 'dane' }, node: 'hub' }, { node: 'first' }],
    nodes: [
      {
        id: 'first',
        lines: [{ text: 'Deputy Cyrus Dane, Larkspur. You\'re the one from the Army? Remount wrangler? I read about the remount service once. In a story. There was a stampede and a lady in a balloon.' }],
        options: [
          { text: 'There was never a balloon.', tone: 'joke', next: 'balloon' },
          { text: 'Pleasure, Deputy.', tone: 'kind', next: 'end' },
        ],
      },
      { id: 'balloon', lines: [{ text: 'No balloon. Right. I figured. ...Was there a lady?' }], options: [bye('Good day, Deputy.')] },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'vance_arrested' }, text: 'They say you were right there when the Marshal took Vance! I\'d have given my left boot to see that. Not the right one. That\'s my good one.' },
          { cond: { rep: 'honor', gte: 40 }, text: 'Sheriff says you\'re the real article. He doesn\'t say that. He says "fine" about the Second Coming.' },
          { text: ['Quiet day. I\'m practising my quick draw on the reflection. The reflection is winning.', 'Help you?', 'Sheriff\'s inside, if you want the sheriff.'] },
        ],
        options: [bye('Keep practising.')],
      },
    ],
  },
  {
    id: 'dlg_rufus',
    npc: 'rufus',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { rep: 'notoriety', gte: 50 }, text: 'You drink, you pay, you leave the iron holstered. That\'s the house rule and it applies extra to you.' },
          { cond: { time: 'morning' }, text: 'We\'re open. Barely. Coffee\'s in that pot and it\'s not mine, so I won\'t vouch for it.' },
          { text: ['Welcome to the Gilded Spur. Gilt\'s mostly worn off. Spur\'s in the back if anyone asks.', 'What\'ll it be?', 'Pull up a stool. Not that one. That one\'s Gideon\'s, and he\'ll tell you a story about it.'] },
        ],
        options: [
          shop('saloon_larkspur', 'Let\'s see the bottles.'),
          { text: 'Deal me in at the card table.', effects: [{ startActivity: 'poker' }], next: 'end' },
          { text: 'What\'s the talk in town?', next: 'gossip' },
          bye(),
        ],
      },
      {
        id: 'gossip',
        lines: [
          { cond: { flag: 'ending_bribe' }, text: 'Talk is somebody got paid to keep quiet about the railroad. Talk doesn\'t say who. Talk is looking at you a bit, though.' },
          { cond: done('main_reckoning'), text: 'Talk is the Brannigan place has its horses back and its owner\'s back on the porch shouting at them. Feels like spring.' },
          { cond: active('main_tracks'), text: 'Railroad freight wagon burned out on the south road and nobody from the railroad has come to ask after it. You\'d think they\'d want their wagon back. You\'d think.' },
          { text: ['Halvorsens are being leaned on to sell. Third farm this month. That Townsite company\'s got deep pockets and no face.', 'Old Gideon\'s telling the Pale Mare story again. Buy him a drink and you\'ll hear it with extra verses.', 'Doc Okafor\'s been asking every man who comes in what calibre took Hollis Tolliver\'s arm. Doctors oughtn\'t to be detectives. It\'s bad for trade.'] },
        ],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
    ],
  },
  {
    id: 'dlg_gideon',
    npc: 'gideon',
    entry: [
      { cond: at('horse_pale_mare', 'gideon'), node: 'mare_back' },
      { cond: active('horse_pale_mare'), node: 'mare_wait' },
      { cond: { flag: 'pale_mare_decided' }, node: 'after' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Sit down, sit down. I don\'t bite. Horses did, mostly. Forty years of it.', 'You\'re Silas\'s kin. He and I broke horses for the stage line in \'59. He was worse than me. Don\'t tell him.'] }],
        options: [
          { text: 'Tell me about the Pale Mare.', cond: fresh('horse_pale_mare'), next: 'tale' },
          { text: 'What was Silas like, young?', next: 'silas' },
          bye(),
        ],
      },
      {
        id: 'tale',
        lines: [{ text: 'Eleven years she\'s run on Mustang Flats, west of your uncle\'s. White as a bleached skull. She runs at the back of the herd, not the front, so she can see what\'s coming. I had a rope on her once, in \'81. She sat down, like a dog, and looked at me, and I swear I let go out of embarrassment.' }],
        options: [{ text: 'And since then?', next: 'tale2' }],
      },
      {
        id: 'tale2',
        lines: [{ text: 'Since then three men\'ve tried. Broke three ropes and one collarbone, not hers. She\'s getting old now. So am I. I\'d like to see her close once more before one of us goes. That\'s all. I\'m not asking you to break her. I don\'t think she breaks.' }],
        options: [
          { text: 'I\'ll go and look for her.', tone: 'kind', effects: [{ startQuest: 'horse_pale_mare' }, { opinion: 10 }], next: 'end' },
          { text: 'Sounds like a story that improves with whiskey.', tone: 'joke', next: 'tale3' },
        ],
      },
      { id: 'tale3', lines: [{ text: 'Everything does, friend. But the mare\'s real. Ride out and see.' }], options: [{ text: 'All right. I\'ll look.', effects: [{ startQuest: 'horse_pale_mare' }], next: 'end' }, bye('Another time.')] },
      {
        id: 'silas',
        lines: [{ text: 'Same as now with darker hair. Stubborn as a post. Rode a horse into the Calder in flood once because somebody bet him he wouldn\'t. Horse swam out fine. Silas came out a mile down, holding his hat, and said "I won." He\'s been holding his hat and saying he won ever since.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      { id: 'mare_wait', lines: [{ text: 'Seen her yet? Don\'t chase her. She likes being chased. Stand still and be boring. Boring\'s the only rope that ever held her.' }], options: [bye()] },
      {
        id: 'mare_back',
        lines: [{ text: 'You\'ve... she\'s at the Brannigan corral? Standing? With a rope on? Lord. Lord. Give me a minute. I\'m an old man and there\'s dust in here.' }],
        options: [{ text: 'Take all the time you need.', tone: 'kind', next: 'mare_choice' }],
      },
      {
        id: 'mare_choice',
        lines: [{ text: 'Now comes the hard bit, and it\'s yours, not mine. She\'s too old to break proper, too smart to waste, and too famous to leave alone. Every fool in the Territory will be out on the Flats with a rope now word\'s out. What\'ll you do with her?' }],
        options: [
          { text: 'I\'ll ride her myself. Slowly. On her terms.', effects: [{ giveHorse: { breedId: 'mustang', name: 'Pale Mare', sex: 'mare', training: 'green', seed: 4401 } }, { setFlag: 'pale_mare_kept', value: true }, { setFlag: 'pale_mare_decided', value: true }], next: 'kept' },
          { text: 'Silas\'s ranch. She\'ll throw colts nobody can catch.', effects: [{ setFlag: 'pale_mare_ranch', value: true }, { setFlag: 'pale_mare_decided', value: true }, { rep: 'ranchers', amount: 10 }], next: 'ranch' },
          { text: 'She goes back to the Flats. Free.', tone: 'kind', effects: [{ setFlag: 'pale_mare_freed', value: true }, { setFlag: 'pale_mare_decided', value: true }, { rep: 'honor', amount: 10 }], next: 'freed' },
        ],
      },
      { id: 'kept', lines: [{ text: 'On her terms. That\'s the only way it\'d ever work. You\'ll get bit. You\'ll deserve most of it.' }], options: [bye('I expect so.')] },
      { id: 'ranch', lines: [{ text: 'Brannigan colts out of the Pale Mare. Ha! Silas\'ll pretend it was his idea inside a week. Good. Good.' }], options: [bye()] },
      { id: 'freed', lines: [{ text: 'Then the fools can chase her another eleven years and she can sit down and look at them. Thank you. I mean it. I\'ve seen her close. That\'s enough.' }], options: [bye()] },
      {
        id: 'after',
        lines: [
          { cond: { flag: 'pale_mare_kept' }, text: 'How\'s the old girl? Still sitting down when she disagrees? Don\'t let her know I asked.' },
          { cond: { flag: 'pale_mare_freed' }, text: 'Rode out to the Flats Sunday. Saw her on the ridge, at the back of the herd. Watching. Best Sunday I\'ve had in years.' },
          { text: 'Mateo tells me the Pale Mare has the whole Brannigan barn terrified. As she should.' },
        ],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_pettibone',
    npc: 'pettibone',
    entry: [{ cond: at('side_pettibone_hides', 'settle'), node: 'settle' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { rep: 'townsfolk', gte: 30 }, text: 'Ah. A customer of standing. Do come in. Wipe your boots. No, the other mat. That one is decorative.' },
          { text: ['Pettibone Mercantile. Everything a person needs and several things they don\'t. Cash, or credit if your name\'s good. Is your name good?', 'Good day. Please don\'t lean on the cracker barrel.'] },
        ],
        options: [
          shop('store_larkspur', 'Show me your goods.'),
          { text: 'Any work going?', cond: fresh('side_pettibone_hides'), next: 'hides' },
          { text: 'Who owes you money these days?', tone: 'joke', next: 'ledger' },
          bye(),
        ],
      },
      {
        id: 'hides',
        lines: [{ text: 'As it happens, a glover in Port Ashby wants three deer hides. Good hides, mind. Not shot to lace. I have a contract and no hunter, because the last one moved to Sulfur Flats to dig holes. Bring me three and I\'ll pay fair. Fair-ish.' }],
        options: [
          { text: 'Three deer hides. I can do that.', effects: [{ startQuest: 'side_pettibone_hides' }], next: 'end' },
          { text: 'Not today.', next: 'hub' },
        ],
      },
      {
        id: 'ledger',
        lines: [{ text: 'I should not show you this. It is a breach of commercial confidence. ...You will note, however, that the Calder Valley Townsite & Water Company paid cash for survey stakes, lamp oil, and a gross of matches. A gross! I ask you, who needs a hundred and forty-four matches?' }],
        effects: [{ lore: 'doc_pettiboneLedger' }],
        options: [{ text: 'Somebody planning a lot of fires.', next: 'hub' }, bye()],
      },
      {
        id: 'settle',
        lines: [{ text: 'Three hides. Acceptable. One has a nick but I shall describe it as "character". Now. I can pay you six dollars in coin, or I can put twelve dollars of credit against an account of your choosing. Credit is worth more to me than coin, because coin leaves town.' }],
        options: [
          { text: 'Coin, please.', effects: [{ money: 6 }, { setFlag: 'pettibone_settled', value: true }], next: 'coin' },
          { text: 'Put the credit on the Halvorsen account.', tone: 'kind', effects: [{ setFlag: 'halvorsen_credit', value: true }, { setFlag: 'pettibone_settled', value: true }, { rep: 'honor', amount: 5 }, { rep: 'ranchers', amount: 5 }], next: 'halvorsen' },
          { text: 'Put it against what Silas owes.', effects: [{ setFlag: 'silas_credit', value: true }, { setFlag: 'pettibone_settled', value: true }, { rep: 'ranchers', amount: 3 }], next: 'silas' },
        ],
      },
      { id: 'coin', lines: [{ text: 'Coin. Of course. Off it goes, out of Larkspur forever.' }], options: [bye()] },
      { id: 'halvorsen', lines: [{ text: 'The Halvorsens. Hm. ...That is a decent thing. I shall tell Ingrid it was an error in her favour. She would never accept it otherwise. And she would pay me in eggs.' }], options: [bye()] },
      { id: 'silas', lines: [{ text: 'Your uncle\'s account, reduced to twenty-nine dollars and twenty cents. Most of it is still liniment for the horse. And whiskey for the horse.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_okafor',
    npc: 'okafor',
    entry: [
      { cond: at('delivery_cedar_medicine', 'report'), node: 'report' },
      { cond: active('delivery_cedar_medicine'), node: 'wait' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'met_okafor' }, text: ['Back again. Is something bleeding, or is this social?', 'Sit. No — not there, that is for patients. Unless you are one.'] },
          { text: 'Dr. Okafor. Edinburgh, Liverpool, San Francisco, and now, through a series of decisions I am still reviewing, Larkspur. How can I help?' },
        ],
        options: [
          shop('doctor_larkspur', 'I need supplies.'),
          { text: 'Patch me up, Doctor. ($3)', cond: { money: 3 }, lockedHint: 'Treatment costs $3.', effects: [{ pay: 3 }, { heal: 100 }], next: 'healed' },
          { text: 'You treated Hollis Tolliver. What took his arm?', cond: active('main_tracks'), next: 'bullet' },
          { text: 'Do you need anything carried anywhere?', cond: fresh('delivery_cedar_medicine'), next: 'offer' },
          bye(),
        ],
      },
      { id: 'healed', lines: [{ text: 'There. Clean, closed, and charged. Try to keep the holes on the outside of you.' }], options: [bye()] },
      {
        id: 'bullet',
        lines: [{ text: 'A .44 rifle ball from a Lancaster repeater. Which narrows it to roughly every man in the Territory. But the wad had a printed paper patch — Meridian & Western Supply. The company issues those to its own guards. I mention it purely as a matter of medical curiosity.' }],
        options: [{ text: 'Of course.', next: 'hub' }, bye()],
      },
      {
        id: 'offer',
        lines: [{ text: 'Indeed. A faller at Cedar Notch, Rolf Haugen, had a log roll over his leg. The camp boss wants him back at the saw because they are cutting railroad ties on contract. If he stands on that leg for a week he will lose it. I need tonic, dressings and a letter carried up to Pine Hollow, and I need someone to make him listen.' }],
        options: [
          { text: 'I\'ll take it.', effects: [{ startQuest: 'delivery_cedar_medicine' }, { give: 'tonicHealth' }, { give: 'bandage', qty: 2 }, { give: 'okafor_letter' }, { lore: 'doc_okaforLetter' }], next: 'given' },
          { text: 'Not right now.', next: 'hub' },
        ],
      },
      { id: 'given', lines: [{ text: 'One bottle, two rolls, one letter. Do not drink the tonic yourself, however tempting the ride. It is mostly for him and partly for me.' }], options: [bye()] },
      { id: 'wait', lines: [{ text: 'Cedar Notch is north-east, past Meridian Junction and up Pine Creek. A leg does not wait for scenery.' }], options: [shop('doctor_larkspur', 'Let me buy supplies first.'), bye('On my way.')] },
      {
        id: 'report',
        lines: [
          { cond: { flag: 'rolf_works' }, text: 'He is working? On that leg? ...I see. Then I will ride up myself on Sunday with a saw of my own. I hope you were persuasive about something, at least.' },
          { text: 'He is resting? Truly? You have achieved what two letters and one shouting match did not. Here — your fee, and a little extra from the dispensary. Medicine is the only thing I can afford to be generous with.' },
        ],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_gatlin',
    npc: 'gatlin',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { hasHorse: true }, text: ['Your horse is landing heavy on the near fore. Nothing wrong. Just telling you. What d\'you need.', 'Shoes. Iron. Questions. Pick one.'] },
          { text: 'Smithy. Talk loud.' },
        ],
        options: [
          shop('smith_larkspur', 'Show me what you\'ve made.'),
          { text: 'What can you tell from a horse\'s shoes?', next: 'shoes' },
          bye(),
        ],
      },
      {
        id: 'shoes',
        lines: [{ text: 'Everything. Where it\'s been. Who shod it. If he was drunk. Coyle\'s crew re-shoe stolen stock with caulked shoes from the Fort Rourke sutler. Army pattern. Seen three in a month. Nobody asked me. So I didn\'t say.' }],
        options: [{ text: 'I\'m asking.', next: 'shoes2' }, bye()],
      },
      { id: 'shoes2', lines: [{ text: 'Then I said. Voss sells \'em. Voss sells anything.' }], options: [bye('Obliged.')] },
    ],
  },
  {
    id: 'dlg_crane',
    npc: 'crane',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { time: 'night' }, text: 'The Calder House is a respectable establishment and it is late. Do you require a room, or merely an audience?' },
          { text: ['Calder House Hotel. Clean sheets, honest locks, breakfast at seven sharp. Seven. Not seven-fifteen.', 'Good day. Please sign the register. Legibly.'] },
        ],
        options: [
          shop('hotel_larkspur', 'I\'ll take a room.'),
          { text: 'Anyone interesting in your register lately?', cond: { any: [active('main_tracks'), active('main_surveyor')] }, next: 'register' },
          { text: 'What do you do when it\'s quiet?', next: 'writing' },
          bye(),
        ],
      },
      {
        id: 'register',
        lines: [{ text: 'I do not discuss my guests. ...However, if you were to read the register upside down while I polished this bell, you might notice that a Mr. E. Vance of Port Ashby took Room Four on March the twenty-eighth and left before breakfast on the twenty-ninth, without breakfast, which I take personally.' }],
        options: [{ text: 'The night before the rustlers hit Brannigan\'s.', next: 'register2' }],
      },
      { id: 'register2', lines: [{ text: 'I am sure I would not know. The bell is very clean now.' }], options: [bye('Thank you, Mrs. Crane.')] },
      {
        id: 'writing',
        lines: [{ text: 'I correct the grammar of the menu at the Gilded Spur. ...And if you must know, I write. Serials. "The Ranger of Bitter Creek", under the name of Colonel Rex Harland. Tell a soul and I shall put you in the next instalment, and you will not enjoy it.' }],
        options: [{ text: 'Colonel Harland\'s secret is safe.', tone: 'kind', effects: [{ opinion: 10 }], next: 'end' }, { text: 'Can I be the hero?', tone: 'joke', next: 'hero' }],
      },
      { id: 'hero', lines: [{ text: 'You may be the horse. The horse is very brave and does not talk.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_shaw',
    npc: 'shaw',
    entry: [{ cond: { rep: 'honor', lte: -40 }, node: 'grave' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Peace to you. Sit, if you like. The church is open; the sermon is not. You\'re quite safe.', 'Good day, friend. Is it a question, or just shade you want? Both are free.'] }],
        options: [
          { text: 'Were you at Gallow\'s Hope in \'79?', next: 'gallows' },
          { text: 'Do you bless horses, Reverend?', tone: 'joke', next: 'horse' },
          { text: 'Do you think the railroad\'s good for this valley?', next: 'railroad' },
          bye(),
        ],
      },
      {
        id: 'gallows',
        lines: [{ text: 'I was twenty-four and newly ordained. I went to preach and stayed to dig. Forty-one in five weeks. It was the well — the livery drained into it, and nobody knew until a doctor came from Port Ashby with a microscope. I learned that summer that prayer and clean water are not rivals. I try to preach both.' }],
        options: [{ text: 'I\'m sorry.', tone: 'kind', next: 'hub' }, bye()],
      },
      { id: 'horse', lines: [{ text: 'I bless anything that holds still for it. Horses rarely do, which may say something about horses, or about blessings.' }], options: [{ text: 'Something else.', next: 'hub' }, bye()] },
      {
        id: 'railroad',
        lines: [{ text: 'A railroad is a road. It carries what you put on it. Wheat, cattle, medicine — or men with papers who can buy a valley on a Tuesday. I do not oppose roads. I oppose the habit of letting the men who own them decide where they go.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      { id: 'grave', lines: [{ text: 'I hear things about you that grieve me. The door is still open. It always is. That is rather the point of it.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_tilly',
    npc: 'tilly',
    entry: [
      { cond: at('side_lost_pony', 'return'), node: 'thanks' },
      { cond: active('side_lost_pony'), node: 'wait' },
      { cond: done('side_lost_pony'), node: 'after' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: 'Are you a real cowboy or a pretend one? Mr. Oakes says most of them are pretend. My pony is gone and I\'ve been looking for a real one.' }],
        options: [
          { text: 'Your pony\'s gone?', tone: 'kind', next: 'pony' },
          { text: 'I\'m a real one. Mostly.', tone: 'joke', next: 'pony' },
        ],
      },
      {
        id: 'pony',
        lines: [{ text: 'Clementine. She\'s brown and fat and a little bit spotted on the bottom. The thunder came and she jumped the fence, which she can\'t do, except she did. She went that way. North-east. I drew you a map. That\'s her, there. That\'s the map, there, the little bit.' }],
        options: [
          { text: 'I\'ll find Clementine.', tone: 'kind', effects: [{ startQuest: 'side_lost_pony' }, { opinion: 20 }], next: 'promise' },
          { text: 'I\'m sorry, I can\'t right now.', next: 'end' },
        ],
      },
      { id: 'promise', lines: [{ text: 'Swear? Real cowboy swear? ...Okay. She likes apples but she\'s not allowed. She likes them anyway.' }], options: [bye('Real cowboy swear.')] },
      { id: 'wait', lines: [{ text: 'Did you find her? Is she sad? She gets sad if nobody tells her she\'s pretty.' }], options: [bye('Still looking.')] },
      {
        id: 'thanks',
        lines: [{ text: 'CLEMENTINE! You found her! You\'re a REAL one! Papa, it\'s a real one! ...Here. These are my apples. They\'re for Clementine but she\'s not allowed, so they\'re for your horse. Tell your horse they\'re from me.' }],
        options: [bye('I\'ll tell it.')],
      },
      { id: 'after', lines: [{ text: ['Clementine says hello. She doesn\'t, but she would.', 'I\'m teaching Clementine to jump on purpose now.'] }], options: [bye()] },
    ],
  },

  // ===========================================================================
  // PORT ASHBY
  // ===========================================================================
  {
    id: 'dlg_cordelia',
    npc: 'cordelia',
    entry: [
      { cond: at('main_surveyor', 'editor'), node: 'pruitt' },
      { cond: canChoose, node: 'evidence' },
      { cond: at('main_reckoning', 'press_sayen'), node: 'press_wait' },
      { cond: { flag: 'ending_press' }, node: 'after_press' },
      { cond: { flag: 'ending_law' }, node: 'after_law' },
      { cond: { flag: 'ending_bribe' }, node: 'after_bribe' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { metNpc: 'cordelia' }, text: ['Back again. Do you bring news or do you want to buy a paper? Either way, five cents.', 'I\'m on deadline. You have one minute. Use it well and I\'ll give you two.'] },
          { text: 'Cordelia Fontaine, The Ashby Clarion. Editor, owner, typesetter, and when the boy is sick, delivery. What is it?' },
        ],
        options: [
          { text: 'What\'s in this week\'s paper?', effects: [{ lore: 'doc_clarionDrought' }], next: 'paper' },
          bye(),
        ],
      },
      { id: 'paper', lines: [{ text: 'Drought, water claims, a mule trial. The usual. Read the bit about the Townsite Company. Then read who doesn\'t appear in it.' }], options: [bye()] },
      {
        id: 'pruitt',
        lines: [{ text: 'You\'re asking about Thaddeus Pruitt. People who ask about Pruitt come in two kinds: the ones who want him found, and the ones who want him found first. Which are you?' }],
        options: [
          { text: 'My uncle Silas Brannigan was shot by men paid by the railroad. Pruitt asked him about the river.', tone: 'kind', next: 'pruitt2' },
          { text: 'The kind who asks the questions here.', tone: 'firm', effects: [{ opinion: -5 }], next: 'pruitt2' },
          { text: 'I\'m a railroad man.', tone: 'lie', next: 'pruitt_lie' },
        ],
      },
      { id: 'pruitt_lie', lines: [{ text: 'No you\'re not. Your boots are honest and your coat is from an Army surplus sale. Try again, and this time leave out the part where you insult my intelligence.' }], options: [{ text: 'All right. Silas Brannigan is my uncle.', next: 'pruitt2' }] },
      {
        id: 'pruitt2',
        lines: [{ text: 'Brannigan. The Rocking B. Good. Here is what I know: Pruitt ran the line for the Calder Extension in 1885 along the northern route, by the Sayen treaty stones. Last summer the company filed a survey under his name that runs through the valley instead. Through your uncle\'s ranch, as it happens. In January Pruitt\'s winter camp burned and he vanished.' }],
        effects: [{ lore: 'doc_clarionMissing' }],
        options: [{ text: 'Where was the camp?', next: 'pruitt3' }],
      },
      {
        id: 'pruitt3',
        lines: [{ text: 'South-west, in the Tinaja country of Redstone, below the mesas. I sent a boy. He came back with a sunburn. If Pruitt left anything for anyone, he left it for someone who thinks like a surveyor. Find him and I want the story. Not first — I want it right. But I also want it first.' }],
        options: [
          { text: 'You\'ll get it if I can give it.', tone: 'kind', next: 'end' },
          { text: 'I\'ll decide who gets what when I have it.', tone: 'firm', next: 'pruitt4' },
        ],
      },
      { id: 'pruitt4', lines: [{ text: 'Fair. Annoying, but fair. Go on.' }], options: [bye()] },
      {
        id: 'evidence',
        lines: [{ text: 'You found him. You found both of them, by the look of you. Let me see it. ...Lord. A field book signed every page, an affidavit, a requisition with his initials. This is the railroad\'s river on a plate. Give it to me and it\'s on every breakfast table in the Territory by Thursday and on a Chicago stock exchange by Friday.' }],
        options: [
          { text: 'What happens after you print it?', next: 'evidence_after' },
          {
            text: 'Print it. All of it.',
            cond: hasEvidence,
            effects: [
              { setFlag: 'ending_press', value: true },
              { setFlag: 'reckoning_choice', value: 'press' },
              { take: 'pruitt_notebook' },
              { take: 'silas_affidavit' },
              { rep: 'ranchers', amount: 10 },
              { rep: 'townsfolk', amount: 10 },
              { rep: 'railroad', amount: -25 },
              { rep: 'honor', amount: 5 },
            ],
            next: 'press_go',
          },
          bye('Not yet.'),
        ],
      },
      {
        id: 'evidence_after',
        lines: [{ text: 'The Commission can\'t accept a grant built on a forgery the whole Territory has read. The company will have to build the northern line it agreed to, or lose its land. Vance will run. Ten to one he\'ll never see a courtroom; I won\'t pretend otherwise. A newspaper can\'t hang anybody. It can only make it impossible to pretend.' }],
        options: [{ text: 'And the Sayen? The north route runs along their boundary.', next: 'evidence_sayen' }, { text: 'Back to it.', next: 'evidence' }],
      },
      {
        id: 'evidence_sayen',
        lines: [{ text: 'That is the right question and I don\'t have the answer. Which is why, if you give me this, I\'ll need the Sayen Council\'s own word printed beside it. I will not have the Clarion telling their side for them. Ask me again when you decide.' }],
        options: [{ text: 'Back to it.', next: 'evidence' }],
      },
      {
        id: 'press_go',
        lines: [{ text: 'Good. Now, one more ride. The Sayen agreement is the centre of this and I won\'t print a word about it from a railroad copy. Go to Sayen Valley. Ask Tolani Ashe, or the council, for their statement. I\'ll set the rest of the type while you ride.' }],
        options: [bye('I\'ll ride.')],
      },
      { id: 'press_wait', lines: [{ text: 'Type\'s set. I\'m waiting on the Sayen statement. Vance\'s clerks are at the telegraph office every hour. Ride faster.' }], options: [bye()] },
      {
        id: 'after_press',
        lines: [{ text: ['Three printings. Three! I had to borrow ink from the Methodist tract society. Sit down, I owe you a drink and an apology for everything I said about your coat.', 'Vance took the night train east. I\'d rather have seen him in a dock, but I\'ll take him in a dining car, frightened.'] }],
        options: [bye()],
      },
      { id: 'after_law', lines: [{ text: 'You gave it to Kincaid. Fine. Correct, probably. I\'ll be in the front row at the trial with three pencils. When the company\'s lawyers start saying "former employee", I want it spelled right.' }], options: [bye()] },
      { id: 'after_bribe', lines: [{ text: 'Pruitt\'s notebook has gone missing again, and the Brannigan kin is buying drinks at The Lakeview. I\'m a newspaperwoman. I can add. Get out of my office.' }], effects: [{ opinion: -30 }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_kincaid',
    npc: 'kincaid',
    entry: [
      { cond: canChoose, node: 'evidence' },
      { cond: at('main_reckoning', 'law_warrant'), node: 'warrant' },
      { cond: { flag: 'ending_law' }, node: 'after_law' },
      { cond: { flag: 'ending_bribe' }, node: 'after_bribe' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { wanted: true }, text: 'There\'s paper on you. I\'d think carefully about why you walked in here.' },
          { cond: { rep: 'honor', gte: 40 }, text: 'Brannigan\'s kin. I hear good things. I distrust good things on principle, but I hear them.' },
          { text: ['Territorial Marshal. If it\'s a complaint, there\'s a form. If it\'s a crime, there\'s a longer form.', 'Kincaid. What do you need?'] },
        ],
        options: [
          { text: 'I want to settle a bounty on myself.', cond: { wanted: true }, next: 'bounty' },
          { text: 'What do you know about Dutch Coyle?', next: 'coyle' },
          { text: 'Why don\'t you arrest the railroad?', cond: done('main_tracks'), tone: 'firm', next: 'railroad' },
          bye(),
        ],
      },
      {
        id: 'bounty',
        lines: [{ text: 'Fine, costs and a lecture. I\'ll waive the lecture.' }],
        options: [
          { text: 'Pay $60.', cond: { money: 60 }, lockedHint: 'You need $60.', effects: [{ pay: 60 }, { bountyClear: true }], next: 'end' },
          bye('Another day.'),
        ],
      },
      {
        id: 'coyle',
        lines: [{ text: 'Dietrich Kohl. Calls himself Dutch. Freighter turned horse thief turned businessman, by his own account. Reads newspapers, pays his bar tabs, shoots straight. Three hundred and fifty dollars on him and nobody collecting, because the Roost is a box canyon with one way in.' }],
        effects: [{ lore: 'doc_wantedCoyle' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'railroad',
        lines: [{ text: 'You don\'t arrest a railroad. You arrest a man, with evidence a judge can\'t wave away, and you hope the railroad decides he\'s cheaper to lose than to defend. Bring me paper. Signed, dated, witnessed. Not stories.' }],
        options: [bye('Paper. Understood.')],
      },
      {
        id: 'evidence',
        lines: [{ text: 'Sit. Show me. ...Field book, signed and dated every page. Sworn affidavit, witnessed. A company requisition. If the Surveyor General\'s filed plats don\'t match this book, somebody forged a public record, and that is a felony I can hang a warrant on today.' }],
        options: [
          { text: 'What happens if I give this to you?', next: 'evidence_after' },
          {
            text: 'Take it, Marshal. Do it by the book.',
            cond: hasEvidence,
            effects: [
              { setFlag: 'ending_law', value: true },
              { setFlag: 'reckoning_choice', value: 'law' },
              { take: 'pruitt_notebook' },
              { take: 'silas_affidavit' },
              { rep: 'ranchers', amount: 10 },
              { rep: 'townsfolk', amount: 5 },
              { rep: 'railroad', amount: -10 },
              { rep: 'honor', amount: 10 },
            ],
            next: 'law_go',
          },
          bye('Not yet.'),
        ],
      },
      {
        id: 'evidence_after',
        lines: [{ text: 'I arrest Vance. The company sends lawyers who say he acted alone, and they may even be right. The Commission freezes the grant until a resurvey, which takes a year. Your uncle keeps his land while lawyers keep their fees. It\'s slow and it\'s dull and it holds. Newspapers are faster. They\'re also louder than they are careful.' }],
        options: [{ text: 'Back to it.', next: 'evidence' }],
      },
      {
        id: 'law_go',
        lines: [{ text: 'Good. I\'m swearing the warrant now. Vance keeps an office at the depot. I want you there when I serve it — witnesses keep men honest. Including me. Go on ahead; I\'ll be right behind you.' }],
        options: [bye('I\'ll meet you there.')],
      },
      { id: 'warrant', lines: [{ text: 'Warrant\'s signed. Depot. Now, while the noon train\'s in and there are plenty of people watching.' }], options: [bye()] },
      {
        id: 'after_law',
        lines: [{ text: ['Vance hasn\'t said a word since his lawyer arrived. The lawyer hasn\'t stopped. The Commission has suspended the grant. It\'s not justice yet, but it\'s the paperwork for it.', 'The territory owes you. It won\'t pay, but it owes you.'] }],
        options: [bye()],
      },
      { id: 'after_bribe', lines: [{ text: 'I hear Ellery Vance is very pleased with himself this week. I hear a lot of things. One day I\'ll hear the right one.' }], effects: [{ opinion: -20 }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_granger',
    npc: 'granger',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'vance_arrested' }, text: 'Good arrest.' },
          { cond: { wanted: true }, text: 'Don\'t.' },
          { text: ['Marshal\'s inside.', 'Mm.', 'You ride like cavalry. Remounts?'] },
        ],
        options: [
          { text: 'You were a scout?', next: 'scout' },
          bye(),
        ],
      },
      { id: 'scout', lines: [{ text: 'Twelve years. Learned to say less. You should try it.' }], options: [bye('...')] },
    ],
  },
  {
    id: 'dlg_vance',
    npc: 'vance',
    entry: [
      { cond: at('main_reckoning', 'law_warrant'), node: 'arrest' },
      { cond: canChoose, node: 'offer' },
      { cond: { flag: 'ending_bribe' }, node: 'after_bribe' },
      { cond: done('main_surveyor'), node: 'wary' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { metNpc: 'vance' }, text: 'Ah, Brannigan\'s kin, again. You know, I sent your uncle a very fair offer. Twice. When he turns up, do tell him the offer stands. Offers don\'t always.' },
          { text: 'Ellery Vance, Meridian & Western. Land and right-of-way. You\'ll be Silas Brannigan\'s family; you have his habit of looking at a man as if checking his teeth. A pleasure.' },
        ],
        options: [
          { text: 'What does the railroad want with ranch land?', next: 'pitch' },
          { text: 'Where were you on the night of March 29th?', cond: { any: [active('main_tracks'), active('main_surveyor')] }, tone: 'firm', next: 'alibi' },
          bye(),
        ],
      },
      {
        id: 'pitch',
        lines: [{ text: 'Progress, crudely. A railroad needs water stations, town sites, sidings. The valley\'s going to be sold, friend; the only question is to whom and how gently. I prefer gently. I\'m told I\'m very gentle.' }],
        options: [bye('I\'ll bear it in mind.')],
      },
      { id: 'alibi', lines: [{ text: 'In Larkspur, at the Calder House. Mrs. Crane\'s mattresses are very fine. Ask her. ...Is there a reason you ask? No? Then good day.' }], options: [bye()] },
      {
        id: 'wary',
        lines: [{ text: 'You\'ve been travelling. Redstone, I hear. The mission ruins. Lovely, I\'m told, if you like lizards and old men who talk to themselves. Be careful out there. The Territory is full of accidents.' }],
        options: [
          { text: 'Is that a threat, Mr. Vance?', tone: 'firm', next: 'wary2' },
          bye('I\'ll be careful.'),
        ],
      },
      { id: 'wary2', lines: [{ text: 'It\'s an observation. I make a great many. It\'s my job.' }], options: [bye()] },
      {
        id: 'offer',
        lines: [{ text: 'Let\'s not waste each other\'s afternoons. You have a notebook that belongs to a confused surveyor and a statement by an old man who was, by his own account, shot in the dark. I have this. Five hundred dollars, in notes. Your uncle\'s ranch is left out of the second phase. He can stay and grow old and shout at horses. Everyone else will sell anyway. They always do.' }],
        options: [
          { text: 'Why would I believe the ranch stays out?', next: 'offer2' },
          {
            text: 'Take the money and hand over the evidence.',
            cond: hasEvidence,
            effects: [
              { money: 500 },
              { setFlag: 'ending_bribe', value: true },
              { setFlag: 'reckoning_choice', value: 'bribe' },
              { take: 'pruitt_notebook' },
              { take: 'silas_affidavit' },
              { rep: 'honor', amount: -25 },
              { rep: 'ranchers', amount: -20 },
              { rep: 'coyle', amount: 10 },
              { rep: 'railroad', amount: 15 },
            ],
            next: 'bribe_done',
          },
          { text: 'You\'ll hang, Vance.', tone: 'threat', next: 'offer_no' },
        ],
      },
      {
        id: 'offer2',
        lines: [{ text: 'Because it\'s cheaper. One ranch is a rounding error. Nine ranches is a river. I don\'t need the Rocking B; I need the river frontage below it, and I have most of that already. I\'m not a monster. I\'m an accountant with a better tailor.' }],
        options: [{ text: 'Back to the offer.', next: 'offer' }],
      },
      { id: 'offer_no', lines: [{ text: 'Perhaps. Men in my profession very rarely do, though. Do think about it. The offer stands until you walk out of this depot. After that, I make other arrangements.' }], options: [bye()] },
      { id: 'bribe_done', lines: [{ text: 'Sensible. Your uncle will be furious and in five years he\'ll thank you. Most people do. ...Oh, and do tell Mr. Coyle nothing. I\'ll handle Mr. Coyle.' }], options: [bye()] },
      {
        id: 'arrest',
        lines: [{ text: 'Ah. And the Marshal behind you, and a warrant. Before she reads it — the five hundred is still on the table. A thousand. You understand you\'re not stopping the railroad, only me? Someone else will have this desk by Monday.' }],
        options: [
          { text: 'Ellery Vance, you\'re under arrest.', tone: 'firm', effects: [{ setFlag: 'vance_arrested', value: true }, { rep: 'railroad', amount: -10 }, { rep: 'townsfolk', amount: 5 }, { npcLeave: 'vance' }], next: 'arrested' },
          { text: 'Then someone else can answer for it on Monday.', tone: 'kind', effects: [{ setFlag: 'vance_arrested', value: true }, { npcLeave: 'vance' }], next: 'arrested' },
        ],
      },
      { id: 'arrested', lines: [{ text: 'Very well. Marshal, I\'ll want my hat. And a lawyer. In that order. ...You\'ve made Dutch Coyle unemployed, you know. He takes that badly.' }], options: [bye()] },
      { id: 'after_bribe', lines: [{ text: 'My favourite investor. Everything is proceeding. Do give my regards to your uncle, from a distance.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_asquith',
    npc: 'asquith',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { weather: 'rain' }, text: 'Oh — oh dear. The mud. Please, the mat. Both mats. Thank you. Welcome to the Lakeshore.' },
          { text: ['Welcome to the Lakeshore Hotel. Electric bells in every room. Do not ring them for amusement, the last gentleman did and the boy has not recovered.', 'Good day. Is it a room you\'re after? Do say it\'s a room.'] },
        ],
        options: [shop('hotel_ashby', 'A room, please.'), { text: 'You don\'t sound like you\'re from here.', next: 'english' }, bye()],
      },
      { id: 'english', lines: [{ text: 'I am from Surrey. Originally. Broadly. ...Cincinnati. Please don\'t tell the guests.' }], options: [bye('Your secret\'s safe.')] },
    ],
  },
  {
    id: 'dlg_celeste',
    npc: 'celeste',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { time: 'night' }, text: 'Evening. The railroad crowd\'s in tonight, so keep your voice low and your elbows in.' },
          { text: ['Welcome to The Lakeview. Best view of the lake in town and the worst piano. What can I get you?', 'You\'re not company men. That\'s refreshing. Sit.'] },
        ],
        options: [
          shop('saloon_ashby', 'Pour me something.'),
          { text: 'Is there a game going?', effects: [{ startActivity: 'blackjack' }], next: 'end' },
          { text: 'Does Ellery Vance drink here?', cond: done('main_tracks'), next: 'vance' },
          bye(),
        ],
      },
      {
        id: 'vance',
        lines: [{ text: 'Sherry. One glass, never two. Tips like a man who expects to be remembered. Last week he met a fellow with a crooked front tooth at the corner table and paid for both drinks with a fifty. Nobody pays for sherry with a fifty unless they want the change counted out slowly, in front of people.' }],
        options: [{ text: 'Thank you.', tone: 'kind', next: 'end' }],
      },
    ],
  },
  {
    id: 'dlg_ingram',
    npc: 'ingram',
    entry: [{ cond: { rep: 'notoriety', gte: 60 }, node: 'refuse' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Ingram Arms. You are sober? Good. You are in a hurry? Not good. Slow down, then we talk.', 'Hold it like that and you will shoot your own horse. Here. Like this.'] }],
        options: [shop('gun_ashby', 'Show me what you sell.'), { text: 'Who buys the most guns these days?', next: 'buyers' }, bye()],
      },
      { id: 'buyers', lines: [{ text: 'Railroad security. Forty Lancaster repeaters this winter, paid by "Right-of-Way Account, Special." I did not know right-of-way needs forty rifles. Now I know.' }], options: [bye()] },
      { id: 'refuse', lines: [{ text: 'No. I know your name. I do not sell to you. Go to Voss at the fort; he sells to anyone.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_delacroix',
    npc: 'delacroix',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { rep: 'honor', gte: 50 }, text: 'Ah! A person of character! Character deserves a better collar. Come, come.' },
          { text: ['Bonjour, bonjour. Your coat — no, don\'t tell me. Army surplus, 1879 pattern, let out at the shoulder by someone who loved you but could not sew.', 'Delacroix Clothier. Dress for the life you intend, not the one you were issued.'] },
        ],
        options: [shop('tailor_ashby', 'Show me your clothes.'), bye()],
      },
    ],
  },
  {
    id: 'dlg_lianchen',
    npc: 'lianchen',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Water Street General Store. Flour, coffee, cartridges, liniment. My husband is in the back counting things. He likes counting things.', 'Welcome. You look like you came a long way. Coffee is fresh.'] }],
        options: [
          shop('store_ashby', 'I\'ll look around.'),
          { text: 'Your husband worked for the railroad?', next: 'husband' },
          bye(),
        ],
      },
      {
        id: 'husband',
        lines: [{ text: 'Four years laying track, from the lake to Meridian Junction. A rail fell on his foot. The company gave him eleven dollars and a letter saying it was his fault. We opened this store with the eleven dollars. I keep the letter on the wall so I remember who our competition is.' }],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_lowell',
    npc: 'lowell',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Dr. Lowell. Sit down, you\'re swaying.', 'If you\'re here to tell me lady doctors are unnatural, I\'ve heard it, and I charge extra for it.'] }],
        options: [
          shop('doctor_ashby', 'I need medicine.'),
          { text: 'Patch me up. ($3)', cond: { money: 3 }, lockedHint: 'Treatment costs $3.', effects: [{ pay: 3 }, { heal: 100 }], next: 'healed' },
          { text: 'Do you know Dr. Okafor in Larkspur?', next: 'okafor' },
          bye(),
        ],
      },
      { id: 'healed', lines: [{ text: 'Done. Drink water, not whiskey. You won\'t, but I\'ve said it.' }], options: [bye()] },
      { id: 'okafor', lines: [{ text: 'We correspond. He thinks whiskey is an antiseptic in extremity. I think he\'s an extremity. Give him my regards and tell him he\'s wrong about the carbolic.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_benito',
    npc: 'benito',
    entry: [
      { cond: at('side_ashby_derby', 'purse'), node: 'purse' },
      { cond: at('side_ashby_derby', 'race'), node: 'ready' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { horseBond: 4 }, text: 'Now that is a horse that loves its rider. You cannot buy that. Believe me, I have tried to sell it.' },
          { text: ['Ashby Stables & Horse Exchange. Benito Ruiz. Anything with four legs and a good temper, and a few with only the legs.', 'Buenas. Buying, selling, or boarding?'] },
        ],
        options: [
          shop('stable_ashby', 'Let\'s talk horses.'),
          { text: 'Tell me about the Ashby Derby.', cond: fresh('side_ashby_derby'), next: 'derby' },
          { text: 'You bought spotted mares from an Agency trader.', cond: done('horse_sayen_mares'), tone: 'firm', next: 'mares' },
          bye(),
        ],
      },
      {
        id: 'derby',
        lines: [{ text: 'Along the lakeshore, past the hotels, round the bandstand and back. Ten dollars to enter, a hundred and twenty to win, and a silver bridle I had made in Sonora. The money is good. The bridle is better.' }],
        options: [
          { text: 'I\'m in. ($10)', cond: { money: 10 }, lockedHint: 'You need $10.', effects: [{ pay: 10 }, { startQuest: 'side_ashby_derby' }, { setFlag: 'derby_entered', value: true }], next: 'entered' },
          bye('Another time.'),
        ],
      },
      { id: 'entered', lines: [{ text: 'Bueno. Come back when your horse is fed and rested, and we run.' }], options: [{ text: 'We\'re ready now.', effects: [{ startActivity: 'race' }], next: 'end' }, bye('Soon.')] },
      { id: 'ready', lines: [{ text: 'The course is clear. You ride?' }], options: [{ text: 'We ride.', effects: [{ startActivity: 'race' }], next: 'end' }, bye('Not yet.')] },
      { id: 'purse', lines: [{ text: '¡Qué carrera! A hundred and twenty and the bridle. Wear it at the Larkspur Cup so Josiah Oakes can be jealous.' }], options: [bye()] },
      {
        id: 'mares',
        lines: [{ text: '...Six. Last winter. Kimbrough said the Agency condemned them. They were sound, all six, and I told myself the Agency was stupid instead of asking whether Kimbrough was a thief. I have sold four. Two are still here.' }],
        options: [
          { text: 'Send the two back to Tolani Ashe. Pay her for the other four.', tone: 'firm', effects: [{ setFlag: 'benito_repays', value: true }, { rep: 'sayen', amount: 10 }, { rep: 'honor', amount: 5 }], next: 'mares_ok' },
          { text: 'That\'s between you and your conscience.', next: 'end' },
        ],
      },
      { id: 'mares_ok', lines: [{ text: 'Sí. Yes. It will cost me the profit and some more. ...It is cheaper than this feeling. I will write to her today.' }], options: [bye()] },
    ],
  },

  // ===========================================================================
  // BRANNIGAN RANCH
  // ===========================================================================
  {
    id: 'dlg_hollis',
    npc: 'hollis',
    entry: [
      { cond: { all: [{ any: [at('main_arrival', 'foreman'), at('main_arrival', 'choose')] }, { notFlag: 'starter_horse_chosen' }] }, node: 'meet' },
      { cond: at('main_arrival', 'care'), node: 'care' },
      { cond: at('main_arrival', 'reward'), node: 'gear' },
      { cond: at('main_tracks', 'report'), node: 'report' },
      { cond: active('main_tracks'), node: 'tracks' },
      { cond: at('main_reckoning', 'bribe_ranch'), node: 'bribe' },
      { cond: { flag: 'silas_home' }, node: 'after' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'meet',
        lines: [{ text: 'Stop there. ...Huh. You\'re the Army one. Silas said you\'d come and I said you wouldn\'t, so that\'s a dollar I owe him, if he\'s alive to collect it. Hollis Tolliver. Foreman. Of nothing much, this week.' }],
        options: [
          { text: 'Where\'s Silas?', tone: 'firm', next: 'story' },
          { text: 'You\'re hurt. Sit down before you fall down.', tone: 'kind', effects: [{ opinion: 5 }], next: 'story' },
        ],
      },
      {
        id: 'story',
        lines: [{ text: 'Rustlers. Thirty-odd head since Christmas, nine more on the twenty-ninth. We caught \'em on the south road, loading feed off a railroad freight wagon, if you can believe it. Shooting started. I caught one in the arm. Wagon caught fire. Silas went after the ones that ran with the horses, and he told me to stay, and I did, because I\'m a fool who does what he\'s told. That was five days ago.' }],
        options: [{ text: 'Then I go after him.', next: 'corral' }, { text: 'Who would pay rustlers with railroad freight?', next: 'story2' }],
      },
      {
        id: 'story2',
        lines: [{ text: 'That\'s the question, ain\'t it. Every outfit in the valley\'s lost stock. Every outfit that\'s lost stock is getting letters from a land company. I can add. I can\'t prove.' }],
        options: [{ text: 'Then I go after him.', next: 'corral' }],
      },
      {
        id: 'corral',
        lines: [{ text: 'Not on Josiah\'s Biscuit you don\'t. There\'s three left in the corral worth the name. Rustlers left \'em because they\'re too much trouble or too well known. Take your pick. Silas would want you on one of ours.' }],
        options: [
          { text: 'The bay mare by the trough.', next: 'juniper' },
          { text: 'The spotted one watching me.', next: 'absalom' },
          { text: 'The dun stallion in the far pen.', next: 'ransom' },
        ],
      },
      {
        id: 'juniper',
        lines: [{ text: 'Juniper. Quarter mare, seven years old. She\'ll stand in gunfire chewing hay like it\'s a band concert. Not the fastest over distance, but she turns on a dime and gives you change. She\'ll follow you into a river and look disappointed you didn\'t bring a towel. Steady. You\'d never lose her.' }],
        options: [
          {
            text: 'Juniper. She\'s the one.',
            effects: [
              { giveHorse: { breedId: 'quarter', name: 'Juniper', sex: 'mare', training: 'trained', seed: 1101 } },
              { setFlag: 'starter_horse_chosen', value: true },
              { setFlag: 'starter_horse', value: 'juniper' },
              { completeObjective: 'main_arrival:pick' },
            ],
            next: 'chose_juniper',
          },
          { text: 'Show me the others.', next: 'corral' },
        ],
      },
      {
        id: 'absalom',
        lines: [{ text: 'Absalom. Appaloosa gelding, bought off the Sayen two springs back. Smartest horse on the place, and he knows it. He\'ll open a gate latch if you leave him long enough and he\'ll inspect anything that moves, including rattlesnakes, which is a problem. Stubborn when he thinks you\'re wrong. Annoyingly, he\'s usually right. Good wind, good feet, good for long country.' }],
        options: [
          {
            text: 'Absalom. We\'ll argue, and I\'ll lose.',
            effects: [
              { giveHorse: { breedId: 'appaloosa', name: 'Absalom', sex: 'gelding', training: 'broke', seed: 2202 } },
              { setFlag: 'starter_horse_chosen', value: true },
              { setFlag: 'starter_horse', value: 'absalom' },
              { completeObjective: 'main_arrival:pick' },
            ],
            next: 'chose_absalom',
          },
          { text: 'Show me the others.', next: 'corral' },
        ],
      },
      {
        id: 'ransom',
        lines: [{ text: 'Ransom. Mustang stallion off Mustang Flats, four years old, green-broke if you\'re generous. Mateo\'s been working him. He\'s thrown Mateo nine times and Mateo\'s the best we\'ve got. Fast, brave, sound as a church bell, and he doesn\'t want you. He might decide to, if you earn it. Silas was saving him. I reckon for somebody like you.' }],
        options: [
          {
            text: 'Ransom. I\'ve broken worse for the Army.',
            effects: [
              { giveHorse: { breedId: 'mustang', name: 'Ransom', sex: 'stallion', training: 'green', seed: 3303 } },
              { setFlag: 'starter_horse_chosen', value: true },
              { setFlag: 'starter_horse', value: 'ransom' },
              { completeObjective: 'main_arrival:pick' },
            ],
            next: 'chose_ransom',
          },
          { text: 'Show me the others.', next: 'corral' },
        ],
      },
      { id: 'chose_juniper', lines: [{ text: 'Good choice. Sensible. Silas would\'ve made it too, then complained he wanted the stallion. Go and get acquainted. Brush her, feed her, water her. Then come back and I\'ll find you a saddle that isn\'t mostly holes.' }], options: [bye('Will do.')] },
      { id: 'chose_absalom', lines: [{ text: 'Ha. He\'s already looking at your pockets. Brush him, feed him, water him, and keep your hat on your head. He eats hats. Then come back for gear.' }], options: [bye('Will do.')] },
      { id: 'chose_ransom', lines: [{ text: 'Lord help you. Mateo\'s going to cry. Go slow. Brush him, feed him, water him. Let him smell your hands before you put them anywhere. Come back after and I\'ll fit you out — if you\'ve still got arms.' }], options: [bye('Will do.')] },
      {
        id: 'care',
        lines: [{ text: ['Don\'t talk to me, talk to the horse. Brush, feed, water. Oats and hay in the barn, trough by the windmill.', 'You\'re doing it right. Keep doing it. I\'m not watching.'] }],
        options: [bye()],
      },
      {
        id: 'gear',
        lines: [{ text: 'Looks like the two of you might get along. Here. Stock saddle, snaffle bridle, saddlebags, bedroll — Silas\'s spares, which means they\'re better than his firsts. Feed in the bags. And one more thing: that freight wagon\'s still out there, burned, couple miles west on the south road. I haven\'t had the stomach to look at it. Maybe you do.' }],
        options: [
          { text: 'I\'ll start there.', next: 'end' },
          { text: 'Thank you, Hollis. Really.', tone: 'kind', effects: [{ opinion: 10 }], next: 'gear2' },
        ],
      },
      { id: 'gear2', lines: [{ text: 'Yeah, well. Don\'t get sentimental, I\'ve only got the one good arm and I need it for the rifle.' }], options: [bye()] },
      {
        id: 'tracks',
        lines: [
          { cond: at('main_tracks', 'lead'), text: 'Are those — Lord, is that Saltlick? Bring \'em into the corral, quick, before they remember they were stolen.' },
          { text: ['Wagon\'s west on the south road. Fort\'s south past the Tinaja. Go on, I\'ll hold the place. One arm\'s enough for a porch.', 'Mateo\'s keeping the corral. I\'m keeping the rifle. You\'re keeping your head down, I hope.'] },
        ],
        options: [{ text: 'Let me see what\'s in the barn.', effects: [{ openShop: 'ranch_brannigan' }], next: 'end' }, bye()],
      },
      {
        id: 'report',
        lines: [{ text: 'Saltlick. Domino. Parson. You brought \'em home. ...And Silas is alive. Shot, but alive and heading north. I\'ve been sitting on this porch for a week deciding what to say at his funeral. Now I have to think of something else to say to him. Something rude, probably.' }],
        options: [
          { text: 'Coyle answers to "the railroad man". Silas mentioned a surveyor last fall.', next: 'report2' },
        ],
      },
      {
        id: 'report2',
        lines: [{ text: 'Pruitt. That was his name. Little fella, spectacles, asked about the river in a dry year, made notes like he was taking dictation from God. The Port Ashby paper ran a piece in February asking where he\'d got to. Go talk to the woman who runs it. Fontaine. She frightens the bank.' }],
        options: [bye('Port Ashby, then.')],
      },
      {
        id: 'bribe',
        lines: [{ text: 'You\'re back. Didn\'t go to the Marshal, I hear. Didn\'t go to the paper either. You\'ve got a new coat and a face like somebody owes you money, or you owe them. Which is it?' }],
        options: [
          { text: 'Vance paid me. The ranch stays out of it.', tone: 'kind', effects: [{ opinion: -10 }, { setFlag: 'told_hollis_truth', value: true }], next: 'bribe_truth' },
          { text: 'It\'s handled. Leave it.', tone: 'firm', effects: [{ opinion: -20 }], next: 'bribe_lie' },
          { text: 'Kincaid\'s looking into it.', tone: 'lie', effects: [{ opinion: -25 }, { rep: 'honor', amount: -5 }], next: 'bribe_lie' },
        ],
      },
      { id: 'bribe_truth', lines: [{ text: '...Well. At least you said it to my face. The Halvorsens\'ll sell. Musgrave won\'t, but nobody wants his snow. Everybody between will go one at a time and nobody\'ll remember why. I\'m going to go sit with the horses. They don\'t take money.' }], options: [bye()] },
      { id: 'bribe_lie', lines: [{ text: 'Sure. Handled. ...There\'s a man on a black horse been watching the gate since sunup. Maybe you\'ll handle him too.' }], options: [bye()] },
      {
        id: 'after',
        lines: [
          { cond: { flag: 'ending_bribe' }, text: 'Morning. Horses are fed. Don\'t need anything from you.' },
          { cond: { flag: 'ending_press' }, text: 'Read the Clarion to the horses this morning. Domino liked the part about the stock price.' },
          { text: ['Silas is on the porch giving orders to a corral that can\'t hear him. Feels like home.', 'Got eleven head back in the corrals. Eleven! Mateo\'s been singing. Make him stop.'] },
        ],
        options: [{ text: 'Let me see what\'s in the barn.', effects: [{ openShop: 'ranch_brannigan' }], next: 'end' }, bye()],
      },
      {
        id: 'hub',
        lines: [{ text: ['Need something?', 'Horses are fed. I\'m not. You?'] }],
        options: [{ text: 'Let me see what\'s in the barn.', effects: [{ openShop: 'ranch_brannigan' }], next: 'end' }, bye()],
      },
    ],
  },
  {
    id: 'dlg_mateo',
    npc: 'mateo',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'starter_horse', eq: 'ransom' }, text: '¡Ay! You took Ransom. He threw me nine times. Nine! If he throws you, tell me, so I feel better.' },
          { cond: { flag: 'starter_horse', eq: 'absalom' }, text: 'Absalom ate my hat last week. If you see a hat in his teeth, it is mine. I want it back.' },
          { cond: { flag: 'starter_horse', eq: 'juniper' }, text: 'Juniper is the best mare in the valley. She loves you already. She loves everybody, but you most, today.' },
          { text: 'Hola! I keep the barn. Hay, oats, brushes, anything for the horses.' },
        ],
        options: [
          shop('ranch_brannigan', 'What have you got in the barn?'),
          { text: 'How do I get a horse to trust me faster?', next: 'trust' },
          { text: 'Why do you sing to them?', tone: 'joke', next: 'sing' },
          bye(),
        ],
      },
      {
        id: 'trust',
        lines: [{ text: 'Faster? No. Slower. Brush every day. Feed from your hand. Talk to them — they don\'t know words, but they know when you mean them. Don\'t ride them half to death. And when they are frightened, you stand still. Standing still is the hardest trick there is.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      { id: 'sing', lines: [{ text: 'Because when I sing, they are so busy being embarrassed for me, they forget to be afraid.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_silas_ranch',
    npc: 'silas_ranch',
    entry: [
      { cond: at('main_reckoning', 'epilogue_law'), node: 'law' },
      { cond: at('main_reckoning', 'epilogue_press'), node: 'press' },
      { cond: at('main_reckoning', 'epilogue_bribe'), node: 'bribe' },
      { cond: { flag: 'ending_bribe' }, node: 'after_bribe' },
      { node: 'after' },
    ],
    nodes: [
      {
        id: 'law',
        lines: [{ text: 'Sit down. No, the good chair. I\'m wounded, I get to be generous. ...Kincaid came out here herself to take my statement again. Read it back to me like a schoolteacher. Vance is in her jail and the grant\'s frozen. Nothing\'s won. Everything\'s stopped. At my age that\'s the same thing.' }],
        options: [{ text: 'And Coyle\'s dead in your yard.', next: 'law2' }, { text: 'You could\'ve died up there.', tone: 'kind', next: 'law2' }],
      },
      {
        id: 'law2',
        lines: [{ text: 'Could\'ve. Didn\'t. Minerva wouldn\'t let me, out of spite. ...Listen. I\'m sixty-one with one working shoulder and a ranch that needs two. I\'d like your name on the deed beside mine. Not as a gift. As a partner. You\'d have to put up with me. That\'s the price.' }],
        options: [
          { text: 'Partners. I\'ll put up with you.', tone: 'kind', effects: [{ setFlag: 'ranch_partner', value: true }, { setFlag: 'epilogue_done', value: true }, { rep: 'ranchers', amount: 10 }], next: 'finch' },
          { text: 'Let me think on it. But yes, probably.', effects: [{ setFlag: 'epilogue_done', value: true }], next: 'finch' },
        ],
      },
      {
        id: 'press',
        lines: [{ text: 'I\'ve read the Clarion so many times the ink\'s on my thumbs. Vance ran east like a scalded cat. The company has to build north or lose the grant. We keep the river. ...Tolani Ashe rode over yesterday. Said the Sayen\'ll get their fee and their siding, and the railroad on their doorstep with it. She said "thank you" and "you understand this is not simple" in the same breath. I said nothing\'s simple. She said that\'s what people say when it\'s simpler for them.' }],
        options: [{ text: 'She\'s right.', next: 'press2' }, { text: 'It was still the right thing.', tone: 'firm', next: 'press2' }],
      },
      {
        id: 'press2',
        lines: [{ text: 'She is. And it was. Both. That\'s the trouble with being old — you stop getting to pick just one. ...She wants to buy a colt off the Pale Mare line, if we ever get one. I said yes before she finished asking. And I want you on the deed beside me, if you\'ll stay. Partners. Don\'t make that face.' }],
        options: [
          { text: 'Partners.', tone: 'kind', effects: [{ setFlag: 'ranch_partner', value: true }, { setFlag: 'epilogue_done', value: true }, { rep: 'ranchers', amount: 10 }, { rep: 'sayen', amount: 5 }], next: 'finch' },
          { text: 'I\'ll stay through the drive and we\'ll see.', effects: [{ setFlag: 'epilogue_done', value: true }], next: 'finch' },
        ],
      },
      {
        id: 'bribe',
        lines: [{ text: 'Hollis tells me Vance is a happy man this week. Coyle came here to kill you because Vance told him to. Vance knew you\'d taken his money, so he knew you\'d keep quiet, so he knew you were worth more dead. That\'s a man\'s arithmetic. I\'d like to hear yours.' }],
        options: [
          { text: 'You\'d have lost everything in court. I made sure you kept the ranch.', tone: 'firm', next: 'bribe_defend' },
          { text: 'I was wrong. The money\'s yours — the ranch\'s. Use it to buy the Halvorsens out of debt.', tone: 'kind', cond: { money: 400 }, lockedHint: 'You need $400.', effects: [{ pay: 400 }, { setFlag: 'bribe_returned', value: true }, { rep: 'honor', amount: 15 }, { rep: 'ranchers', amount: 10 }], next: 'bribe_return' },
          { text: 'I don\'t owe you an explanation.', tone: 'threat', effects: [{ rep: 'honor', amount: -5 }], next: 'bribe_cold' },
        ],
      },
      {
        id: 'bribe_defend',
        lines: [{ text: 'You did. I keep the ranch and I lose the valley. I get to sit on my porch and watch my neighbours load wagons one at a time and wave. That\'s what you bought me. ...I don\'t hate you for it. I\'d like to. You did it for me, and that\'s the worst of it.' }],
        options: [{ text: 'I\'m sorry.', effects: [{ setFlag: 'epilogue_done', value: true }], next: 'finch' }],
      },
      {
        id: 'bribe_return',
        lines: [{ text: '...Four hundred dollars. Ingrid Halvorsen\'s note at the bank is three-eighty. Ha. You know what, that\'s the first thing Vance\'s money\'s ever done that I\'d sign my name to. It doesn\'t fix it. But it\'s a start of fixing. Sit down. Supper\'s terrible. Stay anyway.' }],
        options: [{ text: 'I\'ll stay.', effects: [{ setFlag: 'epilogue_done', value: true }], next: 'finch' }],
      },
      { id: 'bribe_cold', lines: [{ text: 'No. I suppose you don\'t. Door\'s where it was. Your room\'s still aired. I won\'t air it again.' }], effects: [{ setFlag: 'epilogue_done', value: true }], options: [bye()] },
      {
        id: 'finch',
        lines: [
          { cond: { flag: 'finch_spared' }, text: 'Oh — and this came for you. Postmarked Cedar Notch. Handwriting like a chicken walked through ink. Go on, read it. I\'ll pretend I didn\'t.' },
          { text: 'Now get off my porch. There\'s horses to be ridden and I can\'t ride \'em. Go on. Go and be useful.' },
        ],
        options: [
          { text: 'Read the letter.', cond: { flag: 'finch_spared' }, effects: [{ lore: 'doc_finchLetter' }], next: 'end' },
          bye('Yes, Uncle.'),
        ],
      },
      {
        id: 'after',
        lines: [{ text: ['There you are. Horses need riding, fences need mending, and I need my pipe, which Minerva says I can\'t have. Go on.', 'Partner. Still sounds strange. Good strange.', 'If you\'re going to town, bring liniment. For the horse.'] }],
        options: [bye()],
      },
      { id: 'after_bribe', lines: [{ text: ['Morning.', 'Horses are fed.'] }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_dutch_coyle',
    npc: 'dutch_coyle',
    entry: [
      { cond: { flag: 'ending_law' }, node: 'law' },
      { cond: { flag: 'ending_press' }, node: 'press' },
      { node: 'bribe' },
    ],
    nodes: [
      {
        id: 'law',
        lines: [
          { cond: { flag: 'finch_messenger' }, text: 'The Finch boy delivered your message. Very polite of you. Then you went and got my paymaster arrested, which was less polite. Biscuit? No? Your foreman\'s cook makes them. Mateo. Sings, doesn\'t he.' },
          { text: 'Brannigan\'s kin. Sit, sit. Biscuit? Your stable boy makes them. Vance is in Kincaid\'s jail and his lawyers have already decided I don\'t exist. That leaves me unemployed, unpaid, and in your yard.' },
        ],
        options: [{ text: 'You could ride away, Dutch.', tone: 'kind', next: 'ride' }, { text: 'Get off my uncle\'s porch.', tone: 'firm', next: 'duel' }],
      },
      {
        id: 'press',
        lines: [
          { cond: { flag: 'finch_messenger' }, text: 'Your message got to me. So did the newspaper. Newspaper was louder. Biscuit?' },
          { text: 'I read about myself in the Clarion this morning. "A hired outlaw of no particular distinction." No particular distinction! I\'ve robbed the United States mails. Vance is on a train east with two valises and the company\'s pretending it\'s never heard of either of us.' },
        ],
        options: [{ text: 'You could ride away, Dutch.', tone: 'kind', next: 'ride' }, { text: 'Get off my uncle\'s porch.', tone: 'firm', next: 'duel' }],
      },
      {
        id: 'bribe',
        lines: [{ text: 'No hard feelings. Vance sent me a telegram this morning — four words. Your name and "loose end, tidy". He paid you, so he knows you\'ll stay quiet, so he knows nobody misses you. I admire the man\'s economy. I\'d like you to know I find this distasteful. I\'d also like you to know I\'m very good at it.' }],
        options: [
          { text: 'He\'ll do the same to you, Dutch.', next: 'bribe2' },
          { text: 'Then let\'s not keep him waiting.', tone: 'firm', next: 'duel' },
        ],
      },
      { id: 'bribe2', lines: [{ text: 'Oh, certainly. Next spring, probably. But that\'s next spring, and this is a nice afternoon.' }], options: [{ text: 'All right.', next: 'duel' }] },
      {
        id: 'ride',
        lines: [{ text: 'Ride where? I\'m forty-four. Every sheriff from here to the Pacific knows my tooth. Vance was going to make me respectable — a horse contract with the Army, a ranch of my own. One of these, in fact. I\'d have liked this porch. ...No. I came to settle it. Step down into the yard, and let\'s be civilised.' }],
        options: [{ text: 'The yard, then.', next: 'duel' }],
      },
      {
        id: 'duel',
        lines: [{ text: 'Twenty paces. When the windmill turns to face us. I\'ll not draw early; I\'d like it known I never did. After you.' }],
        options: [{ text: 'Step into the yard.', effects: [{ setFlag: 'duel_pending', value: 'dutch_coyle' }], next: 'end' }],
      },
    ],
  },

  // ===========================================================================
  // SULFUR FLATS
  // ===========================================================================
  {
    id: 'dlg_vogel',
    npc: 'vogel',
    entry: [{ cond: at('treasure_ketterman', 'vogel'), node: 'found' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Assay office. Bring me rock, I tell you what it is. Usually it is rock.', 'Guten Tag. Ore? Nuggets? Or a question? The questions I do free.'] }],
        options: [
          shop('assay_sulfur', 'I have ore to sell.'),
          { text: 'Ever weigh anything that mattered?', cond: fresh('treasure_ketterman'), next: 'ketterman' },
          bye(),
        ],
      },
      {
        id: 'ketterman',
        lines: [{ text: 'Once. 1884. A widow, Hester Ketterman, out at the far edge of the Drylands. Sixty-one ounces to the ton. She danced, here, in this office. A month later outlaws took everything. She wrote things down — she always wrote things down. When she left, the daybook did not leave with her. Perhaps it is still at the claim.' }],
        options: [
          { text: 'I\'ll go and look.', effects: [{ startQuest: 'treasure_ketterman' }], next: 'end' },
          bye('Sad story.'),
        ],
      },
      {
        id: 'found',
        lines: [{ text: 'You found it. Under a rock near the Roost, ja? Black silver, four years old. ...Hester is alive. Port Ashby, with her sister. She takes in mending. Nobody would know if you kept it. I would know. But I am nobody.' }],
        options: [
          { text: 'Send her the coin. ($120)', tone: 'kind', cond: { money: 120 }, lockedHint: 'You need $120.', effects: [{ pay: 120 }, { setFlag: 'ketterman_decided', value: true }, { setFlag: 'ketterman_returned', value: true }, { rep: 'honor', amount: 15 }], next: 'sent' },
          { text: 'Send her half. ($60)', cond: { money: 60 }, lockedHint: 'You need $60.', effects: [{ pay: 60 }, { setFlag: 'ketterman_decided', value: true }, { rep: 'honor', amount: 5 }], next: 'half' },
          { text: 'Finders keepers.', effects: [{ setFlag: 'ketterman_decided', value: true }, { rep: 'honor', amount: -5 }], next: 'kept' },
        ],
      },
      { id: 'sent', lines: [{ text: 'I will write the draft myself, and a letter. I will tell her someone drank one to Fritz. ...You did? Good. Then it is true.' }], options: [bye()] },
      { id: 'half', lines: [{ text: 'Half is more than the outlaws left her. I will send it with a letter.' }], options: [bye()] },
      { id: 'kept', lines: [{ text: 'Ja. Well. Most would. Good day.' }], effects: [{ opinion: -15 }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_mulroney',
    npc: 'mulroney',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { time: 'night' }, text: 'Shift\'s off, so the place is full of men who want to forget the shift. Get in line.' },
          { text: ['The Dry Well. Whiskey\'s watered, beer\'s warm, and the chairs are borrowed. Don\'t ask from where.', 'Drink or don\'t, but stop standing in the door; you\'re letting the dust in.'] },
        ],
        options: [
          shop('saloon_sulfur', 'Pour me one.'),
          { text: 'Any cards in this place?', effects: [{ startActivity: 'poker' }], next: 'end' },
          { text: 'How are things in the Flats?', next: 'flats' },
          bye(),
        ],
      },
      {
        id: 'flats',
        lines: [
          { cond: done('bounty_pike'), text: 'Payroll\'s coming in coin again now Pike\'s gone. Company still pays in scrip half the time, but now it\'s out of meanness rather than robbery. Progress.' },
          { text: 'Company pays in scrip since Pike took the payroll. Scrip\'s only good at the Company Store. Company Store\'s prices are only good for the Company. You see how that goes round.' },
        ],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_briggs',
    npc: 'briggs',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Company Store. Coin or scrip. Coin is preferred. Scrip is accepted. Scrip is accepted at a slight discount. I don\'t set the discount.', 'Good day. Please don\'t look at me like that. Everyone looks at me like that.'] }],
        options: [shop('store_sulfur', 'Let\'s see the shelves.'), { text: 'Why are your prices double Larkspur\'s?', tone: 'firm', next: 'prices' }, bye()],
      },
      { id: 'prices', lines: [{ text: 'Freight. And — policy. Company policy. I send the money to Port Ashby and they send me a letter saying I didn\'t send enough. I don\'t even like canned peaches.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_ortega',
    npc: 'ortega',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Buenas. The mules are mine; the horses are for sale. Mostly.', 'Your horse is thirsty. They are always thirsty out here. So am I.'] }],
        options: [shop('stable_sulfur', 'Let me see the horses.'), { text: 'Where can I find water in the Drylands?', next: 'water' }, bye()],
      },
      {
        id: 'water',
        lines: [{ text: 'The Rio Seco is a liar; it shows you a riverbed with no river. Dig at the bends in the shade — sometimes a little. Hackberry Spring in the south is honest all year. Bring double what you think. Then a little more for the horse. He sweats more than you, and complains less.' }],
        options: [bye('Gracias.')],
      },
    ],
  },
  {
    id: 'dlg_liwen',
    npc: 'liwen',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: done('bounty_pike'), text: 'You\'re the one who stopped Pike. The crews know. Coin again on Friday. Thank you.' },
          { text: ['Li Wen. Contract miner. If you are from the Company, I am resting. If you are not, I am also resting.', 'Watch the tailings, they shift.'] },
        ],
        options: [
          { text: 'You\'re organising the crews.', next: 'crews' },
          bye(),
        ],
      },
      {
        id: 'crews',
        lines: [{ text: 'I am talking to men about arithmetic. A dollar in scrip buys seventy cents in the Company Store. Thirty cents a dollar, two hundred men, every week. Arithmetic is not organising. It is only true. ...If the Company asks, I talked about the weather.' }],
        options: [{ text: 'The weather\'s terrible.', tone: 'joke', next: 'end', effects: [{ opinion: 10 }] }, bye()],
      },
    ],
  },

  // ===========================================================================
  // CEDAR NOTCH
  // ===========================================================================
  {
    id: 'dlg_marta',
    npc: 'marta',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'finch_spared' }, text: 'You! The Finch boy talks of you all day. Sit, eat. You brought a spoon? No? Ach. Here.' },
          { text: ['Cookhouse. Sit. Eat. Don\'t complain, I am bigger than you.', 'You are thin. Everyone who comes up the hill is thin. I fix this.'] },
        ],
        options: [
          shop('store_cedar', 'What are you selling?'),
          { text: 'What\'s the camp cutting?', next: 'ties' },
          bye(),
        ],
      },
      {
        id: 'ties',
        lines: [{ text: 'Railroad ties. Ten thousand on contract for the Meridian & Western. Good money. Mr. Tull worries about the money. I worry about the men. Somebody has to. Rolf Haugen worries about nothing, which is why his leg is broken.' }],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_rolf',
    npc: 'rolf',
    entry: [
      { cond: at('delivery_cedar_medicine', 'advise'), node: 'advice' },
      { cond: at('delivery_cedar_medicine', 'deliver'), node: 'deliver' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'deliver',
        lines: [
          { cond: { all: [{ item: 'tonicHealth' }, { item: 'bandage', qty: 2 }] }, text: 'Medicine? From the doctor? I am fine. ...Ja, all right, give it here. It hurts like the devil.' },
          { text: 'You are from the doctor? You have nothing in your hands. Did you drink it on the way?' },
        ],
        options: [{ text: 'There\'s a letter too.', next: 'advice' }, bye('I\'ll be back.')],
      },
      {
        id: 'advice',
        lines: [{ text: 'A letter. Three weeks? No. Tull says the tie contract is due by June. A man who does not cut does not eat. My brother in Bergen needs the money I send. Three weeks is impossible.' }],
        options: [
          { text: 'Three weeks off, or a lifetime on one leg. The doctor\'s not joking.', tone: 'kind', effects: [{ setFlag: 'rolf_advised', value: true }, { rep: 'honor', amount: 5 }], next: 'agree' },
          { text: 'Marta will feed you for free. I\'ll make sure Tull keeps your place.', tone: 'firm', effects: [{ setFlag: 'rolf_advised', value: true }, { opinion: 10 }], next: 'agree' },
          { text: 'Your leg, your choice.', effects: [{ setFlag: 'rolf_advised', value: true }, { setFlag: 'rolf_works', value: true }, { rep: 'honor', amount: -3 }], next: 'works' },
        ],
      },
      { id: 'agree', lines: [{ text: '...Ja. All right. I stay off it. If I lose my job I come and live in your barn.' }], options: [bye('Deal.')] },
      { id: 'works', lines: [{ text: 'Good. You understand. A man works. ...Ow.' }], options: [bye()] },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'rolf_works' }, text: 'Leg is fine. Is fine. Don\'t look at it.' },
          { text: ['Rolf Haugen. Faller. Mostly I fall trees. Lately I fall myself.', 'Leg is mending. Marta says thank you. Marta does not say thank you, so it is important.'] },
        ],
        options: [bye()],
      },
    ],
  },

  // ===========================================================================
  // WHITEPEAK
  // ===========================================================================
  {
    id: 'dlg_musgrave',
    npc: 'musgrave',
    entry: [
      { cond: at('main_highcountry', 'whitepeak'), node: 'silas' },
      { cond: at('hunt_whitepeak_wolves', 'report'), node: 'wolves_done' },
      { cond: active('hunt_whitepeak_wolves'), node: 'wolves_wait' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { weather: 'snow' }, text: 'Shut the door. Snow gets in. So do people.' },
          { text: ['Musgrave.', 'Trading post. Buy something or warm up. Both\'s better.'] },
        ],
        options: [
          shop('store_whitepeak', 'Show me the trade goods.'),
          { text: 'You look troubled.', cond: fresh('hunt_whitepeak_wolves'), next: 'wolves' },
          bye(),
        ],
      },
      {
        id: 'silas',
        lines: [{ text: 'Brannigan. You\'ve the look. ...Ten days back, a lame bay with a Rocking B came up the pass. Rider slumped over the horn. Didn\'t stop here. Went west, toward Hollow Crown. Minerva Lindqvist traps up there. Silas courted her in \'66. She said no. He\'s been riding up every winter since to hear her say it again.' }],
        options: [
          { text: 'Why didn\'t you go after him?', tone: 'firm', next: 'silas2' },
          { text: 'Thank you, Mr. Musgrave.', tone: 'kind', next: 'silas3' },
        ],
      },
      { id: 'silas2', lines: [{ text: 'Two men came up the next day asking the same as you. Didn\'t like their horses. Told \'em he went east. Seemed more useful.' }], options: [{ text: 'It was.', next: 'silas3' }] },
      { id: 'silas3', lines: [{ text: 'Hollow Crown\'s west and a bit north. Trail\'s bad. Get your horse a heavy blanket. I sell \'em. Not a sales pitch. Well. It is. But it\'s true.' }], options: [shop('store_whitepeak', 'Then I\'ll buy one.'), bye('I\'ll manage.')] },
      {
        id: 'wolves',
        lines: [{ text: 'Wolves. Pack in the timber above the house. Four calves this month. I don\'t hate a wolf. Can\'t afford one. Three gone\'d break the pack up. Thirty dollars and a blanket that\'s seen me through nine winters.' }],
        options: [{ text: 'I\'ll hunt them.', effects: [{ startQuest: 'hunt_whitepeak_wolves' }], next: 'end' }, bye('Not now.')],
      },
      { id: 'wolves_wait', lines: [{ text: 'Timber. Above the house. Mind your horse; they go for the legs.' }], options: [bye()] },
      { id: 'wolves_done', lines: [{ text: 'Three. Good. Rest\'ll move on. Here. Money. Blanket. Don\'t thank me, I\'ll have to say something back.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_ada',
    npc: 'ada',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: done('side_ashby_derby'), text: 'You won the Derby! I was third. On Boulder. Boulder\'s feet are like dinner plates. Next year.' },
          { text: ['Ada Musgrave. Pa sells things; I sell horses. Mine are better.', 'Mountain horses. Short, thick, sure-footed. Don\'t laugh at them. They\'ll outlast your fancy one in snow.'] },
        ],
        options: [shop('stable_whitepeak', 'Show me your horses.'), { text: 'Ever thought of leaving the mountain?', next: 'leave' }, bye()],
      },
      { id: 'leave', lines: [{ text: 'Every day. I want to race Boulder in the Ashby Derby and beat every Kentucky horse there. Then I\'ll come home. Somebody has to argue with Pa.' }], options: [bye()] },
    ],
  },

  // ===========================================================================
  // FORT ROURKE
  // ===========================================================================
  {
    id: 'dlg_abernathy',
    npc: 'abernathy',
    entry: [
      { cond: at('main_tracks', 'fort'), node: 'remounts' },
      { cond: { flag: 'finch_turned_in' }, node: 'finch' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'remounts',
        lines: [{ text: 'Lieutenant Abernathy, regimental quartermaster. You\'re — a civilian. With a scorched paper. What can I do for you?' }],
        options: [
          { text: 'I\'m looking for horses stolen from the Brannigan ranch.', tone: 'kind', next: 'remounts2' },
          { text: 'You bought stolen horses, Lieutenant.', tone: 'firm', effects: [{ opinion: -5 }], next: 'remounts2' },
          { text: 'I\'m with the Cattle Association, inspecting brands.', tone: 'lie', next: 'remounts_lie' },
        ],
      },
      { id: 'remounts_lie', lines: [{ text: 'The Association sends Mr. Pryor, who is sixty and has gout. You are neither. ...But you\'re right about the brands, aren\'t you. Sit down.' }], options: [{ text: 'Tell me.', next: 'remounts2' }] },
      {
        id: 'remounts2',
        lines: [{ text: '...Eleven head. February and March. From a "Hadley Remount Company" — a man called Hadley with a crooked smile and no papers. I needed horses; the order says find them. Three had a brand vented badly under the Diamond H. A rocking B, I think now. I signed. I\'ve not slept properly since.' }],
        effects: [{ give: 'remount_bill' }, { lore: 'doc_remountBill' }, { lore: 'doc_fortOrders' }],
        options: [
          { text: 'Where did Hadley\'s men come from?', next: 'roost' },
          { text: 'At least you\'re honest about it.', tone: 'kind', effects: [{ opinion: 10 }, { rep: 'army', amount: 5 }], next: 'roost' },
        ],
      },
      {
        id: 'roost',
        lines: [{ text: 'South-east, through the Redstone mesas. A box canyon the troopers call Coyle\'s Roost — one way in, rocks all round. The major won\'t send a patrol in under twelve men and he hasn\'t got twelve horses. Here — my copy of the bill. If it helps hang anyone, I\'ll testify. It\'ll end my career. It should.' }],
        options: [bye('Thank you, Lieutenant.')],
      },
      { id: 'finch', lines: [{ text: 'The Finch boy rode in under your name and told us everything, three times, in increasing detail. He\'s in the guardhouse, eating better than the troopers. The major\'s minded to let him enlist. I\'m minded to let the major.' }], options: [bye()] },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'ending_law' }, text: 'The Army returned every Brannigan horse with a letter of apology I wrote eleven times. I\'m to be a witness at Vance\'s trial. I\'m told it is not usual for a lieutenant to volunteer for his own embarrassment.' },
          { text: ['Lieutenant Abernathy. Can I help?', 'Mind the parade ground; the sergeant has it raked.'] },
        ],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_fry',
    npc: 'fry',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { rep: 'army', gte: 20 }, text: 'You. The remount wrangler. You did right by the lieutenant. He\'s green but he\'s honest. Takes years to grow the first out of a man; the second you can\'t teach.' },
          { text: ['First Sergeant Fry. State your business or get off my parade ground.', 'You walk like cavalry. Ninth? Tenth? Remounts? Huh. Remounts. Somebody has to.'] },
        ],
        options: [
          { text: 'How\'s the regiment for horses?', next: 'horses' },
          bye(),
        ],
      },
      { id: 'horses', lines: [{ text: 'Short. Forty-two short. Half of what we\'ve got are good, a quarter are fair, and a quarter came from the Hadley Remount Company and I wouldn\'t send a dead man to his funeral on \'em. The Sayen sell better horses than the government buys. Nobody asks my opinion. I give it anyway, quietly.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_voss',
    npc: 'voss',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Sutler\'s Store! Peaches, tobacco, liniment, cartridges, a fiddle string, very slightly used. Everything a soldier wants at prices a soldier hates.', 'Welcome, welcome. Cash, credit against pay, or barter. Barter I like best; I always win.'] }],
        options: [
          shop('store_fort', 'Show me what you\'ve got.'),
          { text: 'Who\'s J. Hadley?', cond: { any: [active('main_tracks'), done('main_tracks')] }, next: 'hadley' },
          bye(),
        ],
      },
      {
        id: 'hadley',
        lines: [{ text: 'Hadley! Hm. A name. So many names. Information is a commodity, friend, like peaches.' }],
        options: [
          { text: 'Here\'s ten dollars.', cond: { money: 10 }, lockedHint: 'Voss wants $10.', effects: [{ pay: 10 }], next: 'hadley_paid' },
          { text: 'Gatlin the smith says you sell Coyle\'s men caulked shoes.', tone: 'threat', next: 'hadley_paid' },
          bye('Forget it.'),
        ],
      },
      { id: 'hadley_paid', lines: [{ text: 'Ned Tarrant. Coyle\'s man. Red beard, buys Army-pattern shoes by the dozen, pays in railroad scrip, which I accept at a discount, as one does. I never asked why a horse thief had railroad scrip. It wasn\'t a question that sold peaches.' }], options: [bye()] },
    ],
  },

  // ===========================================================================
  // MERIDIAN JUNCTION
  // ===========================================================================
  {
    id: 'dlg_kessler',
    npc: 'kessler',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Meridian Junction! Tickets, freight, telegrams, and conversation, the last one free and in short supply. Walt Kessler. Sit. Please. Nobody sits.', 'Train\'s not due for two hours. Nothing\'s ever due for two hours. Tell me something interesting.'] }],
        options: [
          shop('station_meridian', 'What do you sell here?'),
          { text: 'Do you remember any telegrams signed "EV"?', cond: done('main_tracks'), next: 'telegram' },
          { text: 'Lonely out here?', tone: 'kind', next: 'lonely' },
          bye(),
        ],
      },
      {
        id: 'telegram',
        lines: [{ text: 'Company policy is that operators retain no copies. ...Company policy has never been out here at three in the morning with nothing to read. I keep the interesting ones. This one went to "Hadley, Tinaja crossing". There\'s no office at the Tinaja crossing. So who\'s collecting? Somebody riding in to Fort Rourke\'s line, I\'d bet.' }],
        effects: [{ lore: 'doc_vanceTelegram' }],
        options: [{ text: 'You could lose your job for this.', next: 'telegram2' }],
      },
      { id: 'telegram2', lines: [{ text: 'I could lose it for sneezing on the sounder. Take it. If anyone asks, I\'m a fool who can\'t keep his drawer shut. It\'s even true.' }], options: [bye('Thank you, Walt.')] },
      { id: 'lonely', lines: [{ text: 'Me? Ha. No. I have the wire. I know every birth, death and bank failure from here to Chicago before the newspapers do. I just don\'t have anybody to tell.' }], options: [bye()] },
    ],
  },

  // ===========================================================================
  // SAYEN VALLEY
  // ===========================================================================
  {
    id: 'dlg_tolani',
    npc: 'tolani',
    entry: [
      { cond: at('main_reckoning', 'press_sayen'), node: 'press' },
      { cond: at('horse_sayen_mares', 'return'), node: 'mares_home' },
      { cond: active('horse_sayen_mares'), node: 'mares_wait' },
      { cond: { rep: 'sayen', lte: -20 }, node: 'cold' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'sayen_shop_open' }, text: ['You\'re welcome at the Council House. What do you need?', 'Dusk is in foal. If it\'s a filly I\'m naming it after my brother\'s temper.'] },
          { cond: { metNpc: 'tolani' }, text: 'Brannigan\'s kin. Back again.' },
          { text: 'Tolani Ashe. I breed the spotted horses you\'ve been admiring since you rode in. Don\'t pretend you weren\'t. Everyone does.' },
        ],
        options: [
          { text: 'I\'d like to buy a horse.', cond: { flag: 'sayen_shop_open' }, lockedHint: 'Tolani doesn\'t sell to people she doesn\'t know yet.', effects: [{ openShop: 'stable_sayen' }], next: 'end' },
          { text: 'Your brother looks ready to shoot someone.', cond: fresh('horse_sayen_mares'), next: 'mares' },
          { text: 'What do you think of the railroad?', next: 'railroad' },
          { text: 'Tell me about the Sayen horses.', next: 'horses' },
          bye(),
        ],
      },
      {
        id: 'horses',
        lines: [{ text: 'We\'ve bred them in this valley for six generations. Spotted coats, striped hooves, sense enough not to die in a blizzard. The Army buys forty a year from us. They\'d buy a hundred if the Agency trader didn\'t take a cut of every sale for "handling". Handling is a word for putting your hand in.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'railroad',
        lines: [
          { cond: { flag: 'ending_press' }, text: 'It\'s coming up the north route now, along our boundary. We\'ll get our fee and our siding. My horses will be in Chicago in four days instead of four weeks. We will also get survey crews, timber men and whiskey sellers. Mareh says a neighbour you can sue is better than a stranger you can\'t. Ask me in ten years.' },
          { cond: { flag: 'ending_law' }, text: 'Frozen. Everything frozen while the lawyers resurvey. Our agreement may be honoured, or may be "revisited". Revisited. You know that word? It means somebody wants a second try.' },
          { text: 'I want a stock siding at the valley mouth so my horses reach buyers who pay properly. I want no railroad men north of the treaty stones. Those might be the same railroad and might not. In 1886 they signed for both. Then they built somewhere else and stopped answering letters.' },
        ],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'mares',
        lines: [{ text: 'He is. Kimbrough, the Agency trader, condemned two of my brood mares as "unfit" — Dusk and Quill, the best I have — and wrote them off as dead of colic. Corin saw them yesterday, alive and sound, in a pen east of Pine Creek. Kimbrough sells condemned stock in Port Ashby and keeps the difference.' }],
        options: [{ text: 'Why not go and take them back?', next: 'mares2' }],
      },
      {
        id: 'mares2',
        lines: [{ text: 'Because if a Sayen man shoots an Agency trader, the Army hears "uprising" and our council hears nothing for a year. Corin knows this. He doesn\'t care. If someone who isn\'t Sayen brings my mares home, it\'s a matter of stolen property. I hate that this is true. It is still true.' }],
        options: [
          { text: 'I\'ll bring them home.', tone: 'kind', effects: [{ startQuest: 'horse_sayen_mares' }, { opinion: 10 }], next: 'mares3' },
          { text: 'What\'s in it for me?', tone: 'firm', next: 'mares_pay' },
        ],
      },
      { id: 'mares_pay', lines: [{ text: 'Forty dollars. And I\'ll sell to you, which I don\'t to most. Is that enough, or do you need a speech as well?' }], options: [{ text: 'It\'s enough.', effects: [{ startQuest: 'horse_sayen_mares' }], next: 'mares3' }, bye('Not now.')] },
      { id: 'mares3', lines: [{ text: 'The pen\'s east of Pine Creek, past the old burn. Kimbrough keeps two hired men with shotguns. He himself is a coward, so that\'s something. Bring them back to the lodge. Gently. Quill hates being hurried.' }], options: [bye()] },
      { id: 'mares_wait', lines: [{ text: 'Pine Creek, the pen past the burn. Corin\'s pacing. Please hurry before he stops pacing.' }], options: [bye()] },
      {
        id: 'mares_home',
        lines: [{ text: 'Dusk. Quill. ...Look at them. Not a mark. Corin, stop crying, people are watching. — Thank you. Corin found Kimbrough\'s tally book in the saddlebag he left behind when he ran; Isaac is already writing to the Commissioner. You are welcome to buy from us. That isn\'t a small thing here.' }],
        options: [{ text: 'I\'m glad they\'re home.', tone: 'kind', next: 'end' }],
      },
      {
        id: 'press',
        lines: [{ text: 'Cordelia Fontaine sent you. For our statement. So that the newspaper can print that the railroad must build where it promised — along our boundary. You understand what you\'re asking. You\'re asking us to help bring the railroad to our door.' }],
        options: [
          { text: 'I\'m asking you to hold them to the agreement you signed.', tone: 'firm', next: 'press2' },
          { text: 'If you\'d rather it stayed buried, I\'ll tell her so.', tone: 'kind', next: 'press2' },
        ],
      },
      {
        id: 'press2',
        lines: [{ text: 'I know. I\'m not angry with you. I\'m angry that the only choice anyone offers us is which kind of trouble. My horses need that siding. My brother wants to burn the ties. Mareh says an agreement kept in ink is better than one broken in ink. Isaac wrote our statement in January and nobody printed it. Take it. Tell Fontaine to print it whole.' }],
        effects: [{ setFlag: 'press_sayen_statement', value: true }, { lore: 'doc_sayenStatement' }, { rep: 'sayen', amount: 10 }],
        options: [bye('Whole. I promise.')],
      },
      { id: 'cold', lines: [{ text: 'I have nothing to sell you and nothing to say. The door is there.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_mareh',
    npc: 'mareh',
    entry: [{ cond: { rep: 'sayen', gte: 20 }, node: 'warm' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['You\'re Silas Brannigan\'s relation. He sold us a stallion once that bit everyone on the council. We still use the bloodline. The biting too.', 'Sit. Not there; that\'s Isaac\'s chair, and he has opinions about it.'] }],
        options: [
          { text: 'Tell me about the treaty boundary.', next: 'treaty' },
          { text: 'What does the council want?', next: 'want' },
          bye(),
        ],
      },
      {
        id: 'treaty',
        lines: [{ text: 'In 1861 I was nineteen and sat behind my father while a colonel with a cold drew a line from Pine Creek to Eagle Rock. Stones every mile. My father said, "They will move it." The colonel said, "Never." We\'ve kept that line twenty-seven years. We\'ve had to re-set four of the stones ourselves.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'want',
        lines: [{ text: 'Water in the creek. Coin for our horses instead of Agency chits. A school where children learn English and arithmetic and are allowed to go home at night. And for people who sign things to remember what they signed. None of it is complicated. All of it is difficult.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'warm',
        lines: [
          { cond: { flag: 'ending_press' }, text: 'The railroad will come up our boundary now. Isaac thinks it\'s a victory. Corin thinks it\'s an invasion. Tolani thinks it\'s Tuesday and she has horses to sell. I think all three of them are right, and I\'m too old to choose. Sit with me a while.' },
          { text: 'Tolani says you brought her mares home. Sit. Have coffee. It\'s Agency coffee, so it\'s terrible, but it is hospitality.' },
        ],
        options: [
          { text: 'Tell me about the treaty boundary.', next: 'treaty' },
          bye('Another time.'),
        ],
      },
    ],
  },
  {
    id: 'dlg_isaac',
    npc: 'isaac',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['Isaac Redfern, council secretary. I write letters to people who don\'t answer them. It\'s steady work.', 'If you\'ve come about the Agency, form a queue. It\'s been a long one since 1871.'] }],
        options: [
          { text: 'Did you walk the 1885 survey with Thaddeus Pruitt?', cond: { any: [active('main_surveyor'), done('main_surveyor')] }, next: 'pruitt' },
          { text: 'May I read the council\'s statement on the boundary?', next: 'statement' },
          bye(),
        ],
      },
      {
        id: 'pruitt',
        lines: [{ text: 'Every mile of it. A fussy, decent man. He measured twice and apologised to the stones. We agreed the line would run two hundred feet south of the treaty boundary. I initialled the stakes beside him. Last summer I rode the line and the stakes were gone. Burned, by the look. Except at Eagle Rock.' }],
        options: [{ text: 'Something else.', next: 'hub' }, bye()],
      },
      {
        id: 'statement',
        lines: [{ text: 'Of course. Every newspaper in the Territory was sent a copy in January. Not one printed it. Perhaps they ran short of ink.' }],
        effects: [{ lore: 'doc_sayenStatement' }],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_corin',
    npc: 'corin',
    entry: [{ cond: done('horse_sayen_mares'), node: 'after' }, { node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [{ text: ['What. ...Sorry. What do you want?', 'If you\'re selling something, my sister buys. I just ride.'] }],
        options: [
          { text: 'You look like you want to hit somebody.', next: 'angry' },
          { text: 'They say you\'re the best rider in the valley.', tone: 'kind', next: 'ride' },
          bye(),
        ],
      },
      { id: 'angry', lines: [{ text: 'Not somebody. Kimbrough. My sister writes letters. Isaac writes letters. Mareh reads letters. The Agency puts them in a stove. One day somebody\'s going to answer with something other than paper, and I\'d rather it was me than someone stupider.' }], options: [bye()] },
      { id: 'ride', lines: [{ text: 'They\'re right. ...Race me sometime. I\'ll give you a head start. A small one.' }], options: [bye('I\'ll hold you to it.')] },
      {
        id: 'after',
        lines: [
          { cond: { flag: 'ending_press' }, text: 'The railroad\'s coming to our fence. My sister\'s happy. Mareh\'s thinking. I\'m going to watch every surveyor with a stake in his hand very, very closely.' },
          { text: 'You brought Quill home without a shot. I\'d have done it with ten. ...Yours was better. Don\'t tell Tolani I said that.' },
        ],
        options: [bye()],
      },
    ],
  },

  // ===========================================================================
  // HALVORSEN HOMESTEAD
  // ===========================================================================
  {
    id: 'dlg_ingrid',
    npc: 'ingrid',
    entry: [
      { cond: at('side_halvorsen', 'report'), node: 'report' },
      { cond: active('side_halvorsen'), node: 'wait' },
      { cond: fresh('side_halvorsen'), node: 'offer' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'offer',
        lines: [{ text: 'You are Brannigan\'s family? Good. Then you are on the right side. There is a man in my kitchen, Mr. Haskett, from the Townsite Company. He has eaten my bread and now he wants my farm for four dollars an acre. Four! I paid more for the plough.' }],
        options: [
          { text: 'I\'ll talk to him.', tone: 'kind', effects: [{ startQuest: 'side_halvorsen' }], next: 'offer2' },
          { text: 'That\'s your business, ma\'am.', next: 'end' },
        ],
      },
      { id: 'offer2', lines: [{ text: 'Talk. Good. Nils wants no shooting. I want no Haskett. Perhaps you can do both. I will be in the barn, being angry at the cow.' }], options: [bye()] },
      { id: 'wait', lines: [{ text: 'He is still in the kitchen. Eating. More bread.' }], options: [bye()] },
      {
        id: 'report',
        lines: [
          { cond: { flag: 'halvorsen_fight' }, text: 'Shooting, in my wheat. Nils is sick behind the barn. ...But they are gone. They will come back with more papers and fewer manners. Still. Thank you. Take bread. You will take bread.' },
          { cond: { flag: 'halvorsen_negotiated' }, text: 'He left! He put his hat on and left and did not even finish the bread. What did you say to him? No, don\'t tell me, Nils will want to say it too and he will say it wrong.' },
          { text: 'He has gone. Looking frightened. I have never seen a man run so fast with so much bread inside him. Take a loaf. Take two.' },
        ],
        options: [bye()],
      },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'halvorsen_credit' }, text: 'Pettibone says my account has an error in my favour. Pettibone has never made an error in anybody\'s favour in his life. I am suspicious. I am also grateful. Mostly suspicious.' },
          { text: ['Wheat is coming up thin. The river is low. But it is coming up.', 'Sit. Eat. Then go and do something useful.'] },
        ],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_nils',
    npc: 'nils',
    entry: [{ node: 'hub' }],
    nodes: [
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'halvorsen_fight' }, text: 'I keep seeing it. The men in the wheat. I know they\'d have burned us out. I know. I still keep seeing it.' },
          { text: ['Ingrid is the brave one. I do the sums. The sums are frightening this year.', 'If the river drops another foot, the wheat dies. If we sell, we don\'t die, we just leave. I don\'t know which is worse. Ingrid does.'] },
        ],
        options: [
          { text: 'Show me the sums.', next: 'sums' },
          bye(),
        ],
      },
      {
        id: 'sums',
        lines: [{ text: 'A dry year: forty bushels short. Seed loan at the bank: three hundred and eighty. Four dollars an acre: six hundred and forty. Six hundred and forty minus three-eighty is everything we have, minus everything we wanted. ...Ingrid says sums are not the whole truth. She is right. They are a loud part of it.' }],
        options: [bye()],
      },
    ],
  },
  {
    id: 'dlg_haskett',
    npc: 'haskett',
    entry: [{ node: 'confront' }],
    nodes: [
      {
        id: 'confront',
        lines: [{ text: 'Morton Haskett, Calder Valley Townsite & Water. You\'ll be the Brannigan relation. I\'ve heard. Let me be plain: the Company\'s offer is generous, the survey is clear, and my associates outside are very large. Mrs. Halvorsen would be wise to sign.' }],
        options: [
          {
            text: 'The survey\'s a forgery and the Marshal will know it by the end of the month. Want your name on that?',
            tone: 'firm',
            cond: { any: [done('main_surveyor'), { rep: 'honor', gte: 20 }] },
            lockedHint: 'You need proof — or a reputation for honesty — to make him believe it.',
            effects: [{ setFlag: 'halvorsen_negotiated', value: true }, { setFlag: 'halvorsen_choice', value: true }, { rep: 'ranchers', amount: 5 }, { npcLeave: 'haskett' }],
            next: 'backs_off',
          },
          {
            text: 'Leave now, or leave across your saddle.',
            tone: 'threat',
            cond: { rep: 'notoriety', gte: 25 },
            lockedHint: 'He doesn\'t know your name well enough to be afraid of it.',
            effects: [{ setFlag: 'halvorsen_threatened', value: true }, { setFlag: 'halvorsen_choice', value: true }, { rep: 'notoriety', amount: 5 }, { npcLeave: 'haskett' }],
            next: 'flees',
          },
          {
            text: 'I\'m a territorial inspector. Show me your filing.',
            tone: 'lie',
            next: 'lie_fail',
          },
          {
            text: 'Then call your large friends.',
            tone: 'threat',
            effects: [{ setFlag: 'halvorsen_fight', value: true }, { setFlag: 'halvorsen_choice', value: true }, { npcLeave: 'haskett' }],
            next: 'fight',
          },
        ],
      },
      { id: 'backs_off', lines: [{ text: '...The Company doesn\'t — that is to say, I am merely a field representative. I don\'t sign anything. I collect signatures. I find I have another appointment. Good day. Good day, Mrs. Halvorsen. The bread was excellent.' }], options: [bye()] },
      { id: 'flees', lines: [{ text: 'I — yes. Quite. I know who you are. That is — I\'ll be going. Boys! We\'re going!' }], options: [bye()] },
      { id: 'lie_fail', lines: [{ text: 'An inspector. In an Army coat and a horse-breaker\'s gloves. Do try harder. Now, about that signature —' }], options: [{ text: 'Then call your large friends.', tone: 'threat', effects: [{ setFlag: 'halvorsen_fight', value: true }, { setFlag: 'halvorsen_choice', value: true }, { npcLeave: 'haskett' }], next: 'fight' }, { text: 'Let me try again.', next: 'confront' }] },
      { id: 'fight', lines: [{ text: 'You\'ll regret that. Boys!' }], options: [bye('We\'ll see.')] },
    ],
  },

  // ===========================================================================
  // STORY LOCATIONS
  // ===========================================================================
  {
    id: 'dlg_rustler_finch',
    npc: 'rustler_finch',
    entry: [{ node: 'plead' }],
    nodes: [
      {
        id: 'plead',
        lines: [{ text: 'Don\'t shoot! Don\'t — I ain\'t even loaded, look, look, I took \'em out. I\'m seventeen. I just hold horses. I hold \'em real good.' }],
        options: [
          { text: 'Then talk. A rancher followed you here. Silas Brannigan. Where is he?', tone: 'firm', next: 'info' },
          { text: 'Give me one reason not to.', tone: 'threat', effects: [{ rep: 'notoriety', amount: 3 }], next: 'info' },
          { text: 'Easy. Nobody\'s shooting you. Sit down and breathe.', tone: 'kind', effects: [{ opinion: 20 }], next: 'info' },
        ],
      },
      {
        id: 'info',
        lines: [{ text: 'The old man? He was up on the rim, the night the railroad man come. Ned Tarrant seen his hat and shot him. Got him in the shoulder, I think, \'cause he near fell, but he got on his horse and went north. Not home — north, up toward the mountains. Ned said he\'d die in the snow. Dutch said "make sure." Nobody made sure. It was cold.' }],
        options: [{ text: 'What railroad man?', next: 'info2' }],
      },
      {
        id: 'info2',
        lines: [{ text: 'Dunno his name. Grey coat. Talks nice. Dutch calls him "the railroad man" and does what he says, which Dutch don\'t do for nobody. He brings money in a pocketbook. Dutch ain\'t here — he rode to the Tinaja crossing to collect. What — what are you gonna do with me?' }],
        options: [
          { text: 'Go. North, away from Coyle. Find honest work and keep finding it.', tone: 'kind', effects: [{ setFlag: 'finch_spared', value: true }, { setFlag: 'finch_decided', value: true }, { rep: 'honor', amount: 10 }, { rep: 'coyle', amount: -5 }], next: 'spared' },
          { text: 'You\'re riding to Fort Rourke and telling the lieutenant everything.', tone: 'firm', effects: [{ setFlag: 'finch_turned_in', value: true }, { setFlag: 'finch_decided', value: true }, { rep: 'army', amount: 10 }, { rep: 'honor', amount: 3 }, { rep: 'coyle', amount: -10 }], next: 'turned' },
          { text: 'Run back to Coyle. Tell him Brannigan\'s kin is coming for him.', tone: 'threat', effects: [{ setFlag: 'finch_messenger', value: true }, { setFlag: 'finch_decided', value: true }, { rep: 'notoriety', amount: 10 }, { rep: 'coyle', amount: -5 }], next: 'messenger' },
        ],
      },
      { id: 'spared', lines: [{ text: 'I — yes. North. Honest work. I can split wood. I\'m bad at it but I can do it. I won\'t forget this. I mean it. I won\'t.' }], options: [bye('See that you don\'t.')] },
      { id: 'turned', lines: [{ text: 'The Army? They\'ll hang me! ...No? You\'ll — you\'ll write them a note? Saying I came in on my own? ...All right. All right. It\'s better than Ned.' }], options: [bye('Go.')] },
      { id: 'messenger', lines: [{ text: 'Tell — tell Dutch? He\'ll — okay. Okay. I\'ll tell him. Lord.' }], options: [bye('Run.')] },
    ],
  },
  {
    id: 'dlg_silas',
    npc: 'silas',
    entry: [
      { cond: at('main_highcountry', 'reunion'), node: 'reunion' },
      { cond: at('main_highcountry', 'affidavit'), node: 'affidavit' },
      { cond: active('main_reckoning'), node: 'waiting' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'reunion',
        lines: [{ text: '...Well. Look at you. Minerva, put the rifle down, it\'s family. It\'s my — come here. No, not the left side, they put a hole in the left side. ...You came. I told Hollis you would. He owes me a dollar.' }],
        options: [
          { text: 'You look terrible, Uncle.', tone: 'joke', next: 'reunion2' },
          { text: 'I thought you were dead.', tone: 'kind', next: 'reunion2' },
          { text: 'You could have sent word.', tone: 'firm', next: 'reunion2' },
        ],
      },
      {
        id: 'reunion2',
        lines: [{ text: 'I thought so too, on the second night. Lay in the snow thinking about every horse I ever sold too cheap. Long list. Then Minerva\'s dog found me, and Minerva found the dog, and she dug a bullet out of me with a skinning knife while telling me I was a fool. Best two days of conversation I\'ve had in twenty years. How\'s the ranch? Tell me straight.' }],
        options: [
          { text: 'I got some horses back from the Roost. Hollis is holding the place.', next: 'saw' },
          { text: 'Mostly empty. But I found Pruitt and his notebook.', next: 'saw' },
        ],
      },
      {
        id: 'saw',
        lines: [{ text: 'Good. Good. Then listen, because I\'ve been rehearsing this to the ceiling. I followed our horses to the Roost. Up on the rim I saw a lantern, and Dutch Coyle, and a man in a grey coat handing him a pocketbook. Ellery Vance. Four times that man sat on my porch drinking my coffee. "Nine ranches, Dutch. Not eight. I need the whole valley by June." Then somebody saw my hat.' }],
        options: [
          { text: 'Will you swear to that, in writing?', next: 'swear' },
          { text: 'Why didn\'t you go to the sheriff?', next: 'sheriff' },
        ],
      },
      {
        id: 'sheriff',
        lines: [{ text: 'Amos Whitlock is a decent man with a mortgage held by Vance\'s friends. I\'d not put him between his conscience and his house. And I wasn\'t riding to Larkspur with three of Coyle\'s men behind me to lead them to my own door.' }],
        options: [{ text: 'Will you swear to it, in writing?', next: 'swear' }],
      },
      {
        id: 'swear',
        lines: [{ text: 'Already done it. Minerva made me, three days ago, in case I died out of stubbornness. She witnessed it. Said I was too stubborn to lie because lying takes imagination. Here. Take it. And — thank you. I\'m not good at that. Write it down somewhere; you won\'t hear it often.' }],
        effects: [{ give: 'silas_affidavit' }],
        options: [
          { text: 'Come home with me.', tone: 'kind', next: 'stay' },
          { text: 'I\'ll take it to Port Ashby.', next: 'stay' },
        ],
      },
      {
        id: 'stay',
        lines: [{ text: 'Not yet. Can\'t sit a horse past a walk, and Coyle\'s men are watching the passes. Minerva says two more weeks or she\'ll shoot me herself. Go. What you do with that paper is yours to decide. You carried it. I\'ll argue with you after. Talk to Minerva before you go; she\'s got opinions about your horse.' }],
        options: [bye('I\'ll be back for you.')],
      },
      { id: 'affidavit', lines: [{ text: 'You\'ve got it. Go on. Port Ashby. And mind the snow on the pass — rest the horse at Whitepeak.' }], options: [bye()] },
      { id: 'waiting', lines: [{ text: ['Still here. Still annoying Minerva. Go and finish it.', 'Whatever you choose, choose it like you mean it. Half a choice is worse than a wrong one.'] }], options: [bye()] },
      { id: 'hub', lines: [{ text: 'Hollow Crown. Not much of a crown. Not much hollow. Minerva named it when she was in a mood.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_minerva',
    npc: 'minerva',
    entry: [{ cond: { not: { metNpc: 'minerva' } }, node: 'meet' }, { node: 'hub' }],
    nodes: [
      {
        id: 'meet',
        lines: [{ text: 'So you\'re the one. He talks about you. Not to you, of course; he\'s a Brannigan. Minerva Lindqvist. I dug a .44 out of your uncle with a skinning knife and a bottle of aquavit, and he complained about the aquavit.' }],
        options: [
          { text: 'Thank you for saving him.', tone: 'kind', effects: [{ opinion: 15 }], next: 'meet2' },
          { text: 'He said you turned him down in \'66.', tone: 'joke', next: 'proposal' },
        ],
      },
      { id: 'proposal', lines: [{ text: 'And \'67, \'71, and twice in \'80. He proposes like other men check the weather. I\'d say yes if I thought he\'d stop asking. Then what would we talk about?' }], options: [{ text: 'Thank you for saving him.', tone: 'kind', next: 'meet2' }] },
      {
        id: 'meet2',
        lines: [{ text: 'Don\'t thank me. My dog found him. I just didn\'t let him die, which was more effort than it sounds. Now: your horse is standing in snow with a summer blanket, and I\'d like that fixed before you ride down the pass.' }],
        options: [
          { text: 'Can you spare a heavy blanket? ($8)', cond: { money: 8 }, lockedHint: 'You need $8.', effects: [{ pay: 8 }, { give: 'blanketHeavy' }], next: 'blanket' },
          { text: 'I\'ll get one at Whitepeak.', next: 'end' },
        ],
      },
      { id: 'blanket', lines: [{ text: 'Wool and canvas. My second-best. Your horse is worth my second-best. You\'re still being considered.' }], options: [bye()] },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'silas_home' }, text: 'He went home. The cabin\'s very quiet. I\'d forgotten how much I like quiet. ...I\'ll give it a week.' },
          { cond: { weather: 'snow' }, text: 'Come in out of that, you\'ll freeze your ears. Horse in the lean-to. There\'s coffee.' },
          { text: ['Coffee\'s on the stove. Don\'t touch the traps.', 'Silas is asleep. Don\'t wake him, he\'s nicer unconscious.'] },
        ],
        options: [
          { text: 'Any advice for the high country?', next: 'advice' },
          bye(),
        ],
      },
      { id: 'advice', lines: [{ text: 'Cold kills horses before men, because men complain sooner. Blanket. Feed more than you think. Keep the canteen inside your coat or you\'ll be drinking ice. And don\'t make camp in a draw — cold air runs downhill like water.' }], options: [bye()] },
    ],
  },
  {
    id: 'dlg_pruitt',
    npc: 'pruitt',
    entry: [
      { cond: at('main_surveyor', 'supplies'), node: 'need' },
      { cond: at('main_surveyor', 'notebook'), node: 'trust' },
      { node: 'hub' },
    ],
    nodes: [
      {
        id: 'need',
        lines: [
          { cond: { all: [{ item: 'canteenWater' }, { item: 'beans', qty: 2 }] }, text: 'Stay there! I\'m — I\'m armed. Is that — is that water? And — beans. Oh, Lord. Oh, put the pistol away, I don\'t know how it works anyway. Give them here.' },
          { text: 'Stay back! I am armed and — and highly trained. ...Unless you have water. Do you have water? I\'ve been drinking what drips off the chapel roof, and it hasn\'t rained since Candlemas.' },
        ],
        options: [
          { text: 'Eat first. Then we talk.', cond: { all: [{ item: 'canteenWater' }, { item: 'beans', qty: 2 }] }, tone: 'kind', next: 'trust' },
          { text: 'I\'ll bring water and food.', next: 'end' },
        ],
      },
      {
        id: 'trust',
        lines: [{ text: 'Mmf. Excuse me. Three months. Lizard, mostly. ...You found my note. "Gone to the saints." I thought it was clever. Somebody else found it first and wrote "nothing" on it, which is hurtful. You want the book. Everybody wants the book. Why should I give it to you?' }],
        options: [
          { text: 'Silas Brannigan is my uncle. Coyle\'s men shot him. Your book can stop them.', tone: 'kind', next: 'give' },
          { text: 'Because you\'re starving in a ruin and the next people who find you won\'t bring beans.', tone: 'firm', next: 'give' },
          { text: 'The Surveyor General sent me.', tone: 'lie', next: 'lie' },
        ],
      },
      { id: 'lie', lines: [{ text: 'The Surveyor General filed a forgery under my name and gave me "leave." If he sent you, I\'m hiding in the wrong ruin. Try again, and do try to be honest; I can tell a bad bearing from a hundred yards.' }], options: [{ text: 'All right. Silas Brannigan is my uncle.', next: 'give' }] },
      {
        id: 'give',
        lines: [{ text: 'Brannigan. The man with the river. He told me the Calder dropped to a trickle in \'71 and he and his neighbours shared it by the bucket. That\'s what Vance wants: the buckets. ...Here. Field book. Every station, every bearing, signed and dated. Isaac Redfern of the Sayen council initialled the stakes with me; he can swear to it. Don\'t get it wet. Don\'t get yourself killed. In that order, professionally speaking.' }],
        effects: [{ give: 'pruitt_notebook' }],
        options: [
          { text: 'Come with me. You\'ll be safer in town.', tone: 'kind', next: 'stay' },
          { text: 'Thank you, Mr. Pruitt.', next: 'stay' },
        ],
      },
      { id: 'stay', lines: [{ text: 'Safer? In a town with Vance\'s clerks in it? No. I\'ll stay with the lizards until somebody wins. If it\'s you, send a buggy. If it isn\'t, send nothing; I\'ll understand.' }], options: [bye()] },
      {
        id: 'hub',
        lines: [
          { cond: { flag: 'ending_law' }, text: 'The Marshal sent a buggy! An actual buggy! I\'m to testify. I\'ve been practising in front of the chapel wall. The wall is very persuaded.' },
          { cond: { flag: 'ending_press' }, text: 'I\'ve read the Clarion nine times. They spelled "chainage" wrong. I don\'t care. I don\'t care! I\'m going home.' },
          { cond: { flag: 'ending_bribe' }, text: 'Someone came in the night and took my bedroll and left a train ticket east. One way. ...I suppose I know what that means.' },
          { text: 'Still here. Still lizards. Did you know they taste better roasted? No. Neither did I, until February.' },
        ],
        options: [bye()],
      },
    ],
  },
];

// =============================================================================
// AMBIENT BARKS
// =============================================================================
export const BARKS: Bark[] = [
  // --- Weather -----------------------------------------------------------------
  { cond: { weather: 'rain' }, lines: ['Rain! Lord, smell that. Don\'t let it stop.', 'Wheat\'ll be glad of this. So will I.', 'Hope it\'s raining in the Sierra too. River needs it worse than we do.', 'First rain in six weeks and I left my hat at home.'] },
  { cond: { weather: 'snow' }, lines: ['Cold enough to freeze the whistle off a train.', 'Keep that horse moving or it\'ll stiffen.', 'Snow in April. The mountain\'s got a sense of humour.'] },
  { cond: { weather: 'clear' }, region: 'drylands', lines: ['Hot enough to fry a lizard on a rock. Lizard knows it, too.', 'Drink before you\'re thirsty. Out here thirsty is too late.', 'Sun\'s got no manners in the Drylands.'] },
  { cond: { weather: 'clear' }, region: 'dustfall', lines: ['Another dry day. River\'s down a hand since Sunday.', 'Not a cloud. Not one. Cattle are standing in the river like it owes them money.', 'Dust in my coffee, dust in my bed, dust in my prayers.'] },

  // --- Time of day ---------------------------------------------------------------
  { cond: { time: 'morning' }, lines: ['Morning.', 'Coffee first. Talk later.', 'Up with the roosters. The roosters were unhappy about it.', 'Early bird gets the worm. Late bird gets breakfast at the hotel.'] },
  { cond: { time: 'night' }, lines: ['Bit late to be wandering about, isn\'t it?', 'Evening. Mind the dark — the boardwalk\'s got holes.', 'Can\'t sleep either? Coyotes. Or conscience.', 'Lamp oil\'s gone up again. Everything\'s gone up again.'] },
  { cond: { time: 'evening' }, lines: ['Evening, friend.', 'Sun\'s going down red. Dry tomorrow.', 'Supper time. Smell that? That\'s not mine. Wish it was.'] },

  // --- Reputation / law -----------------------------------------------------------
  { cond: { wanted: true }, lines: ['That\'s — that\'s the one on the poster!', 'Somebody fetch the law.', 'Don\'t look at them. Just keep walking.', 'I ain\'t seen nothing, and I\'ll keep not seeing it.'] },
  { cond: { rep: 'honor', gte: 50 }, lines: ['That\'s Brannigan\'s kin. Good people.', 'Heard what you did. Thank you, friend.', 'Hat off to you. Well — tip of it, anyway.', 'Folks say you\'re straight as a fence line. Rare, these days.'] },
  { cond: { rep: 'honor', lte: -30 }, lines: ['Keep walking.', 'Mother always said watch out for the smiling ones. You don\'t even smile.', 'Lock the door, Martha.', 'I\'ve heard about you, and none of it was kind.'] },
  { cond: { rep: 'notoriety', gte: 50 }, lines: ['That\'s the one who\'s been shooting up the Territory.', 'Give \'em room. Lots of room.', 'Don\'t you start anything in here.'] },
  { cond: { rep: 'ranchers', gte: 30 }, lines: ['You\'re the one got the Brannigan horses back. Buy you a drink sometime.', 'Calder Association owes you, partner.'] },
  { cond: { rep: 'railroad', lte: -30 }, occupation: 'railroad', lines: ['You\'ve cost the Company a great deal of money. I hope you know that.', 'Move along. Company property.', 'The board in Chicago has heard your name. That isn\'t a compliment.'] },

  // --- Horse bond ---------------------------------------------------------------------
  { cond: { horseBond: 4 }, lines: ['Fine horse. You can see it trusts you.', 'Look at that — follows you like a pup.', 'Now that\'s a partnership. Wish my wife looked at me like that horse looks at you.'] },
  { cond: { horseBond: 5 }, occupation: 'horsetrader', lines: ['I\'d give you two hundred for that horse and you\'d laugh at me, wouldn\'t you.', 'Five years in this trade I haven\'t seen a horse that bonded. Good work.'] },
  { cond: { hasHorse: false }, lines: ['Walking? Out here? Bless you.', 'Lose your horse, friend? Livery\'s down the street.'] },

  // --- Occupations -------------------------------------------------------------------
  { occupation: 'cowhand', lines: ['Lost two more head Tuesday. Wolves, boss says. Wolves with saddles.', 'Spring drive\'s coming and half the outfit\'s sold up.', 'Calves are thin. River\'s thin. Pay\'s thin.', 'Nothing like a good horse under you and a bad song in your head.'] },
  { occupation: 'rancher', lines: ['Townsite man came by again. Told him where to put his offer.', 'Thirty years on this land and a man in a derby tells me I don\'t own it.', 'If the river don\'t rise, nothing else will either.', 'Rain\'d be a fine thing. A water master\'d be finer.'] },
  { occupation: 'miner', lines: ['Paid in scrip again. Can\'t buy a whiskey in Larkspur with scrip.', 'Silver\'s running thinner in the north drift.', 'Down there, you can\'t tell day from night. Up here, I can\'t tell why I bother.', 'Watch the shaft heads. Cover\'s rotten on half of them.'] },
  { occupation: 'logger', lines: ['Ten thousand ties by June. My arms are already sorry.', 'TIMBER! ...No, just practising.', 'Marta\'s making pancakes. Don\'t tell the others.', 'Railroad\'s eating the forest one tie at a time.'] },
  { occupation: 'soldier', lines: ['Forty-two horses short and the major wants a patrol to the Tinaja. On what, mules?', 'Sergeant\'s got eyes in the back of his head. Seen \'em.', 'Pay\'s late. Peaches are dear. Life\'s grand.', 'Stand clear of the parade ground, civilian.'] },
  { occupation: 'railroad', lines: ['The Meridian & Western is the future of this Territory, friend.', 'Track gang\'s been laying a mile a day. Crooked, but a mile.', 'Company says the valley route is cheaper. Company would know.', 'Tickets at the depot. Don\'t ride the freight cars, they check.'] },
  { occupation: 'farmer', lines: ['Wheat\'s coming up sparse. Got to pray and haul water both.', 'Townsite Company offered four dollars an acre. I laughed. Then I did the sums. Then I stopped laughing.', 'Hens are laying, at least. Somebody\'s optimistic.'] },
  { occupation: 'merchant', lines: ['Fine goods, fair prices! Well — goods, anyway.', 'Cash is king. Credit is a cousin I don\'t trust.', 'Freight from Port Ashby\'s gone up again. Railroad sets the rates.'] },
  { occupation: 'bartender', lines: ['Bar\'s open. Wits optional.', 'You break it, you bought it. You break me, you bought trouble.', 'Heard a thing or two. Costs a drink to hear it again.'] },
  { occupation: 'saloongirl', lines: ['Evening, cowboy. Buy a girl a sarsaparilla?', 'House rules: be polite, tip the piano player.', 'You look like you\'ve ridden a long way. Sit, rest your feet.'] },
  { occupation: 'pianist', lines: ['Requests are a nickel. Requests for "Oh! Susanna" are a dollar.', 'This piano was tuned in 1881. By a mule.'] },
  { occupation: 'gambler', lines: ['Care for a friendly game? I\'m very friendly.', 'Luck\'s a lady. I\'m a gentleman. We get along.', 'Never draw to an inside straight. Never draw on a man holding one, either.'] },
  { occupation: 'preacher', lines: ['Sunday service at ten. Short sermon. I promise.', 'Peace be with you, friend. And with your horse.', 'Water\'s low, tempers are high. Pray for both to even out.'] },
  { occupation: 'doctor', lines: ['Boil the water. Boil everything. Boil the whiskey if you must.', 'Clean hands save more men than bullets kill.'] },
  { occupation: 'sheriff', lines: ['Keep your iron holstered in town.', 'Quiet day. Let\'s keep it that way.', 'If you see a red-bearded fella with Army shoes on his horse, come tell me.'] },
  { occupation: 'deputy', lines: ['Sheriff\'s busy. I can help. Probably.', 'No riding on the boardwalk!', 'Saw a rattler under the jail porch. Third one this week.'] },
  { occupation: 'telegrapher', lines: ['Wire\'s been humming all morning. Prices in Chicago.', 'Dot-dot-dash. That\'s "rain in Kansas". Lucky Kansas.'] },
  { occupation: 'stablehand', lines: ['Mind the grey, he kicks.', 'Hay\'s up a nickel. Drought.', 'Brush \'em every day and they\'ll carry you through anything.'] },
  { occupation: 'horsetrader', lines: ['Sound wind, clean legs, sweet temper. That\'s every horse I\'ve ever sold, to hear me tell it.', 'Look at the eye, not the coat. Coat\'s for dances.', 'Sayen-bred horses fetch a fortune back East. Worth every dollar.'] },
  { occupation: 'hunter', lines: ['Deer are moving down to the river. Dry up top.', 'Wolf sign on the ridge. Big one.', 'Shoot clean, skin careful, waste nothing.'] },
  { occupation: 'trapper', lines: ['Beaver\'s near gone. Marten\'s still good, up high.', 'Snow tells you everything if you read it.'] },
  { occupation: 'traveler', lines: ['Which way to Port Ashby?', 'Been riding since Tuesday. Or Monday. Days go soft out here.', 'Heard there\'s work at Cedar Notch. Heard there\'s silver at the Flats. Heard a lot of things.'] },
  { occupation: 'drifter', lines: ['Spare a dime? A nickel? A kind word? I take all denominations.', 'Used to have a horse. Used to have a lot of things.'] },
  { occupation: 'child', lines: ['Is that your horse? Can I pet it? Does it bite? Can I pet it anyway?', 'I\'m going to be a cowboy. Or a doctor. Or a horse.', 'Mama says don\'t talk to strangers. Are you a stranger?'] },
  { occupation: 'outlaw', lines: ['You lost, friend?', 'Keep riding.', 'Nice horse. Be a shame if it wandered off.'] },
  { occupation: 'bountyhunter', lines: ['Paper on a fella named Pike. Two hundred. If you see him, he\'s mine.', 'Dead or alive. Dead\'s lighter.'] },
  { occupation: 'breeder', lines: ['Look at the hooves. Striped. Hard as flint.', 'Good blood shows in the second generation.'] },
  { occupation: 'elder', lines: ['Patience. Everything is slower than you want and faster than you\'re ready for.', 'I remember when this was all one valley, before the maps.'] },
  { occupation: 'surveyor', lines: ['Bearing north fifty-two west. Always north fifty-two west.'] },
  { occupation: 'cook', lines: ['Eat. You\'re thin.', 'Beans again. Don\'t complain, it\'s character-building.'] },
  { occupation: 'hotelier', lines: ['Rooms by the night or the week. Bath extra. Hot bath, very extra.'] },
  { occupation: 'editor', lines: ['Everyone has a story. Most of them are dull. Bring me the other kind.'] },

  // --- Personalities ---------------------------------------------------------------------
  { personality: 'gruff', lines: ['What.', 'Hmph.', 'Busy.'] },
  { personality: 'cheerful', lines: ['Lovely day, isn\'t it? Even if it isn\'t!', 'Howdy, howdy!'] },
  { personality: 'nervous', lines: ['Oh! You startled me.', 'Is — is something wrong?'] },
  { personality: 'wry', lines: ['Another fine day in paradise. Paradise needs rain.', 'If you find the end of the drought, let me know. I\'ve a bet on.'] },
  { personality: 'pious', lines: ['Bless you, friend.', 'Grace before meat, friend. Even jerky.'] },
  { personality: 'shrewd', lines: ['Everything\'s for sale. Including advice.', 'Prices are what they are. I just tell you them.'] },

  // --- Regions -----------------------------------------------------------------------------
  { region: 'blackwater', lines: ['Port Ashby\'s growing faster than a weed in a wet year.', 'Lake\'s down two feet. The hotels say it\'s "picturesque".', 'Electric bells at the Lakeshore. What next — electric horses?'] },
  { region: 'pinehollow', lines: ['Quiet up here. Just the saws and the jays.', 'Mind the treaty stones. Sayen land north of them, and they mean it.', 'Pine Creek\'s cold enough to stop your heart. Good trout, though.'] },
  { region: 'sierra', lines: ['Thin air up here. Thin everything.', 'Pass is still snowed in past Hollow Crown.', 'Saw a cougar track this morning. Big as my hand.'] },
  { region: 'redstone', lines: ['Coyle\'s country. Ride careful.', 'Red rock, red dust, red sky. I\'m going to start seeing red.', 'Fort patrols don\'t go south of the Tinaja without six men. Neither should you.'] },
  { region: 'drylands', lines: ['Rio Seco\'s a liar. Don\'t trust any riverbed you can walk in.', 'Company owns the ground, the water, the store and the men. Not the sky. Yet.'] },
  { region: 'dustfall', lines: ['Cattle country, and cattle are thirsty.', 'Brannigan horses used to run all along this flat. Not this spring.'] },

  // --- Story-conditioned -----------------------------------------------------------------------
  { cond: { flag: 'vance_arrested' }, lines: ['Did you hear? Marshal took the railroad\'s land man right off the depot platform!', 'Vance in jail. Never thought I\'d see the day.', 'Maybe I won\'t sell after all.'] },
  { cond: { flag: 'ending_press' }, lines: ['Read the Clarion? Railroad\'s stolen river! Says so right there.', 'Line\'s going north now, they say. Along the Sayen boundary.', 'Three printings! Cordelia Fontaine\'s going to need a bigger press.'] },
  { cond: { flag: 'ending_bribe' }, lines: ['Another ranch sold this week. Fair price, they said.', 'Townsite Company\'s buying again. Funny how quiet it all went.'] },
  { cond: { all: [{ flag: 'silas_home' }, { not: { flag: 'ending_bribe' } }] }, region: 'dustfall', lines: ['Silas Brannigan\'s back on his porch, shouting at horses. All\'s right with the world.', 'Rocking B\'s got horses in the corral again. About time.'] },
  { cond: { quest: 'main_tracks', state: 'active' }, region: 'dustfall', lines: ['Hear the Brannigan foreman got shot? Rustlers, bold as you like.', 'Silas Brannigan\'s gone missing. Mean old cuss. Hope he\'s all right.'] },
];
