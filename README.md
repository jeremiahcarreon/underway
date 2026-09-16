# UNDERWAY

A two-player, browser-based naval combat game where the fleets can move. One self-contained `index.html`; the only external dependency is PeerJS from a CDN. Open the file from `file://` or any static host. Append `?test=1` to run the rules-engine self-test suite. By default players find each other through the public PeerJS signaling server; to use your own PeerJS server (`npx peer --port 9000`), open the game once with `?peer=host:port` (or `?peer=https://host/path`) and the setting is remembered.

## Rule interpretations (where the brief was silent or ambiguous)

1. **Turn numbering.** One global counter increments at every hand-off (turn 1 = first player's first turn, turn 2 = second player's first turn). Pegs, logs, stats and the replay all use this number.
2. **Firing without maneuvering.** Choosing a target and pressing Fire during the maneuver phase forfeits the maneuver; the explicit "Skip maneuver" button does the same.
3. **Move legality checks destination cells only.** A rotation's swept cells are not checked, and a ship may overlap the cells it is leaving.
4. **CONFIRMED wording.** Re-firing a square you already hit reports "Confirmed: <class> still here". Striking an already-damaged section on a square you never hit before reports "Already burning: <class> has moved here", because damage travels with the ship. Both are the same CONFIRMED result and cost the shot.
5. **Wrecks and CONFIRMED.** Firing on a cell of an already-sunk ship reports CONFIRMED ("still here") with no new damage, because that section was already hit.
6. **Patrol Boat crippling.** Any hit cripples it (threshold 1); a stern hit is attributed to the stern rule, a bow hit to the threshold rule.
7. **Crippling and sinking on the same shot** report SUNK, not "crippled".
8. **Own-ocean pegs.** The defender's ocean shows every enemy shot as a faint peg. This gives the defender exactly the same stale information the attacker holds and never reveals anything new.
9. **Accuracy** counts HIT and SUNK shots; CONFIRMED costs a shot but is not a hit.
10. **MVP ship** ranks by turns survived while damaged, then shots absorbed (hits plus confirmations).
11. **Longest chase** is measured per class from first hit turn to sinking turn.
12. **Coin flip.** The host draws a seed; both clients derive the first player from the same seed and animate the same flip. Rematches skip the flip (loser fires first) and show a banner instead.
13. **Rematch** needs both players to press Rematch; the host then resets the room to the lobby with navies re-pickable.
14. **Surrender** ends the game for both sides via a GAME_OVER message; both still exchange history so the replay works.
15. **Fresh peer session.** If an opponent rejoins with a brand-new session (after Abandon), an in-progress battle cannot continue; both return to the lobby.
16. **Third connection.** The guest peer id is fixed per room, so a third device cannot register it and sees "Room full".
17. **Hotseat cinematic** plays the winner's view once for both players.
18. **Weapons.** Machine-gun bullets and air-strike bombs are recorded as individual shots (they count in shots fired and accuracy). A defender's device stores the opponent's mine positions because it must resolve movement silently; the UI never shows them. Radar contacts are never written to the log or the save. The AI uses shells only, but its moves set off your mines.
19. **Seeded RNG.** Fleet templates, random fleets, AI, and the coin flip use a seeded generator; radio chatter picks use plain randomness because tests never depend on them.

## Weapons (added after the first playtest, to shorten games)

Every weapon replaces your shot for the turn. Pick it in the action bar, then tap the enemy grid.

| Weapon | Cost / limit | What it does | What the enemy learns |
|---|---|---|---|
| Shell | unlimited | One cell. | Nothing about you. |
| Machine gun | reloads over 10 of your turns | Four bullets on any four cells, fired from a ship you choose. A ship takes **one** section of damage only if **two or more** bullets strike it; a lone bullet **grazes** (class revealed, no damage). | The firing ship's exact position and heading, marked on their tracking grid with the turn number. |
| Torpedo | reloads over 8 of your turns; Submarine must be undamaged and must not have moved this turn | Runs a full row or column from the edge you choose. The first enemy section it reaches takes a standard hit (wrecks and burning sections stop it with a Confirmed); nothing behind it is touched. A clear run reports "lane clear". | Only the lane and direction (a wake on their ocean). The Submarine stays hidden. |
| Mine | 2 per game | Laid on any enemy cell instead of firing. Hidden. It detonates as a **standard hit** (crippling rules apply) when an enemy section **moves onto** that cell, or **immediately** if you lay it right on a section (a wreck or burning section gives Confirmed and spends the mine). | Only that a mine was laid somewhere. When it detonates, you are told the cell and result. |
| Radar sweep | reloads over 8 of your turns; scanning ship must be **undamaged** | A square sized by the scanning ship (Carrier 5×5, Battleship 4×4, Destroyer/Submarine 3×3, Patrol 2×2). Every enemy section inside is shown for five seconds, then vanishes; the log keeps only the contact count. | The scanning ship's exact position. |
| Air strike | once per game; Carrier must be undamaged | Three bombs on three cells in a straight line; every bomb is a full shot. | The Carrier's exact position. |

