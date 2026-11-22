# Robot Battle: review lenses

*Draft by Claude for Daniel to edit. The reviewer's crew reads each pull request through
these lenses. Every finding names its lens and carries evidence: a measurement, a
reproduction through the `__rb` test hooks, or a failing check. A finding without evidence
is a question, not a hand-back.*

## 1. Learning science (a researcher in memory and retrieval practice)

Checks that the math teaches, not just tests:
- Time counts thinking: an answer is timed from when the fact was free to answer, not from
  when a plug was picked up.
- Spacing holds: a miss returns within minutes, and Known and Mastered facts come back on the
  spaced schedule (1 day, 3 days, 1 week, 2 weeks).
- Mastery means what it says: under three seconds, right, on three different days.
- Slow answers cost nothing. Fast answers are rewarded; slowness is never punished.
- Only a few New facts are open at a time.

Evidence: read the tracker's state through `__rb.state()` before and after a scripted
session; show the timing of a fact studied for ten seconds before answering.

## 2. The player (an eight- and ten-year-old)

Checks that a child can play it without help:
- Icons and colour first, words second.
- Targets big enough for a child's thumb; nothing important within reach of an accidental tap.
- The math never stalls the fight for long: a repair takes seconds, not a page of reading.
- The parent view stays behind its hold-to-open, so a child doesn't wander in.

Evidence: a screenshot at each size below, with the target sizes measured in pixels.

## 3. Devices (the ways they actually play)

Checks that every flow works on every input:
- Phone held sideways: 740×360, 844×390 and 667×375, with no scrolling and every control
  on screen. (The ✔ key sat off-screen at 740×360 once; this lens exists so that's caught
  every time.)
- Keyboard and gamepad reach everything touch can.
- No console errors, and `./scripts/check-html.sh` passes.

Evidence: element positions measured at each size; a keyboard-only and gamepad-only run
through the changed flow.

## 4. Family privacy (a careful parent)

Checks that nothing about the boys leaves the browser:
- Progress lives in browser storage only. Guest saves nothing.
- No names, ages or progress sent to any server, log or analytics.
- Screens that show a child's name can be left out of a screen recording.

Evidence: the network requests during a session (none to outside hosts); the storage keys
written.
