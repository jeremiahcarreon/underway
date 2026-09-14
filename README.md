# UNDERWAY

A two-player, browser-based naval combat game where the fleets can move. One self-contained `index.html`; the only external dependency is PeerJS from a CDN. Open the file from `file://` or any static host. Append `?test=1` to run the rules-engine self-test suite.

## Rule interpretations (where the brief was silent or ambiguous)

1. **Turn numbering.** One global counter increments at every hand-off (turn 1 = first player's first turn, turn 2 = second player's first turn). Pegs, logs, stats and the replay all use this number.
2. **Firing without maneuvering.** Choosing a target and pressing Fire during the maneuver phase forfeits the maneuver; the explicit "Skip maneuver" button does the same.
3. **Move legality checks destination cells only.** A rotation's swept cells are not checked, and a ship may overlap the cells it is leaving.
4. **Wrecks and CONFIRMED.** Firing on a cell of an already-sunk ship reports CONFIRMED ("still here") with no new damage, because that section was already hit.
5. **Patrol Boat crippling.** Any hit cripples it (threshold 1); a stern hit is attributed to the stern rule, a bow hit to the threshold rule.
6. **Crippling and sinking on the same shot** report SUNK, not "crippled".
7. **Own-ocean pegs.** The defender's ocean shows every enemy shot as a faint peg. This gives the defender exactly the same stale information the attacker holds and never reveals anything new.
8. **Accuracy** counts HIT and SUNK shots; CONFIRMED costs a shot but is not a hit.
9. **MVP ship** ranks by turns survived while damaged, then shots absorbed (hits plus confirmations).
10. **Longest chase** is measured per class from first hit turn to sinking turn.
11. **Coin flip.** The host draws a seed; both clients derive the first player from the same seed and animate the same flip. Rematches skip the flip (loser fires first) and show a banner instead.
12. **Rematch** needs both players to press Rematch; the host then resets the room to the lobby with navies re-pickable.
13. **Surrender** ends the game for both sides via a GAME_OVER message; both still exchange history so the replay works.
14. **Fresh peer session.** If an opponent rejoins with a brand-new session (after Abandon), an in-progress battle cannot continue; both return to the lobby.
15. **Third connection.** The guest peer id is fixed per room, so a third device cannot register it and sees "Room full".
16. **Hotseat cinematic** plays the winner's view once for both players.
17. **Seeded RNG.** Fleet templates, random fleets, AI, and the coin flip use a seeded generator; radio chatter picks use plain randomness because tests never depend on them.

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
24. Versus AI on Random, Hunter and Admiral each play to completion; on Admiral the log shows the AI re-firing a hit cell ("Confirmed"/"Miss") and its damaged ships moving between your shots.
25. Hotseat: a curtain hides both oceans between placement and every turn.
26. `?test=1` shows every case PASS (58 cases).
27. On a phone in portrait: no horizontal scrolling, cells at least 32 px, tabs switch oceans, tap a cell then tap FIRE.
28. No trademarked title, logo or artwork anywhere in the UI.
