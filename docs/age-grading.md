# Age grading

## Compatibility target

The application reproduces the road calculation used by RunBundle after its
14 August 2025 update. That calculator uses the Alan Jones 2025 male and female
road-running tables. The implementation is frozen and versioned as
`ALAN_JONES_ROAD_2025_RUNBUNDLE_V1`.

RunBundle is not called at runtime. Its public form is not an application API,
and either its availability or its calculation can change. The required source
values are vendored in
`src/domain/scoring/age-grade/data/alan-jones-road-2025.ts`, so a published
result remains reproducible offline.

## Sources

The generated module contains open-class standards and single-age factors from
the `Age Facctors` worksheets of:

- `2025 Files/MaleRoadStd2025.xlsx`
- `2025 Files/FemaleRoadStd2025.xlsx`

in <https://github.com/AlanLyttonJones/Age-Grade-Tables>. The source repository
is licensed CC0-1.0. Source SHA-256 hashes are recorded in the generated module.

RunBundle documents its calculation at
<https://runbundle.com/tools/age-grading-calculator> and announced its move to
the 2025 road tables on 14 August 2025 at <https://runbundle.com/news/>.

## Vendored values

For every integer age from 5 through 100 and for both source-table categories,
the application stores the factors needed for:

```text
[5 km, 6 km, 4 miles, 8 km]
```

It also stores the corresponding male and female open-class standards. The
workbooks' `AgeStanSec` values are deliberately not used: those cells are
rounded to whole seconds, while RunBundle calculates an age standard from the
open standard and factor.

For table-native 5 km, 6 km, and 8 km results:

```text
age standard = open-class standard / age factor
age grade    = age standard / actual time * 100
```

## RunBundle-compatible 7.5 km calculation

RunBundle treats 7.5 km as a non-standard road distance and linearly
interpolates between the closest source-table distances: 4 miles and 8 km.
Both inputs to the calculation are interpolated independently.

```text
lower distance = 6,437.376 m
upper distance = 8,000 m
u = (7,500 - lower distance) / (upper distance - lower distance)

open standard = open standard at 4 miles * (1 - u)
              + open standard at 8 km    * u

age factor = age factor at 4 miles * (1 - u)
           + age factor at 8 km    * u

age standard = open standard / age factor
age grade    = age standard / actual time * 100
```

For example, RunBundle returns `81.25%` for a 50-year-old female road runner
completing 7.5 km in 30:00. The application calculates the unrounded value as
approximately `81.2513621145%` and displays `81.25%`.

## Age and precision

Age is the runner's completed age on the round date. Dates of birth and round
dates are calendar dates, so the calculation uses their UTC year, month, and
day components without timezone conversion.

The calculation retains full precision for improvement comparisons and rounds
half up to two decimal places only for display. Rounding a percentage before
ranking improvements would create artificial ties.

A runner younger than 5 or older than 100 cannot be graded. Publication is
blocked with a clear administrator error rather than clamping or inventing a
factor.

## Regenerating the table

Download the two source workbooks, then run:

```bash
npm run gen:age-grade -- /path/to/MaleRoadStd2025.xlsx /path/to/FemaleRoadStd2025.xlsx
```

The generator reads the workbooks with the system `unzip` command, checks that
every age from 5 through 100 is present, and rewrites the generated TypeScript
module. Review the source hashes and generated diff, then run the age-grading
tests. Pass `--stdout` to inspect output without writing the module.

## Changing the compatibility version

A future RunBundle or source-table change is a deliberate product decision and
data migration, not a routine dependency update. Use `scripts/rescore-season.ts`
to preview each affected season, review changes to age grades and improvement
points, and then apply a full-season recalculation. A season and all its results
must use the same age-grade version.
