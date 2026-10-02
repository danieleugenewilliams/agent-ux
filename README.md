# agent-ux

Single-file browser games and scenes. Each one is a self-contained HTML page: open it in a browser and play.

| File | What it is |
| --- | --- |
| `family-knockout.html` | **Family Knockout**, a fan-made party game in the style of Fall Guys. 1 player, or 2 players split-screen, against AI beans. |
| `cowboy-duel.html` | **Quick Draw**, a pixel-art cowboy duel. |
| `ocean.html` | **Open Water**, a sailing and fishing game on a realistic 3D ocean. |
| `ocean-scene-v1.html` | The earlier ocean scenery, with no gameplay. |
| `neon-dash.html` | **Neon Dash**, a 2.5D rhythm runner built from Orion and Apollo's Geometry Dash clone. 1 player, or a 2-player split-screen race. |

## Running

Open a file directly in Chrome, or serve the folder:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/family-knockout.html
```

The 3D pages load [three.js](https://threejs.org/) from the jsDelivr CDN and fonts from Google Fonts, so they need an internet connection.

## Checking

```sh
./scripts/check-html.sh            # every .html in the repo root
./scripts/check-html.sh ocean.html # or just the files you name
```

It runs `node --check` over each page's inline `<script>` blocks and exits non-zero on a syntax error. It does not catch runtime errors or a broken CDN import, so still open the page after a change.

## Family Knockout

A show of 12, 20 or 30 beans plays through race and survival rounds to a final, and the last bean standing wins the crown.

- **Rounds:** Door Dash, Hit Parade (race); Jump Club, Block Party (survival); Hex-A-Gone (final).
- **Show flow:** lobby, bean customiser, matchmaking, round roulette, level flyover, 3-2-1-GO, qualified/eliminated banners, results, then the winner.
- **Settings:** bot skill (Easy / Normal / Hard), plus spectating after you're eliminated.

**Controls**

| | Move | Jump | Dive | Grab | Camera |
| --- | --- | --- | --- | --- | --- |
| Player 1 | WASD | Space | F | G / Left Shift | Q / E, or mouse in solo |
| Player 2 | Arrows | `/` or Enter | `.` | `,` / Right Shift | `;` / `'` |
| Gamepad | Left stick | A | X / B | RT | Right stick |

Esc / Start pauses, and M toggles the music.

Everything is built in code: the characters, levels and synthesized audio. No assets from the original game are included. *Fall Guys* is a trademark of Epic Games / Mediatonic. This is an unofficial, non-commercial fan project with no affiliation or endorsement.

## Open Water (ocean.html)

You skipper an 11 m sloop on the open Atlantic off the Outer Banks. You sail to where the fish are, stop the boat, and fish for them with rod and reel. A controls card opens on first launch, and you can bring it back any time with `?`.

**Conditions:** a panel lets you set the time of day, the sea state (calm to gale) and the weather (sunny, rain or storm). The sky, light, waves, foam and fog all follow these settings. Storms bring lightning, and there's a moon and stars at night.

**Sailing**

- Boat speed depends on your angle to the wind. You can't sail within about 40° of it: the sails luff and you stop ("in irons"). A beam reach is fastest.
- Trim the mainsheet yourself or leave auto-trim on. The boat heels in a breeze, the sails swing across when you tack or gybe, and you get a warning when you're carrying too much sail.
- Dropping the sails is how you stop: the boat coasts to a drift.
- On-screen instruments show heading, speed, wind and a trim gauge. A fish finder shows the bottom and any fish below the boat.
- A spotter hint gives the bearing to the nearest birds working the water ("Birds working off the port bow, 800 m"). Birds diving and splashes at the surface mean feeding fish.

**Fishing** (only when the boat is drifting at under 2 knots)

