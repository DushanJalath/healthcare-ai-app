-- Migration: Add multi-clinic patient support
-- This migration adds support for patients to belong to multiple clinics

-- Step 1: Add clinic_type column to clinics table (optional for backward compatibility)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_type VARCHAR(50);

-- Create index for clinic_type
CREATE INDEX IF NOT EXISTS ix_clinics_clinic_type ON clinics(clinic_type);

-- Step 2: Create patient_clinics junction table
CREATE TABLE IF NOT EXISTS patient_clinics (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    clinic_id INTEGER NOT NULL,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    
    -- Foreign keys
    CONSTRAINT fk_patient_clinics_patient 
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_clinics_clinic 
        FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
    
    -- Unique constraint: patient can only be enrolled once per clinic
    CONSTRAINT uq_patient_clinic UNIQUE (patient_id, clinic_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS ix_patient_clinics_patient_id ON patient_clinics(patient_id);
CREATE INDEX IF NOT EXISTS ix_patient_clinics_clinic_id ON patient_clinics(clinic_id);
CREATE INDEX IF NOT EXISTS ix_patient_clinics_is_active ON patient_clinics(is_active);

-- Step 3: Make clinic_id nullable in patients table (for backward compatibility during migration)
-- Note: This allows existing data to work while we migrate to the new structure
ALTER TABLE patients ALTER COLUMN clinic_id DROP NOT NULL;

-- Step 4: Migrate existing patient-clinic relationships to patient_clinics table
-- This inserts a PatientClinic record for each existing patient with a clinic_id
INSERT INTO patient_clinics (patient_id, clinic_id, enrolled_at, is_active)
SELECT id, clinic_id, created_at, TRUE
FROM patients
WHERE clinic_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM patient_clinics 
      WHERE patient_clinics.patient_id = patients.id 
        AND patient_clinics.clinic_id = patients.clinic_id
  )
ON CONFLICT (patient_id, clinic_id) DO NOTHING;

-- Note: After running this migration and verifying everything works,
-- you may want to remove the clinic_id column from patients table in a future migration:
-- ALTER TABLE patients DROP COLUMN IF EXISTS clinic_id;
