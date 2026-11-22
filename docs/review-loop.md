# Review loop: agent-ux

This repo runs the loop-team review loop. The roles, labels, verdicts and merge gate are in
loop-team's [`contract.md`](https://github.com/danieleugenewilliams/loop-team/blob/main/contract.md).
Settings are in `.claude/loop.json`. This file holds only this repo's own rules.

## Reviewer triggers

The reviewer posts its verdict as usual and adds `needs-human` on top when a PR does either
of these:

- **A child's name, grade or reading level.** It appears anywhere the PR puts it: a game, a
  test, a script, a commit message, the PR body or a comment. This is Mom's rule (#161).
  Players make their own profiles in the game. When a name has to be removed from a
  published file, it must be removed for good, never split or char-coded to get past a grep.
- **Saved progress at risk.** The PR changes how a game saves or loads (its storage keys,
  save format or migration) in a way that could wipe or corrupt progress the boys have
  already saved. The review says what an old save turns into after the change.

## Repo notes

- `main` is live. GitHub Pages serves the games from `main`, so a merge is published within
  minutes. The `pages-build-deployment` run after a merge is expected.
- The test command, `./scripts/check-html.sh`, only checks the syntax of each page's inline
  scripts. Behaviour is checked with the `scripts/*.mjs` checks and the games' test hooks,
  and a review says which of these it ran.
