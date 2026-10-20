CREATE TABLE "tt_age_grade_baseline" (
    "id" UUID NOT NULL,
    "runnerId" UUID NOT NULL,
    "ageGradePercent" DECIMAL(8,5) NOT NULL,
    "recordedOn" DATE NOT NULL,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tt_age_grade_baseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tt_age_grade_baseline_runnerId_key"
ON "tt_age_grade_baseline"("runnerId");

CREATE INDEX "tt_age_grade_baseline_recordedOn_idx"
ON "tt_age_grade_baseline"("recordedOn");

ALTER TABLE "tt_age_grade_baseline"
ADD CONSTRAINT "tt_age_grade_baseline_runnerId_fkey"
FOREIGN KEY ("runnerId") REFERENCES "runner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
