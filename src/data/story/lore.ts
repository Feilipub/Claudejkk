/**
 * Lore documents. Unlocked by discovering points of interest, by dialogue
 * effects ({ lore: id }) and by quest stages. Never dumped in bulk.
 */
import type { LoreDoc } from '../schema.ts';

export const LORE: LoreDoc[] = [
  // --- Point-of-interest documents ---------------------------------------
  {
    id: 'doc_wagonManifest',
    title: 'Scorched Requisition',
    kind: 'ledger',
    text:
      'MERIDIAN & WESTERN RAILROAD CO. — Construction Dept., Calder Extension\n' +
      'REQUISITION No. 0417   Date: Feb 2_, 1888 (corner burned)\n\n' +
      'Deliver to: Bearer, at the Tinaja crossing.\n' +
      'For: REMOUNT STOCK — feed, halters, 3 doz. lead ropes, 1 running iron (straight bar), 2 sacks oats.\n' +
      'Charge to: Right-of-Way Acct. (Special)\n\n' +
      'Authorized: E.V.\n\n' +
      'In pencil, along the margin: "Rocking B burns easy into a Diamond H. Tell D. not the paints, they\'re known."',
  },
  {
    id: 'doc_cliffHouses',
    title: 'Notes on the Old Cliff Houses',
    kind: 'journal',
    text:
      'From the field diary of Capt. Lowell Ambry, 4th Cavalry, Fort Rourke, October 1871.\n\n' +
      'Rode out with two Sayen guides — Joseph Tiyo and a quiet young man who would not give his name to the ledger, and I do not blame him. Forty rooms at least, stacked in the overhang like swallows\' nests. Corn cobs no longer than my thumb. Potsherds painted black on white.\n\n' +
      'Joseph tells me his grandmother\'s people found these rooms empty when they came up the Tinaja, and that the Sayen leave them alone for the same reason a Christian leaves a churchyard alone — because somebody\'s dead are here, and that is enough. He asked me plainly whether I meant to dig. I said the Army had no such orders. He said orders were not what he had asked about.\n\n' +
      'I have taken nothing but this sketch.',
  },
  {
    id: 'doc_ketterman',
    title: 'Hester Ketterman\'s Daybook',
    kind: 'journal',
    text:
      'May 9, 1884. Assay came back 61 ounces to the ton. Fritz would have danced. I did, a little, by myself, which nobody needs to know.\n\n' +
      'June 2. Three riders at the spring. Paid for water in coin, which nobody does. One with a crooked front tooth called the other "Dutch".\n\n' +
      'June 11. They came back. Took every bar in the strongbox and both mules and left me the dog, which was decent of them, I suppose. The crooked-tooth one laughed that it would "sleep fine under the chimney till the Roost needs it." I have heard men brag before. I wrote it down anyway.\n\n' +
      'June 30. Sheriff in Larkspur says without a name he can\'t do a thing. I gave him a name. He says Dutch is a common name. It is not that common.\n\n' +
      'August. I am going to my sister in Port Ashby. If anybody finds this: east of the box canyon in Redstone there is a rock that leans like a stovepipe. If my silver is there, take it, and drink one to Fritz.',
  },
  {
    id: 'doc_pruittNote',
    title: 'Note Pinned Inside a Survey Tent',
    kind: 'note',
    text:
      'If C. comes looking — I have not been robbed, I have been persuaded. They burned the stakes and they took the copy plats. They did not find the book.\n\n' +
      'Gone to the saints. Bring water. Beans if you love me.\n\n' +
      '— T.P.\n\n' +
      '(Below, in a different hand, a boot print and the word "nothing".)',
  },
  {
    id: 'doc_hangingTree',
    title: 'Board Nailed to the Hanging Oak',
    kind: 'plaque',
    text:
      'HERE ON SEPT. 14, 1876, A COMMITTEE OF CITIZENS HANGED\n' +
      'ESTEBAN ARRIAGA and CORNELIUS DUFF\n' +
      'FOR THE THEFT OF NINE HORSES.\n\n' +
      'THE HORSES WERE FOUND IN DECEMBER\n' +
      'IN A WASH TEN MILES SOUTH, WHERE THE STORM HAD DRIVEN THEM.\n\n' +
      'PUT UP BY THEIR FRIENDS. LEAVE IT WHERE IT IS.',
  },
  {
    id: 'doc_derailment',
    title: 'Inspector\'s Report: Mile 112',
    kind: 'ledger',
    text:
      'TERRITORIAL RAILROAD COMMISSION — Report of Inspection, Calder Extension, Mile 112. Feb. 21, 1888.\n\n' +
      'Locomotive No. 9 and four ore cars left the rails on the curve west of the Rio Seco trestle. Fireman Owen Lacey killed. Engineer injured.\n\n' +
      'Company statement attributes the accident to "malicious obstruction, likely by Indians of the Sayen reserve." I find no evidence of obstruction. I find ties of green cottonwood, spikes driven short, and a grade laid on unsettled fill at a pace I would call reckless. The Sayen reserve is sixty miles from this curve.\n\n' +
      'Recommendation: the Extension should not be accepted for the land grant until relaid. I expect this report to be unpopular.\n\n' +
      '— A. M. Haldane, Inspector',
  },
  {
    id: 'doc_cholera',
    title: 'Gallow\'s Hope Burial Register',
    kind: 'ledger',
    text:
      'Kept by Rev. Wm. Coates, July–August 1879.\n\n' +
      'July 19 — Mary Ellen Tufts, 6 yrs. July 20 — Jonas Tufts. July 20 — "the Swedish drover", name unknown. July 22 — Abigail & Ruth Pardee, sisters. ...\n\n' +
      '(Forty-one names in all, the hand growing smaller.)\n\n' +
      'Aug. 9 — Dr. Pell has determined the town well is fouled from the livery. Too late to matter. The stage company is moving the road south of the river. Those of us left are going with it.\n\n' +
      'Aug. 11 — I am leaving this book in the chapel. Whoever finds it, these were people.',
  },
  {
    id: 'doc_hermit',
    title: 'A Chainman\'s Confession',
    kind: 'journal',
    text:
      'I carried the chain for Mr. Pruitt in \'85. Good man, terrible coffee. We ran the line north of the river along the treaty stones — the Sayen council had their own man walk it with us so nobody could say after that it crossed where it shouldn\'t. Every hundred feet a stake. I drove most of them.\n\n' +
      'Last summer a fellow in a grey coat paid me and two others ten dollars apiece to ride that line and pull the stakes and burn them. Said they were "superseded". I took the money. I knew what I was doing. I am writing it down because somebody ought to and I am not brave enough to say it in Port Ashby.\n\n' +
      'If anybody asks, the stake at Eagle Rock is still there. I couldn\'t make myself pull that one. It had his initials on it.',
  },

  // --- Main story documents ------------------------------------------------
  {
    id: 'doc_silasLetter',
    title: 'Letter from Uncle Silas',
    kind: 'letter',
    text:
      'Brannigan Horse Ranch, near Larkspur, Calder Territory. March 10th, 1888.\n\n' +
      'I know the Army has its claim on you and I know you swore you were done with other men\'s horses. These are mine, so it is different.\n\n' +
      'Spring drive is on us and I am short. Short of hands, short of stock and, if I am honest, short of patience. We have lost thirty-one head since Christmas. Hollis says wolves. Wolves do not take halters.\n\n' +
      'There is also a land man from the railroad who keeps coming by with an offer and a smile I would not trust to hold a gate. And a surveyor fellow stopped here last fall asking what I knew about the river in dry years, which nobody has asked me in thirty years of living on it.\n\n' +
      'Come if you can. Josiah Oakes at the Larkspur livery will see you mounted. Bring your own saddle if it is any good. Mine are worse.\n\n' +
      'Your uncle, S. Brannigan\n\n' +
      'P.S. Your aunt\'s old room is aired. I aired it myself, so lower your expectations.',
  },
  {
    id: 'doc_remountBill',
    title: 'Bill of Sale — Hadley Remount Co.',
    kind: 'ledger',
    text:
      'Received of the Quartermaster, Fort Rourke, the sum of $1,045.00 in full for ELEVEN (11) HEAD of saddle horses, sound, broke to ride, warranted free of claim.\n\n' +
      'Brands: Diamond H (8), various (3).\n\n' +
      'For the Hadley Remount Co., J. Hadley, agent.\n\n' +
      'Lt. Abernathy\'s note, pinned to the copy: "Three of the \'various\' show a Rocking B under the Diamond H, badly vented. Hadley had no papers for them. I signed anyway because the regiment needed horses and I am a fool. M.A."',
  },
  {
    id: 'doc_pruittNotebook',
    title: 'Pruitt\'s Field Notebook (Calder Extension, 1885)',
    kind: 'journal',
    text:
      'Station 0+00 at Meridian Junction switch. Line bears N 52° W along the benchland, keeping above the floodplain.\n\n' +
      'Sta. 312+00: Treaty stone No. 4. Mr. Isaac Redfern, for the Sayen council, confirms the stone. Line keeps 200 ft south of the treaty boundary as agreed.\n\n' +
      'Sta. 590+40: Eagle Rock. Stake initialled. Grade easy.\n\n' +
      'Sta. 905+00: Gallow\'s Hope. Old well — DO NOT USE for water station. Recommend new well upslope.\n\n' +
      'Summary for the Surveyor General: The northern route is 4.1 miles longer than a line down the Calder valley, but crosses no patented ranch land, takes no river frontage, and honours the 1861 boundary agreement the company signed with the Sayen in 1886. The valley route would require condemnation of nine ranches and the Calder riparian rights below Larkspur. I do not recommend it.\n\n' +
      '— T. Pruitt, Deputy Surveyor. Each page signed and dated in ink.',
  },
  {
    id: 'doc_affidavit',
    title: 'Affidavit of Silas Brannigan',
    kind: 'letter',
    text:
      'I, Silas Brannigan, rancher, of the Calder valley, being of sound mind if not sound shoulder, do swear:\n\n' +
      'That on the night of March 30th, 1888, I followed the trail of my stolen horses to the box canyon known as Coyle\'s Roost in Redstone.\n\n' +
      'That from the rocks above I saw Ellery Vance, land agent of the Meridian & Western, whom I know by sight from four visits to my own porch, hand a pocketbook to the outlaw Dutch Coyle by lantern light.\n\n' +
      'That I heard Vance say, "Nine ranches, Dutch. Not eight. I need the whole valley by June."\n\n' +
      'That I was then seen and shot, and that I did not stay to argue.\n\n' +
      'Signed, S. Brannigan.\n' +
      'Witnessed: Minerva Lindqvist, Hollow Crown, April 1888. ("He is telling the truth. He is too stubborn to lie, it takes imagination.")',
  },

  // --- Newspapers -----------------------------------------------------------
  {
    id: 'doc_clarionDrought',
    title: 'The Ashby Clarion — "Calder Running Low"',
    kind: 'newspaper',
    text:
      'THE ASHBY CLARION. Port Ashby, March 28, 1888. Price five cents.\n\n' +
      'CALDER RUNNING LOW — CATTLEMEN UNEASY.\n\n' +
      'The snowpack on the High Sierra is the thinnest in eleven years, and the Calder at Larkspur ford can be crossed by a man in carpet slippers. The Calder Cattle Association met Tuesday and passed a resolution calling for a territorial water master. The Calder Valley Townsite & Water Company, a new concern whose officers could not be reached at their listed address, has filed claims on four river sections below Larkspur.\n\n' +
      'Also this week: The Lakeshore Hotel installs electric bells. A Sulfur Flats mule bites a Company clerk; mule acquitted.',
  },
  {
    id: 'doc_clarionMissing',
    title: 'The Ashby Clarion — "Where is Mr. Pruitt?"',
    kind: 'newspaper',
    text:
      'THE ASHBY CLARION. Feb. 14, 1888.\n\n' +
      'WHERE IS MR. PRUITT?\n\n' +
      'Thaddeus Pruitt, Deputy Surveyor, who ran the original line for the Calder Extension in 1885, has not been seen since a fire at his winter camp in the Tinaja country. The Surveyor General\'s office describes him as "on leave". His landlady describes him as owing two weeks\' rent and leaving his good boots, "which he would not do."\n\n' +
      'This newspaper asks a simple question: why does the survey filed last summer bear Mr. Pruitt\'s name but not his route? Readers with information may call at the Clarion office, Water Street. — C.F.',
  },
  {
    id: 'doc_clarionExpose',
    title: 'The Ashby Clarion — Special Edition',
    kind: 'newspaper',
    text:
      'THE ASHBY CLARION — SPECIAL EDITION. April 1888.\n\n' +
      'THE RAILROAD\'S STOLEN RIVER.\n' +
      'Forged Survey, Hired Rustlers, and the Land Agent Who Bought Both.\n\n' +
      'This newspaper has seen the original field book of Deputy Surveyor Pruitt, the sworn statement of rancher Silas Brannigan, and the company\'s own requisitions for "remount stock". Taken together they describe a scheme by which Ellery Vance, land agent of the Meridian & Western, moved the Calder Extension onto ranch land and river frontage owned, through straw men, by himself.\n\n' +
      'The Sayen Council, through Mr. Isaac Redfern, states: "We signed a fair agreement in 1886 and kept it. We would like to know why the other party did not. We would also like it understood that a railroad on our boundary is not a gift. It is a neighbour, and we will judge it as one."\n\n' +
      'Shares of the Meridian & Western fell nine points in Chicago on the news.',
  },
  {
    id: 'doc_clarionArrest',
    title: 'The Ashby Clarion — "Land Agent Arrested"',
    kind: 'newspaper',
    text:
      'THE ASHBY CLARION. April 1888.\n\n' +
      'LAND AGENT ARRESTED AT DEPOT.\n\n' +
      'Territorial Marshal Ruth Kincaid yesterday arrested Ellery Vance of the Meridian & Western on charges of forgery, fraud and receiving stolen stock. Company counsel, arriving on the noon train, described Mr. Vance as "a former employee acting wholly on his own account", a phrase he was evidently pleased with, since he used it four times.\n\n' +
      'The Territorial Commission has postponed acceptance of the Calder Extension pending a new survey. Ranchers in the valley may keep their land while the lawyers keep their fees. This newspaper would have liked to print the evidence. The Marshal says it will be printed in court. We will hold her to it.',
  },

  // --- Posters ----------------------------------------------------------------
  {
    id: 'doc_wantedPike',
    title: 'Wanted: Jubal Pike',
    kind: 'poster',
    text:
      'WANTED\n\nJUBAL "RATTLER" PIKE\n\nFOR THE MURDER OF STAGE DRIVER AMOS HUNNICUTT AND THE ROBBERY OF THE SULFUR FLATS PAYROLL.\n\nGREY HAIR WORN LONG. GOATEE. CARRIES A DOUBLE-ACTION AND A RATTLESNAKE BAND ON HIS HAT, WHICH HE WILL TELL YOU HE KILLED WITH HIS TEETH. HE DID NOT.\n\n$200 REWARD\n\nApply to Sheriff A. Whitlock, Larkspur.',
  },
  {
    id: 'doc_wantedCoyle',
    title: 'Wanted: Dutch Coyle',
    kind: 'poster',
    text:
      'WANTED BY THE TERRITORY\n\nDUTCH COYLE\n(Real name believed to be Dietrich Kohl)\n\nHORSE THEFT — CATTLE THEFT — ROBBERY OF THE U.S. MAILS\n\nWell spoken. Crooked front tooth. Known to frequent the Redstone country and to pay his bar bills, which makes him hard to find in a saloon.\n\n$350 REWARD\n\nTerritorial Marshal\'s Office, Port Ashby.',
  },
  {
    id: 'doc_cupPoster',
    title: 'The Larkspur Cup',
    kind: 'poster',
    text:
      'THE LARKSPUR CUP!\nTwenty-Third Annual Running\n\nA Mile and a Quarter, Open Ground, Any Horse Not Lame\nEntry $5 at the Livery — Purse $50 and a Silk Rosette\n\nNO SPURRING ANOTHER MAN\'S HORSE. NO CROSSING THE CHURCH LAWN. NO WAGERING ON THE CHURCH LAWN EITHER.\n\nJ. Oakes, Steward',
  },

  // --- Letters, ledgers, statements ---------------------------------------
  {
    id: 'doc_sayenStatement',
    title: 'Statement of the Sayen Council on the Boundary',
    kind: 'letter',
    text:
      'To the Governor of Calder Territory, the Commissioner of Indian Affairs, and the Meridian & Western Railroad Company. Sayen Valley, January 9, 1888.\n\n' +
      'The boundary set by the Treaty of Pine Creek (1861) runs from the mouth of Pine Creek west along the treaty stones to Eagle Rock. In 1886 this Council granted the company a right of way two hundred feet south of that line, in exchange for an annual fee, a stock siding at the valley mouth for our horses, and a promise that the company\'s men would not cut timber north of the stones.\n\n' +
      'The company has paid nothing. The siding does not exist. The line has been built elsewhere, and we read in the Port Ashby paper that our agreement was "superseded by a revised survey." We were not asked to revise anything.\n\n' +
      'We do not ask for the railroad. We ask that agreements signed in ink be kept in ink.\n\n' +
      'For the Council: Mareh Tiyo, Speaker. Isaac Redfern, Secretary.',
  },
  {
    id: 'doc_fortOrders',
    title: 'Fort Rourke — General Orders No. 6',
    kind: 'note',
    text:
      'HEADQUARTERS, FORT ROURKE, C.T. March 1, 1888.\n\n' +
      '1. The regiment is short forty-two serviceable mounts. The Quartermaster is authorized to purchase remounts locally at not more than $95 per head.\n' +
      '2. All purchased stock to be inspected for brands and bills of sale. (This means actually looking. — Maj. Corliss)\n' +
      '3. Troopers will not race government horses against civilians at the Larkspur Cup, however much money is involved, Pvt. Kearney.\n' +
      '4. Patrols south of the Tinaja will travel in strength of no fewer than six.',
  },
  {
    id: 'doc_pettiboneLedger',
    title: 'Pettibone Mercantile — Accounts Owing',
    kind: 'ledger',
    text:
      'ACCOUNTS OWING, as of April 1, 1888.\n\n' +
      'S. Brannigan — $41.20 (oats, wire, 1 bottle liniment "for the horse", 2 bottles whiskey "also for the horse")\n' +
      'Halvorsen — $18.75. Paid in eggs, part. Eggs are not currency, Ingrid.\n' +
      'Sheriff Whitlock — $9.10\n' +
      'Rev. Shaw — $0.00. Man pays in advance. Unnerving.\n' +
      'Calder Valley Townsite & Water Co. — Paid in full, cash, $212.00 for survey stakes, lamp oil and 1 gross matches. Who needs a gross of matches?',
  },
  {
    id: 'doc_waterPetition',
    title: 'Petition of the Calder Cattle Association',
    kind: 'letter',
    text:
      'To the Territorial Legislature:\n\n' +
      'We, the undersigned ranchers of the Calder valley, have watered stock on this river since before there was a Territory to petition. In a dry year there is enough water for all of us if no one man takes it. We ask for a water master and a fair division by priority of use.\n\n' +
      'We further protest the filing of river claims by the Calder Valley Townsite & Water Company, which owns no cattle, grows no crops, and as far as we can tell consists of a brass plate on a door in Port Ashby.\n\n' +
      'Signed: S. Brannigan, A. Musgrave, H. Tolliver (for S.B.), N. Halvorsen, and twenty-two others. (Seven names have been struck through since. Beside four of them, in pencil: "sold".)',
  },
  {
    id: 'doc_halvorsenOffer',
    title: 'Letter to Mr. N. Halvorsen',
    kind: 'letter',
    text:
      'Calder Valley Townsite & Water Co., Port Ashby. March 20, 1888.\n\n' +
      'Dear Mr. Halvorsen,\n\n' +
      'We are pleased to renew our offer of $4.00 per acre for your quarter section. We remind you that, under the revised territorial survey, your preemption claim may conflict with the railroad grant, in which case you may receive nothing at all.\n\n' +
      'Our Mr. Haskett will call on Thursday for your answer. We trust it will be a sensible one.\n\n' +
      'Yours faithfully, for the Company — (signature illegible, initials E.V.)',
  },
  {
    id: 'doc_traderLedger',
    title: 'Kimbrough\'s Tally Book',
    kind: 'ledger',
    text:
      'Reported to Agency (Condemned, unfit) — 6 head.\n' +
      'Actually sold, Port Ashby Exchange — 6 head @ $140. Appaloosa mares, sound.\n' +
      'Difference — $840, less $40 to the inspector, less a bottle for the Agency clerk.\n\n' +
      'Hold the two spotted mares at the Pine Creek pen until the Ashby buyer comes. Ashe woman asking questions. Tell her they died of colic. Tell her it was sad.',
  },
  {
    id: 'doc_vanceTelegram',
    title: 'Telegram Copy, Meridian Junction',
    kind: 'telegram',
    text:
      'WESTERN UNION — MERIDIAN JCT — COPY RETAINED BY OPERATOR\n\n' +
      'TO HADLEY TINAJA CROSSING\n' +
      'NINE NOT EIGHT STOP BRANNIGAN FIRST STOP NO MORE PAINTS THEY ARE KNOWN STOP FUNDS AS BEFORE STOP\n' +
      'EV\n\n' +
      '(Pencilled by the operator: "Tinaja crossing has no telegraph office. Who is collecting this?")',
  },
  {
    id: 'doc_okaforLetter',
    title: 'Dr. Okafor\'s Instructions for Cedar Notch',
    kind: 'letter',
    text:
      'Mr. Haugen,\n\n' +
      'You will take the tonic morning and evening. You will change the dressing daily with clean hands — clean meaning washed, not wiped on your trousers. You will not walk on the leg for three weeks.\n\n' +
      'If Mr. Tull tells you that you are needed at the saw, you may tell him that I trained in Edinburgh, that I have taken off more legs than he has sawn logs, and that I would prefer not to add yours to the count.\n\n' +
      '— S. Okafor, M.D., Larkspur',
  },
  {
    id: 'doc_finchLetter',
    title: 'A Letter Care of the Brannigan Ranch',
    kind: 'letter',
    text:
      'To Brannigan\'s kin, wherever this finds you,\n\n' +
      'I am at the Cedar Notch camp splitting shakes for a dollar a day. My hands look like a ham somebody dropped. I sleep fine. I didn\'t used to.\n\n' +
      'I wanted to say you could of shot me and you didn\'t, and I have thought about that more than I thought about anything in my life, which is not a long life but still.\n\n' +
      'Tobias Finch\n\nP.S. The cook here is a Norwegian called Marta and she says to tell you she will feed you if you come by, but you have to bring your own spoon.',
  },
];
