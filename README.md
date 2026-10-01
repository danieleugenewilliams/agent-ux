# agent-ux

Single-file browser games and scenes. Each one is a self-contained HTML page: open it in a browser and play.

| File | What it is |
| --- | --- |
| `fall-guys.html` | **Fall Guys: Family Knockout**, a fan-made, Fall Guys–style party game. 1 player, or 2 players split-screen, against AI beans. |
| `cowboy-duel.html` | **Quick Draw**, a pixel-art cowboy duel. |
| `ocean.html` | A 3D ocean scene with fish. |
| `ocean-scene-v1.html` | An earlier version of the ocean scene. |

## Running

Open a file directly in Chrome, or serve the folder:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/fall-guys.html
```

The 3D pages load [three.js](https://threejs.org/) from the jsDelivr CDN and fonts from Google Fonts, so they need an internet connection.

## Fall Guys: Family Knockout

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