- **Tackle:** a casting spoon (needs retrieving), a bucktail jig (let it sink, then jig it) or live bait under a float (watch for nibbles, then wait for the float to go under).
- **Cast:** hold to wind up the cast and release to throw. Lures sink in real time, and bites depend on species, depth, how the lure is moving, time of day (dawn and dusk are best) and weather.
- **Strike:** when a fish takes, you have a moment to set the hook.
- **Fight:** reel against the drag. Too much drag snaps the 20 lb line, slack line lets the fish throw the hook, and big fish can take all your line. Mahi jump.
- **Land:** net or gaff the tired fish alongside. It ends up lying on deck, with a card showing its weight and length, and you choose to keep or release it. A catch log is saved in your browser.
- **Species:** Spanish and king mackerel, bluefish, false albacore, mahi-mahi, yellowfin tuna, cobia and red drum. The fish are public-domain photographs (US FDA, NOAA, Smithsonian, via Wikimedia Commons).

**Controls**

| Sailing | | Fishing | |
| --- | --- | --- | --- |
| A / D | Steer | F | Pick up / stow the rod |
| W / S | Sheet in / ease | Hold Space | Wind up a cast, release to throw |
| T | Auto-trim on / off | Space | Strike · net the fish |
| Space | Hoist / drop sails | Hold E or right mouse | Reel in |
| C | Chase / cockpit camera | Scroll or `[` `]` | Drag setting |
| Drag · scroll | Look around · zoom | 1 / 2 / 3 | Spoon / jig / live bait |

L opens the catch log, M toggles sound and H hides the conditions panel. Sound is generated in the browser and starts on your first key press. It's keyboard and mouse only, with no touch controls.

## Neon Dash (neon-dash.html)

Orion and Apollo designed this game in their "Coding with Dad" class, starting from their own Canvas2D Geometry Dash clone. Neon Dash keeps all of their ideas and rebuilds them with glowing 3D graphics and music that drives the level.

**The four modes, each with its own world and music**

| Mode | Portal | World | How it plays |
| --- | --- | --- | --- |
| Cube | blue | Neon City | Tap or hold to jump. A jump lasts exactly one beat. |
| Ship | pink | Outer Space | Hold to fly up and let go to drop. |
| Up/Down | green | Crystal Cave | Tap to flip between the floor and the ceiling. |
| Spider | red | The Web | Tap to teleport straight to the other side. |

**Music drives the level.** Everything is laid out on a beat grid at 130 BPM: four blocks of running is one beat. If you jump on the kick drum, you land on the next one. Each world plays its own part of the song, and walking through a portal switches the world and the music together.

**Modes**

- **Levels:** First Steps (easy), Lift Off, Crystal Flip, and Spider's Web (hard). Each has three hidden coins.
  - The game tracks your best %, how many attempts you've made, and keeps a ghost of your best run to race against.
- **Practice:** a checkpoint drops every couple of bars once you've made it safely past. Press Z to place your own checkpoint and X to remove the last one.
- **Endless:** the original game's mode. It keeps going through every world.
  - The orange orb gives you a shield for 10 seconds.
  - The green orb gives you a super shield for 8 seconds and doubles your points.
  - The high-score board starts with OMW's scores from the original game.
- **2P race:** split-screen on one keyboard. If you crash, you go back to your last checkpoint, and the first player to the finish wins. The music follows the race clock, so a player who falls behind after a crash is slightly off the beat until the race ends.
- **Icon:** pick colours, a face and a trail for each player.

**Controls**

| | Jump / fly / flip / teleport |
| --- | --- |
| Solo | Space, W, ↑, click or tap |
| 2P race | Player 1: W or Space · Player 2: ↑ or Enter · gamepads 1 and 2 |

On the menu, use ← → to pick a level and Enter to play. During a game, Esc or P pauses, R restarts and M toggles the music.

**How it's built.** The physics runs at a fixed 240 steps a second, so it plays the same on any screen. A built-in solver runs that same physics to prove every level can be beaten, and it measures how much timing leeway each jump gets. That solver also plays the demo behind the menu.

For tests, `window.__nd` exposes `start`, `step`, `frames`, `autoplay` and `solve`.

*Geometry Dash* is a trademark of RobTop Games. Neon Dash is an unofficial, non-commercial fan project with no affiliation or endorsement, and it uses no assets from the original game.
