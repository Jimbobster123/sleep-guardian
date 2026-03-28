-- Allow omitting time-to-fall-asleep until the user chooses to answer.
ALTER TABLE "DailySleepLog" ALTER COLUMN latency_minutes DROP NOT NULL;
