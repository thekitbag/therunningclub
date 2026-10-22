# Time-trial scoring, 2026

What `RMPAC_SCORING_V7` implements, where it came from, and the remaining open
point. V7 snapshots the points method on each season so Winter 2026/27 can use
an improvement-only leaderboard without rewriting Summer 2026. V6 restored the
authoritative improvement rule after a live result
exposed the earlier spreadsheet interpretation: only positive improvers
determine the ladder's size. V5 carries each runner's last published age grade
across lap choices and season boundaries. V4 made the club-measured summer
courses authoritative: 3.68 miles (5,922 m) for two laps and 4.95 miles (7,966
m) for three. The committee supplied `2026 Summer Time Trial.xlsx` in September
2026 and confirmed the course distances in October 2026. The improvement-rule
correction was recorded on 22 October 2026.

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
Pool every positive improver in the round, across both distances and both
categories. Let `N` be the number whose age grade **strictly improved**. Rank
those runners by the size of their improvement, largest first:

```
points = N + 1 − position
```

Standing still or going backwards neither scores nor increases another
runner's points.

**Season standing.** Best four round totals, unchanged.

**Season points method.** Summer 2026 keeps combined finishing and improvement
points. Winter 2026/27 awards improvement points only: finish position and time
remain visible, but finishing points are zero and the round total equals the
improvement points. The best four round scores still count. The method is
stored on the season, never inferred from its type or dates, and becomes fixed
when its first round is published.

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

The workbook was initially interpreted as sizing improvement points from every
runner with a comparable age grade. That inference produced 23 of its 29
improvement scores, with the remaining six attributable to spreadsheet slips:

- **June** — the bottom three improvers hold the right _set_ of points {3, 4, 5}
  against the wrong three people.
- **July** — all three improvers are exactly one low, as though `C` were 13 and
  not 14. The likely uncounted runner is the one whose difference reads −56.41;
  the workbook carries a note that some April "last AG" values were wrongly
  recorded as 100.

The authoritative scoring specification supersedes that inference:
non-improvers must not widen the ladder. The winter 2025/26 sheet demonstrates
the rule directly, with ten positive improvers receiving ten points down to
one.

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

## Historical source differences

Finishing scoring changed between winter 2025/26 and summer 2026. The winter
round of 24 March 2026 awards a **fixed 10** to each distance winner (nine
two-lap finishers, and the winner still scores 10). Its improvement points,
however, use the current clarified rule: ten improvers, with the top score 10.

The finishing ladder was widened for summer 2026. The golden-round test keeps
the published winter finishing values alongside the current ones so that
change stays visible, while asserting the published improvement pattern.