Reloads count your own turns and tick down at the start of each of your turns. Weapon cooldowns, remaining uses, your own mines and every sighting are saved with the game.

## Manual test steps (Section 15 acceptance criteria)

1. Open `index.html` from disk and from a static host with DevTools open: no console errors.
2. Host: Create battle. Guest (other device): open the shared link, enter a name, Join. Both see the lobby with the room code.
3. Host picks Japan; guest sees Japan marked TAKEN. Guest picks Japan at the same instant (or before the lobby update lands): guest gets "That navy is taken by the host" and must re-pick; Random navy picks from the rest.
4. Placement: tap a ship, tap a cell (bow), tap the ship again to cycle heading, drag to move. Try placing over another ship or off the edge: refused with reason. Random fleet, Perimeter, Cluster, Spread all place a legal fleet; adjust one, press Ready.
5. Both screens play the same coin flip and land on the same navy; the named player has the first turn.
6. Advance/Reverse a ship: it slides one cell with a wake; the opponent's screen shows nothing and receives no message (network tab).
7. Rotate CW/CCW: the stern cell stays fixed, the bow sweeps a curved wake, the turn ends without a shot. A damaged ship's rotate buttons are disabled with "Damaged ships cannot rotate".
8. Move toward the edge, toward another own ship, or toward a wreck: the ship shakes, buzzes, and a one-line reason appears ("Off the board", "Blocked by …", "Blocked by wreck", "Crippled").
9. Fire at empty water: shell arc, whistle, splash column, ripples, "Miss".
10. Fire on a ship: flash, fireball, debris, shake; callout says "Hit: <class>" only. Peg shows class icon and turn number.
11. Hit a stern: klaxon, secondary explosion, oil slick, "Crippled: dead in the water" on both screens; the defender's ship loses its wake and shows the badge. Repeat for every class.
12. Hit non-stern sections until the threshold (Patrol 1, Destroyer 2, Submarine 2, Battleship 2, Carrier 3): crippled exactly on the threshold hit.
13. A damaged ship can still Advance/Reverse; a crippled one has every movement button disabled.
14. Fire at a burning section: "Confirmed: <class> still here", no new damage on the defender's dock.
15. Hit a ship, move it, fire the vacated cell: Miss. Fire the cell where the damaged section now sits: Confirmed.
16. Sink a ship: it lists, explodes along the hull, sailors jump, rafts appear, the hull slides under and the footprint is revealed on the tracking grid; earlier hit pegs of that class outside the footprint turn faded and dashed.
17. Try to move a ship through one of your own wrecks: "Blocked by wreck".
18. Every peg carries its turn number; hover (mouse) or long-press (touch) shows turn and result text history.
19. In placement and the docks, each class has a distinct top-down and side profile in the navy's livery with a bow chevron and stern flag.
20. Play through a turn with sound: cannon, whistle, splash, explosion, crackle loop while burning, klaxon, engine rumble, sinking, bugle/taps, UI sounds. Change volume and mute, reload: settings persist.
21. Refresh either browser mid-battle: Resume restores fleet, pegs, turn and phase and reconnects; go offline briefly: "reconnecting…" then resumes with no lost messages.
22. Sink the fifth ship: the game ends at once, each side plays its cinematic, the stats card matches the log, and the Reveal replay scrubs through every turn including the silent moves.
23. Both press Rematch: back to the lobby, navies re-pickable, the loser fires first.
24. Versus AI on Random, Hunter and Admiral each play to completion; Random and Hunter keep a static fleet (as the brief specifies), Admiral (the default) re-fires hit cells to confirm and moves its damaged ships between your shots.
25. Hotseat: a curtain hides both oceans between placement and every turn.
26. `?test=1` shows every case PASS (58 cases).
27. On a phone in portrait: no horizontal scrolling, cells at least 32 px, tabs switch oceans, tap a cell then tap FIRE.
28. No trademarked title, logo or artwork anywhere in the UI.
