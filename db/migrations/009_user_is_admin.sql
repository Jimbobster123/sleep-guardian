-- User admin flag
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
