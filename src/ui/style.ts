/** Western design system for the DOM interface. */

import { BTN, FRAME_LEATHER, FRAME_WOOD, ICON, MEDALLION, MEDALLION_DOWN, PARCHMENT, STICK_KNOB, STICK_RING } from './icons.ts';

/*
 * Pixel-art skin: frames, buttons and icons are hand-drawn grids (ui/icons.ts)
 * used as border-images at integer scales (2× HUD, 3× dialogs), so the interface
 * reads as carved wood, brass and stitched leather rather than soft gradients.
 * Text stays in the readable Fell/Rye faces; figures in the clear monospace.
 */
const leather2x = `border: 8px solid transparent; border-image: ${FRAME_LEATHER} 4 / 8px / 0 repeat;`;
const wood3x = `border: 24px solid transparent; border-image: ${FRAME_WOOD} 8 / 24px / 0 repeat;`;
const btn = (skin: keyof typeof BTN, px: number) => `border-style: solid; border-width: ${3 * px}px ${3 * px}px ${4 * px}px; border-image: ${BTN[skin].up} 3 3 4 3 fill / ${3 * px}px ${3 * px}px ${4 * px}px / 0 stretch;`;
const btnDown = (skin: keyof typeof BTN) => `border-image-source: ${BTN[skin].down};`;
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
.core-group { background: rgba(46,32,22,0.88); ${leather2x} padding: 1px 4px 0 30px; min-width: 176px; box-shadow: 0 3px 0 rgba(10,6,3,0.35); }
#ui .core-group h4, #ui .core-group .tags { margin-left: -24px; }
.core-group h4 { margin: 0 0 4px; font: 600 12px 'Pix', monospace; color: var(--gold2); letter-spacing: .08em; text-transform: uppercase; display:flex; justify-content: space-between; gap: 8px; }
.core-group h4 span { color: var(--paper2); font-weight: 400; text-transform: none; letter-spacing: 0; }
/* Bars: an ink-lined slot with a flat fill, one 2px highlight and one 2px shadow band. */
.bar { height: 10px; background: #1a100a; border: 2px solid #0e0805; margin: 4px 0; position: relative; overflow: hidden; box-shadow: 0 2px 0 rgba(255,230,170,0.10); }
.bar > i { position: absolute; left: 0; top: 0; bottom: 0; display: block; max-width: 100%; transition: width .15s linear; box-shadow: inset 0 2px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.28); }
/* HUD bar icons (the markup has no labels, so CSS draws a tiny pixel icon beside each bar):
   heart = health, bolt = stamina, bread = food & water, horseshoe = horse bond. */
