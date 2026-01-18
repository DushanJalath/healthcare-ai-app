-- Migration: Add clinic_id column to users table
-- This migration adds the clinic_id foreign key column to link users to clinics

-- Add clinic_id column (nullable initially to allow existing records)
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id INTEGER;

-- Add foreign key constraint
ALTER TABLE users 
ADD CONSTRAINT fk_users_clinic_id 
FOREIGN KEY (clinic_id) REFERENCES clinics(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS ix_users_clinic_id ON users(clinic_id);

-- Optional: Update existing clinic_admin users to set their clinic_id
-- Uncomment and run this if you want to set clinic_id for existing clinic_admin users
-- UPDATE users u
-- SET clinic_id = c.id
-- FROM clinics c
-- WHERE u.role = 'clinic_admin' 
--   AND c.admin_user_id = u.id
--   AND u.clinic_id IS NULL;
