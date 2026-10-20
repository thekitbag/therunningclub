# Age grading

## Compatibility target

The application reproduces the road calculation used by RunBundle after its
14 August 2025 update. That calculator uses the Alan Jones 2025 male and female
road-running tables. The implementation is frozen and versioned as
`ALAN_JONES_ROAD_2025_RUNBUNDLE_V2`.

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

For a table-native distance:

```text
age standard = open-class standard / age factor
age grade    = age standard / actual time * 100
```

## RunBundle-compatible non-standard distances

RunBundle linearly interpolates every non-standard road distance between the
closest bracketing source-table distances. Both inputs to the calculation are
interpolated independently. Winter 7.5 km and summer 7,966 m are bracketed by
4 miles and 8 km; summer 5,922 m is bracketed by 5 km and 6 km.

```text
lower distance = closest table distance below the race distance
upper distance = closest table distance above the race distance
u = (race distance - lower distance) / (upper distance - lower distance)

open standard = open standard at lower distance * (1 - u)
              + open standard at upper distance * u

age factor = age factor at lower distance * (1 - u)
           + age factor at upper distance * u

age standard = open standard / age factor
age grade    = age standard / actual time * 100
```

For example, RunBundle returns `81.25%` for a 50-year-old female road runner
completing 7.5 km in 30:00. The application calculates the unrounded value as
approximately `81.2513621145%` and displays `81.25%`.

For the measured summer courses, the same runner and time display as `64.01%`
at 5,922 m (3.68 miles) and `86.32%` at 7,966 m (4.95 miles), matching
RunBundle's mile inputs on 20 October 2026.

## Age and precision

Age is the runner's completed age on the round date. Dates of birth and round
dates are calendar dates, so the calculation uses their UTC year, month, and
day components without timezone conversion.

The calculation retains full precision for improvement comparisons and rounds
half up to two decimal places only for display. Rounding a percentage before
ranking improvements would create artificial ties.

## Previous age grades and opening baselines

Each result compares with the runner's most recent earlier published age grade
across the complete result history. The chain crosses Summer/Winter boundaries
and two-/three-lap choices because the age-grade percentage is the normalized
comparison. Draft and chronologically later results never enter the chain.

When the previous result predates the application data, an administrator can
open **Admin → Runners → Import previous age grades** and upload a CSV containing
one opening value per runner. The baseline has a source date and is used only
until a later published result exists. The smallest supported file is:

```csv
Runner name,Previous age grade
"Crocker, Mike",55.97%
```

`First Last` names are also accepted. A `Runner ID` column may replace the name
for an unambiguous export/import workflow. The import validates and matches the
entire file before writing anything, then atomically upserts the baselines and
recalculates every affected season in chronological order.

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
to preview the first affected season, review changes to age grades and
improvement points, and then apply the chronological recalculation cascade. A
season and all its results must use the same age-grade version.

The same command migrates every targeted summer season from the old nominal
6,000 m / 8,000 m values to the measured 5,922 m / 7,966 m courses. The dry run
shows the stored and target distances without writing. Apply each summer season
by slug only after reviewing that preview; distance fields, age grades, points,
and version metadata are then rewritten together.