.core-group .bar { overflow: visible; }
.core-group .bar::before { content: ''; position: absolute; right: calc(100% + 5px); top: 50%; width: 22px; height: 22px; margin-top: -11px; background: center / contain no-repeat; image-rendering: pixelated; }
.core-group .bar.hp::before { background-image: ${ICON.heart}; }
.core-group .bar.st::before { background-image: ${ICON.bolt}; }
.core-group .bar.ne::before { background-image: ${ICON.bread}; }
.core-group .bar.bd::before { background-image: ${ICON.shoe}; }
.core-group .bar { height: 12px; margin: 7px 0; }
.bar.hp > i { background: #c83c2c; }
.bar.st > i { background: #e0b43a; }
.bar.bd > i { background: #9a78c8; }
.bar.ne > i { background: #4a8ab4; }
.bar-label { display: flex; justify-content: space-between; font: 11px var(--num); color: var(--paper2); }
.tags { font: italic 13px/15px 'Fell', Georgia, serif; color: #f0b090; margin-top: 2px; min-height: 13px; }
.hud-br { position: absolute; right: 18px; bottom: 18px; text-align: right; }
.hud-weapon { background: rgba(46,32,22,0.88); ${leather2x} padding: 1px 6px; font: 13px 'Pix', monospace; color: var(--paper); }
.hud-weapon b { color: var(--gold2); font-weight: 600; }
.hud-bl { position: absolute; left: 18px; bottom: 18px; font: 12px var(--num); font-variant-numeric: tabular-nums lining-nums; background: rgba(46,32,22,0.82); ${leather2x} padding: 1px 6px; line-height: 1.45; }
.hud-bl .date { color: var(--gold2); }
.hud-tr { position: absolute; right: 18px; top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
/* Minimap: a wooden ring inside a brass band, hard-edged rings with no blur. */
.minimap { width: 168px; height: 168px; border-radius: 50%; border: 4px solid #6c4228; box-shadow: 0 0 0 2px #1c120b, 0 0 0 5px #c4962e, 0 0 0 7px #1c120b, 0 5px 0 7px rgba(10,6,3,0.3); overflow: hidden; background: #2a2016; }
.money { font: 700 15px var(--num); font-variant-numeric: tabular-nums lining-nums; color: var(--gold2); background: rgba(46,32,22,0.88); ${leather2x} padding: 0 6px; margin-top: 4px; }
.objective { max-width: 250px; background: rgba(36,24,16,0.72); border-left: 4px solid #c4962e; box-shadow: inset 2px 0 0 #8e6420, 0 2px 0 rgba(10,6,3,0.3); padding: 4px 9px; font-size: 14px; line-height: 1.25; text-shadow: 0 1px 0 rgba(0,0,0,0.85); }
.objective .qt { font: 600 11px 'Pix', monospace; color: var(--gold2); text-transform: uppercase; letter-spacing: .07em; }
.objective .dist { font: 11px var(--num); color: var(--paper3); }
.wanted { font: 600 14px 'Rye', serif; color: #fff; ${btn('red', 2)} padding: 0 8px; animation: pulse 1s infinite; }
@keyframes pulse { 50% { filter: brightness(1.35); } }
.notes { position: absolute; left: 18px; top: 180px; display: flex; flex-direction: column; gap: 6px; max-width: 440px; }
.note { background: rgba(36,24,16,0.82); border-left: 4px solid var(--paper3); padding: 5px 10px; font-size: 15px; animation: slidein .25s ease-out; box-shadow: 0 2px 0 rgba(10,6,3,0.35); }
.note.good { border-color: #8fc05a; } .note.bad { border-color: var(--red2); } .note.horse { border-color: #b996e0; } .note.quest { border-color: var(--gold); color: var(--gold2); } .note.law { border-color: #e05a40; color: #ffc0b0; }
.note.fade { opacity: 0; transition: opacity .6s; }
@keyframes slidein { from { transform: translateX(-20px); opacity: 0; } }
.banner { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); font: 30px 'Rye', serif; color: var(--paper); text-shadow: 0 2px 0 #000, 0 0 18px rgba(0,0,0,0.8); text-align: center; white-space: nowrap; transition: opacity .4s; }
.prompt { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); background: rgba(46,32,22,0.9); ${leather2x} padding: 0 6px 1px; min-width: 210px; box-shadow: 0 3px 0 rgba(10,6,3,0.35); text-shadow: 0 1px 0 rgba(0,0,0,0.8); }
.prompt .pt { font: 600 16px 'Fell', serif; color: var(--gold2); }
.prompt .ps { font: 11px 'Pix', monospace; color: var(--paper3); margin-bottom: 2px; }
.prompt .pa { font: 13px 'Pix', monospace; color: var(--paper); padding: 0; line-height: 19px; }
.prompt .pa.sel { color: #fff; }
.prompt .pa.dis { color: #8c7558; }
/* Keycap: a little brass-rimmed block standing on a 2px lip. */
.key { display: inline-block; min-width: 18px; padding: 0 4px; margin-right: 6px; text-align: center; border: 2px solid #c4962e; border-bottom: 4px solid #8e6420; color: var(--gold2); font: 700 12px/13px var(--num); background: #3a281b; box-shadow: 0 0 0 1px #1c120b; }
/* Speech bubble: parchment with a 2px ink line, notched corners and a stepped pixel tail. */
.bubble { position: absolute; transform: translate(-50%, -100%); background: var(--paper); color: var(--ink); padding: 3px 9px; font-size: 14px; max-width: 260px; text-align: center; border: 2px solid #2a1d14; box-shadow: 0 2px 0 rgba(10,6,3,0.35);
  clip-path: polygon(0 2px, 2px 2px, 2px 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 2px calc(100% - 2px), 0 calc(100% - 2px)); overflow: visible; }
.bubble:after { content: ''; position: absolute; left: 50%; bottom: -8px; width: 8px; height: 6px; margin-left: -4px; background: linear-gradient(#2a1d14, #2a1d14) 0 0 / 8px 2px no-repeat, linear-gradient(#2a1d14, #2a1d14) 2px 2px / 4px 2px no-repeat, linear-gradient(#2a1d14, #2a1d14) 2px 4px / 2px 2px no-repeat; }
.bubble small { display: block; font: 10px 'Pix', monospace; color: var(--muted); }
.meter { position: absolute; left: 50%; top: 60%; transform: translateX(-50%); width: 320px; background: rgba(46,32,22,0.9); ${leather2x} padding: 2px 6px; text-align: center; font: 13px 'Pix', monospace; }
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
@media (prefers-reduced-motion: reduce) { .wanted, .note { animation: none !important; } .bar > i, .banner, .note.fade, .touch .tstick { transition: none !important; } }

/* Colour-blind friendly palette (blue/orange contrast, patterned bars) */
#ui.cb .bar.hp > i { background: repeating-linear-gradient(90deg, #d0701a 0 6px, #f0a040 6px 8px); }
#ui.cb .bar.st > i { background: #3a7ad0; }
#ui.cb .bar.ne > i { background: repeating-linear-gradient(90deg, #3a7ac0 0 4px, #8ac0f0 4px 6px); }
#ui.cb .bar.bd > i { background: repeating-linear-gradient(90deg, #e0e0e0 0 3px, #9a9a9a 3px 5px); }
#ui.cb .note.good { border-color: #5a9ae0; } #ui.cb .note.bad, #ui.cb .note.law { border-color: #f0a040; }
#ui.cb .statbar.good i { background: #2a5aa0; } #ui.cb .statbar.bad i { background: #d0701a; }

/* Panels */
.modal { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(20,12,6,0.55), rgba(10,6,3,0.85)); display: flex; align-items: center; justify-content: center; }
/* Dialogs: parchment inside a carved wooden frame with brass corner plates (3× pixels). */
.panel { background: #ead8b0 ${PARCHMENT} 0 0 / 48px 48px repeat; color: var(--ink); ${wood3x} padding: 6px 16px 10px; box-shadow: 0 8px 0 rgba(10,6,3,0.4);
  max-height: 90vh; overflow: auto; position: relative; }
.panel h2 { font: 30px 'Rye', serif; margin: 0 0 4px; color: var(--ink); text-align: center; }
.panel h3 { font: 20px 'Rye', serif; margin: 14px 0 6px; color: var(--red); border-bottom: 2px solid #c8a46a; box-shadow: 0 2px 0 #f6ead0; padding-bottom: 3px; }
.panel .sub { text-align: center; font-style: italic; color: var(--ink2); margin-bottom: 12px; }
.panel .close { position: absolute; right: 4px; top: 4px; width: 34px; height: 34px; padding: 0; font: 18px/18px 'Rye', serif; cursor: pointer; color: #1a120a; background: none; ${btn('gold', 2)} }
.panel .close:active { ${btnDown('gold')} padding-top: 4px; }
/* Buttons: chunky pixel blocks on a dark lip. Pressed, the block drops 2px onto
   the lip (a second drawing, not a transform), and the label drops with it. */
.btn { display: inline-block; font: 17px 'Fell', serif; padding: 1px 10px 3px; margin: 4px 3px; background: none; color: var(--paper); ${btn('wood', 2)} cursor: pointer; text-shadow: 0 2px 0 rgba(0,0,0,0.45); }
.btn:hover:not(:disabled) { color: #fff; filter: brightness(1.12); }
.btn:active:not(:disabled) { ${btnDown('wood')} padding: 3px 10px 1px; }
.btn:focus-visible { outline: 2px solid var(--gold2); outline-offset: 1px; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.red { border-image-source: ${BTN.red.up}; }
.btn.red:active:not(:disabled) { border-image-source: ${BTN.red.down}; }
.btn.gold, .tabs .btn.active { border-image-source: ${BTN.gold.up}; color: #1a120a; text-shadow: 0 1px 0 rgba(255,240,180,0.6); }
.btn.gold:active:not(:disabled) { border-image-source: ${BTN.gold.down}; }
.btn.small { font-size: 14px; padding: 0 7px 2px; }
.btn.small:active:not(:disabled) { padding: 2px 7px 0; }
.tabs { display: flex; gap: 2px; justify-content: center; margin-bottom: 10px; flex-wrap: wrap; }
.menu-btn:active:not(:disabled) { ${btnDown('dark')} padding: 6px 10px 2px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
/* Item rows read as slots: an inset strip with a 2px dark top edge and a lit bottom edge. */
.row { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; margin: 3px 0; gap: 10px; background: rgba(120,84,40,0.07); box-shadow: inset 0 2px 0 rgba(90,60,30,0.16), inset 0 -2px 0 rgba(255,250,235,0.45); }
.row:hover { background: rgba(196,150,46,0.16); }
.row .nm { font-size: 16px; }
.row .ds { font-size: 13px; color: var(--ink2); font-style: italic; }
.row .pr { margin-left: auto; min-width: 72px; text-align: right; font: 700 14px var(--num); font-variant-numeric: tabular-nums lining-nums; color: var(--ink); white-space: nowrap; }
.statline { display: grid; grid-template-columns: 120px 1fr 70px; gap: 8px; align-items: center; font-size: 15px; margin: 2px 0; }
.statbar { height: 10px; background: rgba(42,29,20,0.25); border: 2px solid #4a3526; position: relative; }
.statbar i { position: absolute; left: 0; top: 0; bottom: 0; background: #9a6a34; box-shadow: inset 0 2px 0 rgba(255,255,255,0.28); }
.statbar.good i { background: #6a8e34; }
.statbar.bad i { background: #a83226; }
.chip { display: inline-block; padding: 0 7px; border: 2px solid var(--ink2); font-size: 13px; margin: 2px; background: rgba(255,250,235,0.45); box-shadow: 0 2px 0 rgba(42,29,20,0.25); }
.chip.warn { border-color: var(--red); color: var(--red); }
.muted { color: var(--ink2); font-style: italic; }
.dialogue { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: min(820px, 92vw); }
.dialogue .panel { padding: 16px 22px; }
.dlg-grid { display: grid; grid-template-columns: 128px 1fr; gap: 18px; align-items: start; }
.portrait { width: 120px; height: 132px; image-rendering: pixelated; border: 4px solid #6c4228; box-shadow: 0 0 0 2px #1c120b, 0 0 0 4px #c4962e, 0 0 0 6px #1c120b; background: #b8956a; }
@media (max-width: 640px) { .dlg-grid { grid-template-columns: 1fr; } .portrait { width: 80px; height: 88px; } }
.dialogue .speaker { font: 22px 'Rye', serif; color: var(--red); }
.dialogue .speaker small { font: 13px 'Fell', serif; color: var(--ink2); font-style: italic; margin-left: 8px; }
.dialogue .text { font-size: 19px; line-height: 1.45; margin: 6px 0 10px; }
.dialogue .opt { display: block; width: 100%; text-align: left; font: 17px 'Fell', serif; background: none; border: 0; border-left: 4px solid transparent; padding: 4px 8px; cursor: pointer; color: var(--ink); }
.dialogue .opt:hover:not(:disabled) { background: rgba(196,150,46,0.18); border-left-color: #c4962e; }
.dialogue .opt:disabled { color: #9a8a70; cursor: default; }
.dialogue .tone { font: 11px 'Pix', monospace; color: var(--muted); margin-left: 6px; text-transform: uppercase; }
.lore { font-size: 18px; line-height: 1.55; white-space: pre-wrap; font-family: 'Fell', serif; }
.lore.newspaper { columns: 2; column-gap: 26px; }
.menu-bg { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,10,4,0.2), rgba(20,10,4,0.75)); display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto; }
.title { font: clamp(48px, 9vw, 120px) 'Rye', serif; color: #f2e2bc; text-shadow: 0 4px 0 #3a1e10, 0 0 40px rgba(0,0,0,0.85); margin: 0; letter-spacing: .03em; }
.tagline { font: italic 22px 'Fell', serif; color: #e6d2a8; text-shadow: 0 2px 6px #000; margin-bottom: 34px; }
.menu-btn { display: block; width: 280px; margin: 6px auto; font: 22px 'Rye', serif; padding: 4px 10px 4px; background: none; color: var(--paper); ${btn('dark', 2)} cursor: pointer; text-shadow: 0 2px 0 rgba(0,0,0,0.5); }
.menu-btn:hover:not(:disabled) { border-image-source: ${BTN.red.up}; color: #fff; }
.menu-btn:disabled { opacity: .4; cursor: default; }
.foot { position: absolute; bottom: 14px; font: 12px 'Pix', monospace; color: rgba(240,220,180,0.6); }
.creator { display: grid; grid-template-columns: 300px 1fr; gap: 24px; width: min(980px, 94vw); }
.preview { background: radial-gradient(circle at 50% 60%, #b8a070, #6a5236); border: 2px solid var(--ink2); height: 360px; display: flex; align-items: center; justify-content: center; image-rendering: pixelated; }
.swatches { display: flex; flex-wrap: wrap; gap: 5px; }
.sw { width: 24px; height: 24px; border: 2px solid var(--ink2); cursor: pointer; box-shadow: inset 2px 2px 0 rgba(255,255,255,0.3), inset -2px -2px 0 rgba(0,0,0,0.25); }
.sw.on { outline: 3px solid var(--gold); outline-offset: 1px; }
.opt-row { margin: 7px 0; }
.opt-row label { font: 600 13px 'Pix', monospace; letter-spacing: .03em; color: var(--ink2); display: block; margin-bottom: 3px; text-transform: uppercase; }
/* Range sliders: a carved leather groove with a brass rivet, not the browser's default blue. */
#ui input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; cursor: pointer; accent-color: var(--gold); }
#ui input[type=range]:focus { outline: none; }
#ui input[type=range]::-webkit-slider-runnable-track { height: 8px; background: #2b1d14; border: 2px solid var(--ink); box-shadow: inset 0 2px 0 rgba(0,0,0,0.45), 0 2px 0 rgba(255,250,235,0.5); }
#ui input[type=range]::-moz-range-track { height: 8px; background: #2b1d14; border: 2px solid var(--ink); box-shadow: inset 0 2px 0 rgba(0,0,0,0.45), 0 2px 0 rgba(255,250,235,0.5); }
#ui input[type=range]::-moz-range-progress { height: 8px; background: #d4a63a; }
#ui input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 20px; margin-top: -8px; background: #d4a63a; border: 2px solid var(--ink); box-shadow: inset 2px 2px 0 #fff0a0, inset -2px -2px 0 #8e6420, 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]::-moz-range-thumb { width: 10px; height: 16px; border-radius: 0; background: #d4a63a; border: 2px solid var(--ink); box-shadow: inset 2px 2px 0 #fff0a0, inset -2px -2px 0 #8e6420, 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]:hover::-webkit-slider-thumb, #ui input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(240,207,122,0.45), 0 2px 0 rgba(0,0,0,0.35); }
#ui input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(240,207,122,0.45); }
#ui input[type=checkbox] { accent-color: var(--red); width: 15px; height: 15px; vertical-align: -2px; }
input.txt { font: 20px 'Fell', serif; padding: 5px 10px; border: 2px solid var(--ink2); box-shadow: inset 0 2px 0 rgba(42,29,20,0.2); background: rgba(255,250,235,0.6); width: 100%; }
.mapwrap { position: relative; image-rendering: pixelated; }
.mapwrap canvas { display: block; border: 4px solid #6c4228; box-shadow: 0 0 0 2px #1c120b; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 15px; }
.kv b { color: var(--ink2); font-weight: 600; }
.cards { display: flex; gap: 6px; justify-content: center; margin: 6px 0; }
.card { width: 54px; height: 76px; background: #fbf6ea; border: 1px solid #333; border-radius: 5px; display: flex; align-items: center; justify-content: center; font: 22px 'Fell', serif; color: #222; box-shadow: 1px 2px 3px rgba(0,0,0,0.3); }
.card.red { color: #a8241a; }
.card.back { background: repeating-linear-gradient(45deg, #7a2418 0 4px, #5a1a10 4px 8px); }
.death { font: 72px 'Rye', serif; color: #c8442f; text-shadow: 0 4px 0 #000; }
.help { font: 14px 'Pix', monospace; line-height: 1.6; color: var(--ink); columns: 2; }
.small-note { font: italic 13px 'Fell', Georgia, serif; color: var(--ink2); }

/* Title-menu signs: pressed state after hover so it wins while held. */
.menu-btn:active:not(:disabled) { border-image-source: ${BTN.red.down}; padding: 6px 10px 2px; }

/* --- Touch controls (phones/tablets) --- */
html, body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
.touch { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.touch .tzone { position: absolute; left: 0; bottom: 0; width: 42%; height: 62%; pointer-events: auto; }
/* Joystick: a hollow brass ring (34px grid at 3×) and a brass knob (16px grid at 3×). */
.touch .tstick { position: absolute; left: 90px; bottom: 90px; width: 102px; height: 102px; margin: -51px 0 0 -51px; border-radius: 50%; background: ${STICK_RING} center / 102px 102px no-repeat; opacity: 0; transition: opacity .15s; pointer-events: none; }
.touch .tstick.on { opacity: 1; }
.touch .tknob { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; border-radius: 50%; background: ${STICK_KNOB} center / 48px 48px no-repeat; transform: translate(-50%,-50%); filter: drop-shadow(0 3px 0 rgba(0,0,0,0.4)); }
.touch .tbtns { position: absolute; right: 10px; bottom: 12px; width: 240px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; pointer-events: auto; }
.touch .tmenus { position: absolute; left: 50%; transform: translateX(-50%); top: 44px; display: flex; gap: 4px; pointer-events: auto; padding: 0 2px; background: rgba(46,32,22,0.88); ${leather2x} }
/* Buttons: the same chunky wooden block as the menus (3×), dropping onto its lip when held. */
.touch .tbtn { pointer-events: auto; position: relative; min-height: 54px; padding: 0 0 2px; color: #f0e2c4; font: 700 15px Georgia, serif; touch-action: none; text-shadow: 0 2px 0 #000; background: none; ${btn('wood', 3)} }
.touch .tbtn.on { ${btnDown('wood')} padding: 2px 0 0; }
.touch .tbtn .ic { display: block; width: 26px; height: 24px; margin: 0 auto; background: var(--ic) center / auto no-repeat; image-rendering: pixelated; pointer-events: none; }
.touch .tbtn small { display: block; margin-top: 1px; font: 600 9px/10px Georgia, serif; letter-spacing: .02em; color: #f0dca8; pointer-events: none; }
.touch .tmenus .tbtn { min-height: 44px; min-width: 46px; padding: 0 2px 2px; ${btn('wood', 2)} }
.touch .tmenus .tbtn.on { ${btnDown('wood')} padding: 2px 2px 0; }
.touch .tbtns .tbtn { width: 100%; }
.touch .tbtn.sw { font-size: 15px; color: #f0cf7a; min-height: 42px; }
/* Interact: a big brass medallion with the hand, the one button the thumb rests on. */
.touch .tbtn.big { grid-column: span 2; grid-row: span 2; border: 0; border-radius: 50%; min-height: 108px; background: ${MEDALLION} center / 102px 102px no-repeat; }
.touch .tbtn.big.on { background-image: ${MEDALLION_DOWN}; padding: 3px 0 0; }
.touch .tbtn.big .ic { zoom: 1.5; }
.touch .tbtn .key-e { position: absolute; right: 12px; bottom: 6px; width: 20px; height: 20px; background: #2b1d14; border: 2px solid #1c120b; box-shadow: inset 0 0 0 2px #c4962e; color: #f0cf7a; font: 700 11px/16px Georgia, serif; text-align: center; text-shadow: none; }
/* Fire: red leather block. */
.touch .tbtn.fire { border-image-source: ${BTN.red.up}; }
.touch .tbtn.fire.on { border-image-source: ${BTN.red.down}; }
${Object.entries(ICON).map(([k, v]) => `.ti-${k} { --ic: ${v}; }`).join('\n')}
body.has-touch .pa { pointer-events: auto; cursor: pointer; padding: 3px 0; }
body.has-touch .kbd-only { display: none !important; }
.touch .tbtn.rl { font-size: 10px; }
@media (max-height: 500px) {
  .menu-bg h1, .menu-bg .logo { font-size: 44px !important; margin: 4px 0 !important; }
  .menu-bg .menu-btn { padding: 2px 18px 4px !important; margin: 3px auto !important; font-size: 18px !important; }
  .menu-bg .tagline { font-size: 16px !important; }
  .menu-bg .foot, .menu-bg small, .menu-bg .about-note { display: none; }
}
/* Menus and dialogue still scroll with a finger. */
.modal, .modal .panel, .menu-bg, .dialogue { touch-action: pan-y; }
.modal .panel { max-height: 94vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* --- Phone layout (landscape) ---------------------------------------------
   A real compact HUD at 100% zoom (no fractional zoom, so pixel frames stay on
   whole pixels): two slim status plates top-left with one line of bars each,
   the compass centred on top, minimap + money + tracker top-right, notes in the
   left column above the joystick, the prompt in the middle band above the menu
   bar, and nothing under the right-hand action buttons. */
@media (max-height: 560px), (max-width: 760px) {
  body.has-touch .hud-cores { left: 6px; top: 6px; flex-direction: column; gap: 4px; }
  body.has-touch .core-group { min-width: 0; width: 200px; display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 17px; padding: 0 4px 1px 16px; }
  body.has-touch #ui .core-group h4 { grid-column: 1 / -1; margin: -1px 0 0 -12px; font-size: 10px; line-height: 12px; }
  body.has-touch #ui .core-group h4 span { font-size: 10px; }
  body.has-touch #ui .core-group .tags { display: none; }
  body.has-touch .core-group .bar { height: 8px; margin: 2px 0 3px; border-width: 2px; }
  body.has-touch .core-group .bar::before { width: 11px; height: 11px; margin-top: -6px; right: calc(100% + 3px); }
  body.has-touch .hud-bl { left: 6px; top: 100px; bottom: auto; width: 200px; font-size: 10px; line-height: 1.3; padding: 0 3px; }
  body.has-touch .hud-br { display: none; }
  body.has-touch .compass { top: 4px; width: 240px; height: 20px; font-size: 11px; }
  body.has-touch .compass span { top: 3px; }
  body.has-touch .compass span.obj { font-size: 12px; top: 2px; }
  body.has-touch .hud-tr { right: 8px; top: 8px; gap: 3px; }
  body.has-touch .minimap { width: 84px; height: 84px; border-width: 3px; }
  body.has-touch .money { font-size: 12px; margin-top: 2px; padding: 0 3px; }
  body.has-touch .hud-tr .objective { max-width: 200px; font-size: 11px; line-height: 1.2; padding: 2px 6px; }
  body.has-touch .objective .qt { font-size: 9px; }
  body.has-touch .objective .dist { font-size: 9px; }
  body.has-touch .wanted { font-size: 11px; }
  body.has-touch .notes { left: 6px; top: 152px; bottom: auto; max-width: 200px; gap: 3px; }
  body.has-touch .note { font-size: 12px; padding: 2px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.has-touch .notes .note:nth-last-child(n+4) { display: none; }
  body.has-touch .banner { font-size: 22px; top: 22%; }
  /* Prompt: the free middle band between the joystick and the buttons, above the menu bar. */
  body.has-touch .prompt { left: calc(50% - 31px); bottom: 62px; top: auto; transform: translateX(-50%); min-width: 170px; max-width: 330px; z-index: 4; }
  body.has-touch .prompt .pt { font-size: 13px; }
  body.has-touch .prompt .ps { font-size: 9px; }
  body.has-touch .prompt .pa { font-size: 11px; line-height: 15px; }
  body.has-touch .key { min-width: 15px; font-size: 10px; line-height: 11px; padding: 0 2px; margin-right: 4px; }
  body.has-touch .touch .tmenus { top: auto; bottom: 4px; left: calc((100% - 272px) / 2); gap: 2px; }
  body.has-touch .touch .tmenus .tbtn { min-height: 40px; min-width: 40px; }
  /* Five columns, three rows: the cluster stays low so the tracker above it never collides. */
  body.has-touch .touch .tbtns { right: 6px; bottom: 6px; width: 262px; gap: 4px; grid-template-columns: repeat(5, 1fr); }
  body.has-touch .touch .tbtn { min-height: 46px; border-width: 6px 6px 8px; border-image-width: 6px 6px 8px; }
  body.has-touch .touch .tbtn small { margin-top: 0; font-size: 8px; line-height: 9px; }
  body.has-touch .touch .tbtn.sw { min-height: 46px; }
  body.has-touch .touch .tbtn.big { min-height: 96px; background-size: 68px 68px; }
  body.has-touch .touch .tbtn.big .ic { zoom: 1; }
  body.has-touch .touch .tbtn .key-e { right: 16px; bottom: 10px; width: 16px; height: 16px; font-size: 9px; line-height: 12px; }
  body.has-touch .dialogue { width: min(760px, 96vw); bottom: 4px; }
  body.has-touch .dialogue .panel { padding: 2px 10px 4px; }
  body.has-touch .dialogue .text { font-size: 15px; margin: 2px 0 4px; }
  body.has-touch .dialogue .speaker { font-size: 17px; }
  body.has-touch .dialogue .opt { font-size: 14px; padding: 2px 8px; }
  body.has-touch .dlg-grid { grid-template-columns: 88px 1fr; gap: 10px; }
  body.has-touch .portrait { width: 80px; height: 88px; }
  .modal .panel, .dialogue .panel { border-width: 16px; border-image-width: 16px; }
  .panel h2 { font-size: 24px; }
}
`;
