# agent-ux: review lenses

*The reviewer's crew reads each pull request through
these lenses. Every finding names its lens and carries evidence: a measurement, a
reproduction through the `__rb` test hooks, or a failing check. A finding without evidence
is a question, not a hand-back.*

These lenses apply to every game. Evidence comes from that game's own test hooks
(`__fg` in Family Knockout, `__ow` in Open Water, `__nd` in Neon Dash, `__rb` in Robot
Battle, `__ww` in Wild World) and its `scripts/*.mjs` checks. A game with its own lenses
file under `docs/<game>/` is read through those lenses too.

- Robot Battle: [`docs/robot-battle/review-lenses.md`](robot-battle/review-lenses.md)

## 1. The player (a child playing on their own)

Checks that a child can play it without help:
- Icons and colour first, words second.
- Targets big enough for a child's thumb; nothing important within reach of an accidental tap.
- Touch screens stay calm: a few contextual buttons on screen, the rest in the pause menu.
- Anything for parents stays behind its hold-to-open, so a child doesn't wander in.

Evidence: a screenshot at each size below, with the target sizes measured in pixels.

## 2. Devices (the ways they actually play)

Checks that every flow works on every input the game supports:
- Phone held sideways: 740×360, 844×390 and 667×375, with no scrolling and every control
  on screen.
- An on-screen controller for touch, and keyboard and gamepad reach everything touch can,
  where the game supports them.
- No console errors, and `./scripts/check-html.sh` passes.

Evidence: element positions measured at each size; a keyboard-only, gamepad-only and
touch-only run through the changed flow.

## 3. Saved progress (a child who has played for weeks)

Checks that an update never costs a child what they've earned:
- A change to storage keys, save format or migration says what an old save becomes.
- An old save loads, and nothing in it is lost or reset.
- Guest play, where a game has it, saves nothing.

Evidence: a save written by the game on `main`, loaded by the changed page, with the state
read through the game's test hooks before and after.

## 4. Family privacy (a careful parent)

Checks that nothing about the children leaves the browser:
- Progress lives in browser storage only. Wild World's two-player server runs on the home
  Mac and nowhere else.
- No names, ages or progress sent to any outside server, log or analytics.
- No child's name, grade or reading level in the game, its tests, scripts, commits, PR body
  or comments (#161).

Evidence: the network requests during a session (none to outside hosts); the storage keys
written; a search of the diff.
