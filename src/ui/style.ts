/** Western design system for the DOM interface. */

/**
 * Tiny pixel-art icons (original drawings), painted as SVG rects from character
 * maps so they stay crisp at any zoom and need no image files. Each map row is
 * one pixel row; '.' is transparent, every other character is a palette key.
 */
function pixIcon(rows: string[], pal: Record<string, string>): string {
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]!];
      if (col) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${col}'/>`;
    }
  });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${rows.length}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const K = '#1c120b';
const ICON = {
  heart: pixIcon(['.KK...KK.', 'KRRK.KRRK', 'KRWRRRRRK', 'KRRRRRRRK', '.KRRRRDK.', '..KRRDK..', '...KDK...', '....K....'],
    { K, R: '#d2412c', W: '#ffc2a8', D: '#8e2318' }),
  bolt: pixIcon(['...KKKK', '..KYYK.', '.KYWK..', 'KYYYKKK', 'KKKYYYK', '..KYYK.', '.KYYK..', '.KYK...', '.KK....'],
    { K, Y: '#f0c94c', W: '#fff2b8' }),
  bread: pixIcon(['..KKKKK..', '.KBWBBWK.', 'KBWBBWBBK', 'KBBBBBBBK', 'KCCCCCCCK', '.KKKKKKK.'],
    { K, B: '#d9a25a', W: '#f6dca0', C: '#9a5f2a' }),
  shoe: pixIcon(['..KKKKK..', '.KSSWSSK.', 'KSSKKKSSK', 'KSK...KSK', 'KHK...KHK', 'KSK...KSK', 'KHK...KHK', 'KSSK.KSSK', 'KKK...KKK'],
    { K, S: '#e0b860', W: '#fff0b0', H: '#6a4a20' }),
  whistle: pixIcon(['..........W.', '........W...', 'KKKKKKK...W.', 'KMWWWMMK....', 'KMMMMMMMKKKK', 'KMMKKMMMMMMK', 'KMKAAKMMKKKK', 'KMKAAKMK....', '.KMKKMK.....', '..KKKK......'],
    { K, M: '#c9a24c', W: '#fff0b8', A: '#5a3a1a' }),
  gun: pixIcon(['KKKKKKKKKK.....', 'KMWWWWWWMMKKK..', 'KKKKKKKMMMMMMK.', '.......KCCCMMMK', '.......KKKKMMMK', '........KK.KGGK', '.........K.KGGK', '..........KGGGK', '..........KKKK.'],
    { K, M: '#b8b4aa', W: '#efece4', C: '#7c786e', G: '#8a5a32' }),
  jump: pixIcon(['.....K.....', '....KWK....', '...KWWWK...', '..KWWWWWK..', '.KKKWWWKKK.', '...KWWWK...', '...KWWWK...', '...KKKKK...', '...........', 'KKKKKKKKKKK'],
    { K, W: '#f0e2c4' }),
  boot: pixIcon(['..KKKKK....', '..KBBBK....', '..KBWBK....', '..KBBBK....', '..KBBBK....', '..KBBBBK...', '.KBBBBBBKK.', 'KYKBBBBBBBK', 'YKBBBBBBBBK', '.KKKKKKKKKK'],
    { K, B: '#a5683a', W: '#d8a06a', Y: '#f0c94c' }),
  // Mount: a horse's head in profile, ears up, a pale blaze down the face.
  horse: pixIcon(['...KK.K......', '...KBKBK.....', '..KBBBBBK....', '.KMBBKBBBK...', '.KMBBBBWBBK..', 'KMMBBBBBWBBK.', 'KMMBBBKKBWBBK', 'KMMBBK..KBBDK', 'KMMBK....KKK.', 'KMMBK........', 'KMBBK........', 'KKKKK........'],
    { K, B: '#b06a30', W: '#f0dcb8', M: '#2e1c10', D: '#4a2a14' }),
  brake: pixIcon(['KK.....KK', '.KWK.KWK.', '..KWKWK..', '...KWK...', 'KK..K..KK', '.KWK.KWK.', '..KWKWK..', '...KWK...', '....K....'],
    { K, W: '#f0e2c4' }),
  sight: pixIcon(['....KKK....', '..KK.W.KK..', '.K...W...K.', '.K.......K.', 'KWW..R..WWK', '.K.......K.', '.K...W...K.', '..KK.W.KK..', '....KKK....'],
    { K: '#f0e2c4', W: '#f0e2c4', R: '#ffd0a0' }),
  map: pixIcon(['.KKKKKKKKK.', 'KPPPKPPPPK.', 'KPRPKPPGPPK', 'KPPRRPPGPPK', 'KPPPKRPPPPK', 'KPGPKPRRXPK', 'KPPPKPPPPPK', '.KKKKKKKKK.'],
    { K, P: '#e8d4a4', R: '#a83a28', G: '#6a8a3a', X: '#1c120b' }),
  bag: pixIcon(['...KKKKK...', '..K.....K..', '.KKKKKKKKK.', 'KBBBBBBBBBK', 'KWWWWYWWWWK', 'KBBBBYBBBBK', 'KBBBBBBBBBK', 'KBBBBBBBBBK', '.KKKKKKKKK.'],
    { K, B: '#8a5a32', W: '#b07a48', Y: '#e0b860' }),
  book: pixIcon(['KKKKKKKKKK.', 'KRRRRRRRRKP', 'KRYYYYYRRKP', 'KRRRRRRRRKP', 'KRRYYYRRRKP', 'KRRRRRRRRKP', 'KRRRRRRRRKP', 'KKKKKKKKKKP', '.PPPPPPPPPP'],
    { K, R: '#7a2a1e', Y: '#e0b860', P: '#e8d4a4' }),
  tent: pixIcon(['.....K.....', '....KCK....', '...KCWCK...', '..KCCKCCK..', '.KCCKDKCCK.', 'KCCCKDKCCCK', 'KKKKKKKKKKK'],
    { K, C: '#e0cfa4', W: '#fff4d8', D: '#3a2414' }),
  menu: pixIcon(['KKKKKKKKK', 'KWWWWWWWK', 'KKKKKKKKK', '.........', 'KKKKKKKKK', 'KWWWWWWWK', 'KKKKKKKKK', '.........', 'KKKKKKKKK', 'KWWWWWWWK', 'KKKKKKKKK'],
    { K, W: '#f0e2c4' }),
  hand: pixIcon(['...KK.KK...', '..KWWKWWKK.', '..KWWKWWKWK', 'KKKWWKWWKWK', 'KWKWWWWWWWK', 'KWWWWWWWWWK', '.KWWWWWWWK.', '..KWWWWWK..', '...KKKKK...'],
    { K, W: '#f6dca0' }),
};
export const CSS = `
:root {
  --ink: #2a1d14; --ink2: #4a3526; --paper: #eadcbc; --paper2: #dccaa2; --paper3: #c9b386;
  --leather: #2b1d14; --leather2: #3a281b; --gold: #d2a64e; --gold2: #f0cf7a; --red: #9a2f22; --red2: #c8442f;
  --green: #5f7f3a; --blue: #3c6a8a; --muted: #8c7558; --shadow: rgba(10,6,3,0.55);
}
* { box-sizing: border-box; }
#ui { position: fixed; inset: 0; pointer-events: none; font-family: 'Fell', Georgia, serif; color: var(--paper); user-select: none; }
#ui .click, #ui button, #ui input, #ui .panel, #ui .modal { pointer-events: auto; }
.pix { font-family: 'Pix', monospace; }
/* Numerals: the pixel face draws 2/Z and 5/S alike at small sizes, so figures (money, prices,
   clock, distances, keys) use a clear monospace with lining, tabular digits. */
:root { --num: ui-monospace, 'DejaVu Sans Mono', 'Cascadia Mono', Menlo, Consolas, monospace; }
.rye { font-family: 'Rye', serif; letter-spacing: 0.04em; }
button { font-family: 'Fell', Georgia, serif; }

/* HUD */
.hud-cores { position: absolute; left: 18px; top: 16px; display: flex; gap: 14px; align-items: flex-start; }
.core-group { background: linear-gradient(180deg, rgba(58,40,27,0.84), rgba(36,24,16,0.7)); border: 1px solid rgba(210,166,78,0.5); border-radius: 6px; padding: 7px 10px 6px 34px; min-width: 176px; box-shadow: inset 0 1px 0 rgba(255,230,170,0.12), 0 2px 10px var(--shadow); }
#ui .core-group h4, #ui .core-group .tags { margin-left: -24px; }
.core-group h4 { margin: 0 0 4px; font: 600 12px 'Pix', monospace; color: var(--gold2); letter-spacing: .08em; text-transform: uppercase; display:flex; justify-content: space-between; gap: 8px; }
.core-group h4 span { color: var(--paper2); font-weight: 400; text-transform: none; letter-spacing: 0; }
.bar { height: 8px; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,0,0,0.7); margin: 4px 0; position: relative; border-radius: 2px; overflow: hidden; box-shadow: 0 1px 0 rgba(255,230,170,0.08); }
.bar > i { position: absolute; left: 0; top: 0; bottom: 0; display: block; max-width: 100%; transition: width .15s linear; box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 0 rgba(0,0,0,0.22); }
/* HUD bar icons (the markup has no labels, so CSS draws a tiny pixel icon beside each bar):
   heart = health, bolt = stamina, bread = food & water, horseshoe = horse bond. */
.core-group .bar { overflow: visible; }
.core-group .bar > i { border-radius: 1px; }
.core-group .bar::before { content: ''; position: absolute; right: calc(100% + 7px); top: 50%; width: 18px; height: 16px; transform: translateY(-50%); background: center / contain no-repeat; image-rendering: pixelated; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.7)); }
.core-group .bar.hp::before { background-image: ${ICON.heart}; }
.core-group .bar.st::before { background-image: ${ICON.bolt}; }
.core-group .bar.ne::before { background-image: ${ICON.bread}; }
.core-group .bar.bd::before { background-image: ${ICON.shoe}; }
.core-group .bar { height: 9px; margin: 6px 0; }
.bar.hp > i { background: linear-gradient(90deg, #8a2a1e, #c8442f); }
.bar.st > i { background: linear-gradient(90deg, #a5822e, #e6c35a); }
.bar.bd > i { background: linear-gradient(90deg, #6a4f8a, #a98ad0); }
.bar.ne > i { background: linear-gradient(90deg, #3c6a8a, #6aa0c0); }
.bar-label { display: flex; justify-content: space-between; font: 11px var(--num); color: var(--paper2); }
.tags { font: italic 13px/15px 'Fell', Georgia, serif; color: #f0b090; margin-top: 2px; min-height: 13px; }
.hud-br { position: absolute; right: 18px; bottom: 18px; text-align: right; }
.hud-weapon { background: rgba(43,29,20,0.75); border: 1px solid rgba(210,166,78,0.45); padding: 6px 12px; border-radius: 6px; font: 13px 'Pix', monospace; color: var(--paper); }
.hud-weapon b { color: var(--gold2); font-weight: 600; }
.hud-bl { position: absolute; left: 18px; bottom: 18px; font: 12px var(--num); font-variant-numeric: tabular-nums lining-nums; background: rgba(43,29,20,0.62); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(210,166,78,0.35); line-height: 1.45; }
.hud-bl .date { color: var(--gold2); }
.hud-tr { position: absolute; right: 18px; top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.minimap { width: 168px; height: 168px; border-radius: 50%; border: 3px solid #5a4230; box-shadow: 0 0 0 2px var(--gold), 0 3px 12px var(--shadow); overflow: hidden; background: #2a2016; }
.money { font: 700 15px var(--num); font-variant-numeric: tabular-nums lining-nums; color: var(--gold2); background: rgba(43,29,20,0.75); padding: 4px 10px; border-radius: 5px; border: 1px solid rgba(210,166,78,0.45); }
.objective { max-width: 250px; background: linear-gradient(90deg, rgba(43,29,20,0.62), rgba(43,29,20,0.38)); border-left: 3px solid var(--gold); padding: 4px 9px; font-size: 14px; line-height: 1.25; border-radius: 0 5px 5px 0; text-shadow: 0 1px 2px rgba(0,0,0,0.85); }
.objective .qt { font: 600 11px 'Pix', monospace; color: var(--gold2); text-transform: uppercase; letter-spacing: .07em; }
.objective .dist { font: 11px var(--num); color: var(--paper3); }
.wanted { font: 600 14px 'Rye', serif; color: #fff; background: var(--red); padding: 4px 12px; border-radius: 4px; border: 1px solid #f0a090; animation: pulse 1s infinite; }
@keyframes pulse { 50% { filter: brightness(1.35); } }
.notes { position: absolute; left: 18px; top: 180px; display: flex; flex-direction: column; gap: 6px; max-width: 440px; }
.note { background: rgba(43,29,20,0.74); border-left: 3px solid var(--paper3); padding: 6px 10px; font-size: 15px; border-radius: 0 4px 4px 0; animation: slidein .25s ease-out; box-shadow: 0 2px 8px var(--shadow); }
.note.good { border-color: #8fc05a; } .note.bad { border-color: var(--red2); } .note.horse { border-color: #b996e0; } .note.quest { border-color: var(--gold); color: var(--gold2); } .note.law { border-color: #e05a40; color: #ffc0b0; }
.note.fade { opacity: 0; transition: opacity .6s; }
@keyframes slidein { from { transform: translateX(-20px); opacity: 0; } }
.banner { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); font: 30px 'Rye', serif; color: var(--paper); text-shadow: 0 2px 0 #000, 0 0 18px rgba(0,0,0,0.8); text-align: center; white-space: nowrap; transition: opacity .4s; }
.prompt { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); background: linear-gradient(180deg, rgba(43,29,20,0.74), rgba(30,20,13,0.66)); border: 1px solid rgba(210,166,78,0.5); border-radius: 6px; padding: 5px 12px 6px; min-width: 210px; box-shadow: inset 0 1px 0 rgba(255,230,170,0.1), 0 3px 10px rgba(10,6,3,0.4); text-shadow: 0 1px 1px rgba(0,0,0,0.8); }
.prompt .pt { font: 600 16px 'Fell', serif; color: var(--gold2); }
.prompt .ps { font: 11px 'Pix', monospace; color: var(--paper3); margin-bottom: 2px; }
.prompt .pa { font: 13px 'Pix', monospace; color: var(--paper); padding: 0; line-height: 19px; }
.prompt .pa.sel { color: #fff; }
.prompt .pa.dis { color: #8c7558; }
.key { display: inline-block; min-width: 18px; padding: 0 4px; margin-right: 6px; text-align: center; border: 1px solid var(--gold); border-bottom-width: 2px; border-radius: 3px; color: var(--gold2); font: 700 12px/15px var(--num); background: linear-gradient(180deg, rgba(90,66,40,0.55), rgba(0,0,0,0.4)); }
.bubble { position: absolute; transform: translate(-50%, -100%); background: var(--paper); color: var(--ink); padding: 4px 9px; border-radius: 8px; font-size: 14px; max-width: 260px; text-align: center; box-shadow: 0 2px 6px var(--shadow); }
.bubble:after { content: ''; position: absolute; left: 50%; bottom: -6px; border: 6px solid transparent; border-top-color: var(--paper); border-bottom: 0; transform: translateX(-50%); }
.bubble small { display: block; font: 10px 'Pix', monospace; color: var(--muted); }
.meter { position: absolute; left: 50%; top: 60%; transform: translateX(-50%); width: 320px; background: rgba(43,29,20,0.85); border: 1px solid var(--gold); padding: 8px 12px; border-radius: 6px; text-align: center; font: 13px 'Pix', monospace; }
.meter .track { height: 12px; background: #120c08; border: 1px solid #000; position: relative; margin-top: 6px; }
.meter .track i { position: absolute; top: -3px; width: 4px; height: 18px; background: var(--gold2); }
.meter .track .zone { position: absolute; top: 0; bottom: 0; background: rgba(95,127,58,0.6); }
.compass { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); width: 420px; height: 24px; background: linear-gradient(90deg, transparent, rgba(43,29,20,0.75) 15%, rgba(43,29,20,0.75) 85%, transparent); overflow: hidden; font: 600 13px 'Fell', Georgia, serif; letter-spacing: 1px; }
.compass span { position: absolute; top: 4px; transform: translateX(-50%); color: var(--paper3); }
.compass span.cd { color: var(--paper); font-weight: 600; }
.compass span.obj { color: var(--gold2); font-size: 15px; top: 1px; }
.reticle { position: absolute; width: 18px; height: 18px; transform: translate(-50%, -50%); border: 2px solid rgba(255,240,200,0.85); border-radius: 50%; }
.reticle:after { content: ''; position: absolute; left: 6px; top: 6px; width: 2px; height: 2px; background: #fff; }

/* Honour the OS reduced-motion preference for CSS animation (the in-game toggle covers screen shake). */
@media (prefers-reduced-motion: reduce) { .wanted, .note { animation: none !important; } .bar > i, .banner, .note.fade { transition: none !important; } }

/* Colour-blind friendly palette (blue/orange contrast, patterned bars) */
#ui.cb .bar.hp > i { background: repeating-linear-gradient(90deg, #d0701a 0 6px, #f0a040 6px 8px); }
#ui.cb .bar.st > i { background: linear-gradient(90deg, #2a5aa0, #5a9ae0); }
#ui.cb .bar.ne > i { background: repeating-linear-gradient(90deg, #3a7ac0 0 4px, #8ac0f0 4px 6px); }
#ui.cb .bar.bd > i { background: repeating-linear-gradient(90deg, #e0e0e0 0 3px, #9a9a9a 3px 5px); }
#ui.cb .note.good { border-color: #5a9ae0; } #ui.cb .note.bad, #ui.cb .note.law { border-color: #f0a040; }
#ui.cb .statbar.good i { background: #2a5aa0; } #ui.cb .statbar.bad i { background: #d0701a; }

/* Panels */
.modal { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(20,12,6,0.55), rgba(10,6,3,0.85)); display: flex; align-items: center; justify-content: center; }
.panel { background: var(--paper); color: var(--ink); border-radius: 4px; padding: 22px 26px; box-shadow: 0 0 0 2px var(--ink2), 0 0 0 6px var(--paper3), 0 0 0 8px var(--ink2), 0 18px 48px rgba(0,0,0,0.6);
  background-image: radial-gradient(ellipse at 20% 10%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(120,80,30,0.18), transparent 60%), repeating-linear-gradient(0deg, rgba(90,60,30,0.035) 0 2px, transparent 2px 5px);
  max-height: 90vh; overflow: auto; position: relative; }
.panel h2 { font: 30px 'Rye', serif; margin: 0 0 4px; color: var(--ink); text-align: center; }
.panel h3 { font: 20px 'Rye', serif; margin: 14px 0 6px; color: var(--red); border-bottom: 1px solid rgba(42,29,20,0.25); padding-bottom: 3px; }
.panel .sub { text-align: center; font-style: italic; color: var(--ink2); margin-bottom: 12px; }
.panel .close { position: absolute; right: 12px; top: 8px; font: 22px 'Rye', serif; cursor: pointer; color: var(--ink2); background: none; border: 0; }
.btn { display: inline-block; font: 17px 'Fell', serif; padding: 7px 16px; margin: 4px; background: linear-gradient(180deg, #4a3526, #2b1d14); color: var(--paper); border: 1px solid #120c08; border-radius: 3px; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 0 #120c08; }
.btn:hover:not(:disabled) { background: linear-gradient(180deg, #6a4a32, #3a281b); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 0 #120c08, 0 0 0 1px rgba(240,207,122,0.55); }
.btn:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 #120c08; }
.menu-btn:active:not(:disabled) { transform: translateY(2px); }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.red { background: linear-gradient(180deg, #b23c2a, #7a2418); }
.btn.gold { background: linear-gradient(180deg, #c99a40, #8a6420); color: #1a120a; }
.btn.small { font-size: 14px; padding: 3px 9px; }
.tabs { display: flex; gap: 4px; justify-content: center; margin-bottom: 10px; flex-wrap: wrap; }
.tabs .btn.active { background: linear-gradient(180deg, #c99a40, #8a6420); color: #1a120a; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; border-bottom: 1px dotted rgba(42,29,20,0.25); gap: 10px; }
.row:hover { background: rgba(120,80,30,0.08); }
.row .nm { font-size: 16px; }
.row .ds { font-size: 13px; color: var(--ink2); font-style: italic; }
.row .pr { margin-left: auto; min-width: 72px; text-align: right; font: 700 14px var(--num); font-variant-numeric: tabular-nums lining-nums; color: var(--ink); white-space: nowrap; }
.statline { display: grid; grid-template-columns: 120px 1fr 70px; gap: 8px; align-items: center; font-size: 15px; margin: 2px 0; }
.statbar { height: 9px; background: rgba(42,29,20,0.18); border: 1px solid rgba(42,29,20,0.4); position: relative; }
.statbar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #6a4a2a, #a5763a); }
.statbar.good i { background: linear-gradient(90deg, #4f6a2a, #7f9f42); }
.statbar.bad i { background: linear-gradient(90deg, #7a2418, #b23c2a); }
.chip { display: inline-block; padding: 1px 8px; border: 1px solid var(--ink2); border-radius: 10px; font-size: 13px; margin: 2px; background: rgba(255,255,255,0.3); }
.chip.warn { border-color: var(--red); color: var(--red); }
.muted { color: var(--ink2); font-style: italic; }
.dialogue { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: min(820px, 92vw); }
.dialogue .panel { padding: 16px 22px; }
.dlg-grid { display: grid; grid-template-columns: 128px 1fr; gap: 18px; align-items: start; }
.portrait { width: 120px; height: 132px; image-rendering: pixelated; border: 3px solid var(--ink2); box-shadow: 0 0 0 2px var(--paper3); background: radial-gradient(circle at 40% 30%, #d8b886, #8a6a44); }
@media (max-width: 640px) { .dlg-grid { grid-template-columns: 1fr; } .portrait { width: 80px; height: 88px; } }
.dialogue .speaker { font: 22px 'Rye', serif; color: var(--red); }
.dialogue .speaker small { font: 13px 'Fell', serif; color: var(--ink2); font-style: italic; margin-left: 8px; }
.dialogue .text { font-size: 19px; line-height: 1.45; margin: 6px 0 10px; }
.dialogue .opt { display: block; width: 100%; text-align: left; font: 17px 'Fell', serif; background: none; border: 0; padding: 5px 8px; cursor: pointer; color: var(--ink); border-radius: 3px; }
.dialogue .opt:hover:not(:disabled) { background: rgba(120,80,30,0.15); }
.dialogue .opt:disabled { color: #9a8a70; cursor: default; }
.dialogue .tone { font: 11px 'Pix', monospace; color: var(--muted); margin-left: 6px; text-transform: uppercase; }
.lore { font-size: 18px; line-height: 1.55; white-space: pre-wrap; font-family: 'Fell', serif; }
.lore.newspaper { columns: 2; column-gap: 26px; }
.menu-bg { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,10,4,0.2), rgba(20,10,4,0.75)); display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto; }
.title { font: clamp(48px, 9vw, 120px) 'Rye', serif; color: #f2e2bc; text-shadow: 0 4px 0 #3a1e10, 0 0 40px rgba(0,0,0,0.85); margin: 0; letter-spacing: .03em; }
.tagline { font: italic 22px 'Fell', serif; color: #e6d2a8; text-shadow: 0 2px 6px #000; margin-bottom: 34px; }
.menu-btn { display: block; width: 280px; margin: 6px auto; font: 22px 'Rye', serif; padding: 10px; background: rgba(43,29,20,0.82); color: var(--paper); border: 1px solid var(--gold); border-radius: 3px; cursor: pointer; }
.menu-btn:hover:not(:disabled) { background: rgba(154,47,34,0.9); color: #fff; }
.menu-btn:disabled { opacity: .4; cursor: default; }
.foot { position: absolute; bottom: 14px; font: 12px 'Pix', monospace; color: rgba(240,220,180,0.6); }
.creator { display: grid; grid-template-columns: 300px 1fr; gap: 24px; width: min(980px, 94vw); }
.preview { background: radial-gradient(circle at 50% 60%, #b8a070, #6a5236); border: 2px solid var(--ink2); height: 360px; display: flex; align-items: center; justify-content: center; image-rendering: pixelated; }
.swatches { display: flex; flex-wrap: wrap; gap: 5px; }
.sw { width: 24px; height: 24px; border: 2px solid var(--ink2); cursor: pointer; border-radius: 3px; }
.sw.on { outline: 3px solid var(--gold); }
.opt-row { margin: 7px 0; }
.opt-row label { font: 600 13px 'Pix', monospace; letter-spacing: .03em; color: var(--ink2); display: block; margin-bottom: 3px; text-transform: uppercase; }
/* Range sliders: a carved leather groove with a brass rivet, not the browser's default blue. */
#ui input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; cursor: pointer; accent-color: var(--gold); }
#ui input[type=range]:focus { outline: none; }
#ui input[type=range]::-webkit-slider-runnable-track { height: 8px; border-radius: 4px; background: linear-gradient(180deg, #2b1d14, #4a3526); border: 1px solid var(--ink); box-shadow: inset 0 2px 2px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.45); }
#ui input[type=range]::-moz-range-track { height: 8px; border-radius: 4px; background: linear-gradient(180deg, #2b1d14, #4a3526); border: 1px solid var(--ink); box-shadow: inset 0 2px 2px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.45); }
#ui input[type=range]::-moz-range-progress { height: 8px; border-radius: 4px; background: linear-gradient(180deg, #e6c35a, #a5822e); }
#ui input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff2c0, #f0cf7a 35%, #a5822e 75%, #6a4f1c); border: 2px solid var(--ink); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff2c0, #f0cf7a 35%, #a5822e 75%, #6a4f1c); border: 2px solid var(--ink); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]:hover::-webkit-slider-thumb, #ui input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(240,207,122,0.45), 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(240,207,122,0.45); }
#ui input[type=checkbox] { accent-color: var(--red); width: 15px; height: 15px; vertical-align: -2px; }
input.txt { font: 20px 'Fell', serif; padding: 5px 10px; border: 1px solid var(--ink2); background: rgba(255,255,255,0.5); width: 100%; }
.mapwrap { position: relative; image-rendering: pixelated; }
.mapwrap canvas { display: block; border: 2px solid var(--ink2); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 15px; }
.kv b { color: var(--ink2); font-weight: 600; }
.cards { display: flex; gap: 6px; justify-content: center; margin: 6px 0; }
.card { width: 54px; height: 76px; background: #fbf6ea; border: 1px solid #333; border-radius: 5px; display: flex; align-items: center; justify-content: center; font: 22px 'Fell', serif; color: #222; box-shadow: 1px 2px 3px rgba(0,0,0,0.3); }
.card.red { color: #a8241a; }
.card.back { background: repeating-linear-gradient(45deg, #7a2418 0 4px, #5a1a10 4px 8px); }
.death { font: 72px 'Rye', serif; color: #c8442f; text-shadow: 0 4px 0 #000; }
.help { font: 14px 'Pix', monospace; line-height: 1.6; color: var(--ink); columns: 2; }
.small-note { font: italic 13px 'Fell', Georgia, serif; color: var(--ink2); }

/* --- Touch controls (phones/tablets) --- */
html, body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
.touch { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.touch .tzone { position: absolute; left: 0; bottom: 0; width: 50%; height: 62%; pointer-events: auto; }
.touch .tstick { position: absolute; left: 90px; bottom: 90px; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 3px solid #1c120b; background: radial-gradient(circle, rgba(58,38,22,0.35) 55%, rgba(58,38,22,0.6) 70%, rgba(28,18,11,0.65)); box-shadow: inset 0 0 0 2px rgba(201,162,76,0.75), inset 0 0 0 6px rgba(28,18,11,0.35), 0 3px 10px rgba(0,0,0,0.35); opacity: 0; transition: opacity .15s; pointer-events: none; }
.touch .tstick::before { content: ''; position: absolute; inset: 9px; border-radius: 50%; border: 1px dashed rgba(240,207,122,0.45); }
.touch .tstick.on { opacity: 1; }
.touch .tknob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; border-radius: 50%; background: radial-gradient(circle at 38% 32%, #fff0b8 0 6%, #e8c060 22%, #b8862e 58%, #6a4818); border: 2px solid #1c120b; box-shadow: inset 0 0 0 3px rgba(106,72,24,0.55), inset 0 -3px 0 rgba(0,0,0,0.25), 0 3px 6px rgba(0,0,0,0.5); transform: translate(-50%,-50%); }
.touch .tbtns { position: absolute; right: 10px; bottom: 12px; width: 240px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; pointer-events: auto; }
.touch .tmenus { position: absolute; left: 50%; transform: translateX(-50%); top: 44px; display: flex; gap: 6px; pointer-events: auto; padding: 4px 6px; border-radius: 10px; background: linear-gradient(180deg, rgba(58,38,22,0.75), rgba(36,24,15,0.7)); border: 2px solid #1c120b; box-shadow: inset 0 0 0 1px rgba(201,162,76,0.55), 0 3px 8px rgba(0,0,0,0.35); }
/* Buttons: dark oiled wood tiles with a brass inlay rim, a lit top edge and a hard drop
   shadow, so they read as carved pieces of the game rather than flat overlays. */
.touch .tbtn { pointer-events: auto; position: relative; min-height: 48px; border-radius: 11px; border: 2px solid #1c120b; color: #f0e2c4; font: 700 16px Georgia, serif; padding: 2px; touch-action: none; text-shadow: 0 1px 0 #000;
  background: repeating-linear-gradient(96deg, rgba(0,0,0,0) 0 7px, rgba(0,0,0,0.07) 7px 9px, rgba(255,220,160,0.04) 9px 12px), linear-gradient(180deg, #6e4a2c, #4a3019 55%, #36220f);
  box-shadow: inset 0 0 0 2px rgba(201,162,76,0.8), inset 0 3px 0 2px rgba(255,226,160,0.18), inset 0 -3px 0 1px rgba(0,0,0,0.3), 0 3px 0 #1c120b, 0 5px 8px rgba(0,0,0,0.35); opacity: 0.94; }
.touch .tbtn .ic { display: block; width: 26px; height: 24px; margin: 0 auto; background: var(--ic) center / contain no-repeat; image-rendering: pixelated; filter: drop-shadow(0 0 1px rgba(255,232,180,0.55)) drop-shadow(0 1px 0 rgba(0,0,0,0.6)); pointer-events: none; }
.touch .tbtn small { display: block; margin-top: 1px; font: 600 9px/10px Georgia, serif; letter-spacing: .02em; color: #f0dca8; pointer-events: none; }
.touch .tmenus .tbtn { min-height: 40px; min-width: 46px; padding: 3px 5px 2px; border-radius: 8px; }
.touch .tmenus .tbtn .ic { width: 20px; height: 18px; }
.touch .tbtns .tbtn { width: 100%; }
.touch .tbtn.sw { font-size: 15px; color: #f0cf7a; min-height: 40px; }
/* Interact: a big brass medallion with the hand, the one button the thumb rests on. */
.touch .tbtn.big { grid-column: span 2; grid-row: span 2; border-radius: 50%; min-height: 102px; border-width: 3px;
  background: radial-gradient(circle at 38% 30%, #fff0b8 0 4%, #f0cf7a 16%, #c9993c 50%, #8a5e20 78%, #5a3a12);
  box-shadow: inset 0 0 0 4px rgba(90,58,18,0.55), inset 0 0 0 7px rgba(255,226,150,0.25), inset 0 -6px 0 4px rgba(0,0,0,0.18), 0 4px 0 #1c120b, 0 6px 12px rgba(0,0,0,0.4); }
.touch .tbtn.big .ic { width: 46px; height: 40px; filter: drop-shadow(0 2px 0 rgba(60,36,10,0.7)); }
.touch .tbtn .key-e { position: absolute; right: 14px; bottom: 12px; width: 20px; height: 20px; border-radius: 50%; background: #2b1d14; border: 2px solid #1c120b; box-shadow: inset 0 0 0 1px #c9a24c; color: #f0cf7a; font: 700 11px/16px Georgia, serif; text-align: center; text-shadow: none; }
/* Fire: red leather with the same brass rim. */
.touch .tbtn.fire { background: repeating-linear-gradient(45deg, rgba(0,0,0,0) 0 3px, rgba(0,0,0,0.06) 3px 4px), linear-gradient(180deg, #b03a26, #7a2416 60%, #561608); }
.touch .tbtn.on { transform: translateY(2px); filter: brightness(1.35); box-shadow: inset 0 0 0 2px #f0cf7a, inset 0 2px 6px rgba(0,0,0,0.45), 0 1px 0 #1c120b; }
${Object.entries(ICON).map(([k, v]) => `.ti-${k} { --ic: ${v}; }`).join('\n')}
.touch-tip { display: none; }
body.has-touch .pa { pointer-events: auto; cursor: pointer; padding: 3px 0; }
/* Menus and dialogue still scroll with a finger. */
.modal, .modal .panel, .menu-bg, .dialogue { touch-action: pan-y; }
.modal .panel { max-height: 94vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
/* Small touch screens: a compact HUD that leaves room for the thumbs. */
@media (max-height: 560px), (max-width: 700px) {
  body.has-touch .hud-cores { zoom: 0.62; }
  body.has-touch .hud-tr { zoom: 0.62; }
  body.has-touch .hud-tr .objective { max-width: 260px; }
  body.has-touch .hud-bl { zoom: 0.7; bottom: auto; top: 118px; }
  body.has-touch .hud-br { display: none; }
  body.has-touch .notes { zoom: 0.62; top: 210px; max-width: 520px; }
  body.has-touch .compass { zoom: 0.75; }

  /* Interaction prompt sits low-left of the rider, clear of the rider, the menu bar and the action cluster. */
  body.has-touch .prompt { zoom: 0.8; top: auto; bottom: 70px; left: 30%; }
  body.has-touch .touch .tmenus { top: auto; bottom: 8px; left: 50%; zoom: 0.85; }
  body.has-touch .touch .tbtns { zoom: 0.82; }
  body.has-touch .dialogue { zoom: 0.72; }
}
@media (orientation: portrait) and (max-width: 700px) {
  body.has-touch .touch-tip { display: block; position: absolute; top: 40%; left: 10%; right: 10%; padding: 12px; text-align: center; background: rgba(43,29,20,0.85); color: #f0e2c4; border: 2px solid #c8a44a; border-radius: 10px; font: 15px Georgia, serif; z-index: 6; pointer-events: none; animation: tipfade 6s forwards; }
}
@keyframes tipfade { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
`;
