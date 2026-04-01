-- Store profile photo as a base64 data URL directly in the database
-- so it persists across deployments (no ephemeral filesystem dependency)

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
