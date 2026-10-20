# Time-trial scoring, 2026

What `RMPAC_SCORING_V5` implements, where it came from, and the remaining open
point. V5 retains the V4 points ladders and measured courses documented below,
and carries each runner's last published age grade across lap choices and season
boundaries. V4 retained the V3 points ladders and made the
club-measured summer courses authoritative: 3.68 miles (5,922 m) for two laps
and 4.95 miles (7,966 m) for three. Written after the committee supplied
`2026 Summer Time Trial.xlsx` in September 2026 and confirmed the course
distances in October 2026.

## The rules

**Finishing points.** Within each distance, rank finishers by actual elapsed
time. The ladder is sized by the **larger of the two distance fields** in that
round:

```
points = M + 1 − position        M = max(two-lap finishers, three-lap finishers)
```

Both distances score off that one ladder, so a small three-lap field is not
penalised for being small — its winner scores the same as the two-lap winner.
Nobody who finishes scores zero.

**Improvement points.** A runner compares with their most recent earlier
published age grade across the complete app-managed history, regardless of
season or lap choice. A dated opening baseline imported from the club's older
records seeds the comparison when the app does not hold that previous result.
Pool every runner in the round, across both distances
and both categories. Let `C` be the number who had a **comparable earlier
result** — including those whose age grade went _down_. Rank the runners whose
age grade improved, largest improvement first:

```
points = C + 1 − position
```

Only a positive improvement scores. Standing still is not improving.

**Season standing.** Best four round totals, unchanged.

## Evidence

Checked by replaying `scoreRound` over all six 2026 summer rounds and comparing
with the workbook's own numbers:

| Round     | 2 lap | 3 lap | M      | Winner |
| --------- | ----- | ----- | ------ | ------ |
| April     | 7     | 5     | 7      | 7      |
| May       | 11    | 6     | 11     | 11     |
| June      | 5     | 6     | **6**  | 6      |
| July      | 9     | 5     | 9      | 9      |
| August    | 13    | 4     | **13** | 13     |
| September | 8     | 2     | 8      | 8      |

**80 of 81 finishing scores reproduce exactly.** June is the round that proves
`M` is the maximum rather than the two-lap count: the three-lap field was the
bigger one, and both ladders topped out at 6.

Improvement points match 23 of 29. The six misses are both explainable as
spreadsheet slips rather than rule differences:

- **June** — the bottom three improvers hold the right _set_ of points {3, 4, 5}
  against the wrong three people.
- **July** — all three improvers are exactly one low, as though `C` were 13 and
  not 14. The likely uncounted runner is the one whose difference reads −56.41;
  the workbook carries a note that some April "last AG" values were wrongly
  recorded as 100.

## Open question 1: dead heats

This is the single finishing score that does not reproduce.

`ranking.ts` uses competition ranking — a tie consumes both places and the next
runner skips one. The published winter round of 24 March 2026
(`references/winter-tt-2025-26.pdf`) does exactly that: a tie at fifth scores
**6, 6, 4**.

The summer workbook's only tie is scored differently. August three-lap:

|         | time  | sheet  | competition ranking |
| ------- | ----- | ------ | ------------------- |
| White   | 42:33 | 13     | 13                  |
| Lewis   | 43:13 | 12     | 12                  |
| Packer  | 43:13 | 12     | 12                  |
| Chester | 44:00 | **11** | **10**              |

We follow the published winter sheet, because it is a committee-published
document and the summer workbook has demonstrable slips elsewhere. **If the
committee confirms the workbook is right, the fix is to step points down per
distinct time instead of per position in `scoreRound`.**

## Earlier-result lookup

The workbook's `XLOOKUP` reaches only the **immediately preceding month** in its
local monthly tables. Review of prior seasons confirmed that the club carries
the runner's “Last AG” across seasons. The application uses the most recent
earlier published value it holds, so missing a month, changing lap choice or
crossing a season boundary does not discard a valid comparison.

## The winter sheet no longer matches

Scoring changed between winter 2025/26 and summer 2026. The winter round of
24 March 2026 awards a **fixed 10** to each distance winner (nine two-lap
finishers, and the winner still scores 10) and sizes improvement points by the
**number of improvers** (ten improvers, top scores 10).

Both ladders were widened for summer 2026. `references/README.md` still calls
the winter document the authoritative scoring example; that is now only true of
its tie handling. The golden-round test keeps the published winter values
alongside the current ones so the change stays visible.
