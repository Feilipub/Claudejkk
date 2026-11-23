# Wild Frontier: How to Play

An original open-world western RPG about horses, land and water in 1888's fictional Calder Territory.

## Launch

You need Node.js 20 or newer. Everything else is in `package.json`.

```bash
npm install
npm run build          # writes dist/ (index.html + game.js) and dist/wild-frontier.html (single file)
npm run dev            # build, then serve dist/ at http://localhost:8080
```

You can also open **`dist/wild-frontier.html`** directly in Chrome, Edge or Firefox. That file is fully self-contained,
with fonts and code inlined. Saves go to the browser's localStorage.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / steer horse | WASD / arrows | Left stick |
| Run / spur up a gait | Shift | L3 |
| Slow down a gait | Ctrl or C | — |
| Rein back (mounted, standing) | Q | — |
| Jump (canter or faster) | Space | — |
| Mount / dismount | F | B |
| Whistle for your horse | H | Y |
| Interact (selected option / numbered options) | E / 1–6 (Z/X scrolls) | A |
| Draw / holster | G | — |
| Switch weapon | Z / X / mouse wheel | LB / RB |
| Aim / fire | Right mouse / left mouse | LT / RT (right stick aims) |
| Reload | R | X |
| Crouch (stalk animals) | V | R3 |
| Lantern | L | — |
| Make camp | K | — |
| Inventory · Horse · Map · Journal · Character | I/Tab · B · M · J · O | View = Map |
| Pause / menu | Esc | Menu |
| Quick save | F5 | — |

## Phone and tablet (touch)
The touch controls appear on their own on touch screens. Play with the phone held sideways.
- **Move:** put a thumb anywhere on the left half of the screen and drag. A joystick appears where you touch.
- **Right-hand buttons:**
  - **E**: talk or interact.
  - **Montar**: mount or dismount.
  - **Correr**: run, or spur the horse up a gait.
  - **Frear**: slow down.
  - **Pular**: jump.
  - **Assobio**: whistle for your horse.
  - **Arma**: draw or holster.
  - **Atirar**: fire where you face. With a weapon drawn, tapping the world also fires there.
  - **◀ ▶**: cycle the prompt options.
- **Bottom bar:** ☰ pause, save and settings; Mapa; Itens; Cavalo; Diário; Acampar.
- **Prompts:** tap any line of an interaction prompt to choose it. Menus and dialogue scroll with a finger.
- **Map zoom:** the map has + and − buttons. Tap the map to set a waypoint.

## First hour
1. Talk to **Josiah Oakes** at the Larkspur Livery, the big red barn south of the main street. Lost? Ask anyone in town "I'm looking for…" and they mark him on your compass. He lends you Biscuit.
2. Ride Biscuit to the **Brannigan Horse Ranch**, which is south-west on the ranch spur.
3. Hollis lets you choose your horse: **Juniper**, **Absalom** or **Ransom**. Each has a different temperament.
4. Brush, feed and water your new horse. Care is how you build a bond.
5. Follow the stolen horses' trail. Or don't: the territory is open from the first minute.

## Tips
- **Bond:** your horse's bond (shown on its HUD bar) raises obedience, whistle range, calmness under fire and stamina efficiency.
- **Variety:** repeating the same care action many times in one day stops helping. Mix care, riding and time together.
- **Pacing:** don't gallop over rocks unshod, or run your horse to exhaustion. It will go lame, and lameness takes days to heal.
- **Weather:** in the High Sierra, put a heavy blanket on your horse and keep a fire going at night.
- **The law:** crimes only matter if someone sees them and lives to report them. Lawmen will try to arrest you before shooting.
- **Markets:** traders' prices drift and depend on your reputation. Pelts sell for less if you flood one market.
