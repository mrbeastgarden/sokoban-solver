# sokoban-solver — make.fun entry

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/mrbeastgarden/sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/mrbeastgarden/sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

This repository is the entry for the make.fun bounty
[Build the best Sokoban solver, 21 November 2026](https://make.fun/bounty/sokoban-solver-01-run-20261121)
(`sokoban-solver-01-run-20261121`).

## What it does

`main.ts` solves every Sokoban level of a set in one run, in as few pushes
as possible. The levels are generated with a hallway and one to four rooms
off it, and a box pushed through a door can never come back — so the rooms
are independent and a level's push-optimal count is the sum of its rooms'
optima. The solver cuts the hallway's dead squares out of the floor to find
the rooms, then runs a breadth-first search over pushes inside each room
(state = sorted box squares + lowest square of the player's reachable
region), pruning dead squares and frozen 2x2 blocks. BFS by pushes means
the first solved state is push-optimal. No clock: the only cutoff is a
250,000-state cap per room, so two runs write byte-identical solutions.

## Local verification

Verified with the kit's own grader (`grade-local`, two executions,
byte-identical): on the practice set the entry scores **1,000,000** — all 5
instances at their push-optimal counts (13/16/29/47/60 pushes), checks
5000/5000 — against 200,000 for the house baseline plain-astar. The same
1,000,000 holds on four freshly drawn sets (25/25 instances at P*), each
run taking 6–11 s of the 60-second wall budget.

Run it the way the grader does:

    mkdir -p out && MAKEFUN_INPUT_DIR=<practice/input> MAKEFUN_OUTPUT_DIR=out node main.ts

Node 22, standard library only, no network, deterministic.

## Files

- `main.ts` — the solver and the driver the harness runs: reads every
  `<id>/level.txt` from `/input`, writes `<id>/solution.txt` to `/output`.
