# agent-ux

Single-file browser games and scenes. Each one is a self-contained HTML page: open it in a browser and play.

| File | What it is |
| --- | --- |
| `family-knockout.html` | **Family Knockout**, a fan-made party game in the style of Fall Guys. 1 player, or 2 players split-screen, against AI beans. |
| `cowboy-duel.html` | **Quick Draw**, a pixel-art cowboy duel. |
| `ocean.html` | **Open Water**, a sailing and fishing game on a realistic 3D ocean. |
| `ocean-scene-v1.html` | The earlier ocean scenery, with no gameplay. |

## Running

Open a file directly in Chrome, or serve the folder:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/family-knockout.html
```

The 3D pages load [three.js](https://threejs.org/) from the jsDelivr CDN and fonts from Google Fonts, so they need an internet connection.

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
