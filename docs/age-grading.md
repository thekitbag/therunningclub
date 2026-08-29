# Age grading

## What is used

The application uses the **WMA / USATF 2015 road-running age standards**,
vendored into the repository at
`src/domain/scoring/age-grade/data/wma-road-2015.ts` and versioned as
`WMA_ROAD_2015_RMPAC_V1`.

That edition is chosen because it was approved by both WMA and USATF, covers the
road distances the club races, and publishes a standard for every single year of
age rather than five-year bands.

No external calculator is called at runtime. The standards are a static table in
the bundle, so results are reproducible offline and cannot change because a
third-party site changed.

## Source

Extracted from the `AgeStdSec` worksheet of:

- `2015 Files/MaleRoadStd2015.xlsx`
- `2015 Files/FemaleRoadStd2015.xlsx`

in <https://github.com/AlanLyttonJones/Age-Grade-Tables>, which is the
distribution channel the scoring specification points at.

Methodology background:

- <https://world-masters-athletics.org/wp-content/uploads/2018/02/Road_Age_Standards_WMA_2010-Explanation.pdf>
- <https://www.howardgrubb.co.uk/athletics/wmaroad15.html>

## What is stored

Only the four distances the club needs, in whole seconds, for ages 5–100:

```
[ 5 km, 6 km, 8 km, 10 km ]
```

5 km, 6 km and 8 km are table-native and used directly. 10 km is retained solely
so the winter three-lap distance of 7.5 km can be interpolated.

## The 7.5 km interpolation

7.5 km is not a table distance. The standard is interpolated between the 5 km
and 10 km standards on a **logarithmic** distance scale, which reflects how race
pace decays with distance far better than a linear blend:

```
u         = (ln 7500 − ln 5000) / (ln 10000 − ln 5000)
standard  = standard₅ₖ × (1 − u) + standard₁₀ₖ × u
```

## Calculation

1. Age in completed years on the round date.
2. Look up the standard for that category, age and distance.
3. `ageGradePercent = standardSeconds / actualSeconds × 100`.

Full precision is kept for ranking; only the display is rounded, to two decimal
places. Rounding before ranking would create artificial ties in the improvement
order — the reference round has two improvements one hundredth of a point apart.

## Ages outside the table

A runner younger than 5 or older than 100 cannot be graded. Publication of that
round is **blocked with a clear administrator error** rather than inventing a
factor. The dashboard surfaces the problem before the publish button is pressed.

## Regenerating the table

The vendored file is generated, not hand-edited — correcting a value by hand
would silently desynchronise it from the published source.

To regenerate, download the two workbooks above and extract the `AgeStdSec`
worksheet columns for 5 km, 6 km, 8 km and 10 km, ages 5–100, into the same
structure. The tests in `src/domain/scoring/__tests__/age-grade.test.ts` pin the
result: they assert completeness for every age, spot values sampled directly
from the source, monotonicity with distance, and monotonicity with age through
the masters range.

## Changing edition

Adopting the 2020 or 2025 standards is a **deliberate product decision and a
data migration**, not a dependency bump. Every published age grade and every
improvement point derived from it would change. The version identifier stored on
each result exists so that history can be interpreted correctly if that ever
happens.
