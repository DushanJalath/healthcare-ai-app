-- Migration: Fix Foreign Key Cascade Constraints on document_chunks table
-- Description: This migration ensures that foreign key constraints have proper CASCADE behavior
--              to prevent "null value in column" errors when deleting documents or patients.
-- 
-- Issue: When deleting a document, SQLAlchemy was trying to set document_id to NULL
--        instead of cascading the delete, which violated the NOT NULL constraint.
--
-- To run this migration:
-- psql -h your_host -U your_username -d your_database -f migrations/fix_foreign_key_cascade.sql

-- Step 1: Drop existing foreign key constraints if they exist
-- (This is safe because we're recreating them immediately with proper CASCADE)

DO $$ 
BEGIN
    -- Drop document_id foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name LIKE 'document_chunks_document_id_fkey%' 
        AND table_name = 'document_chunks'
    ) THEN
        ALTER TABLE document_chunks 
        DROP CONSTRAINT IF EXISTS document_chunks_document_id_fkey CASCADE;
    END IF;

    -- Drop patient_id foreign key constraint if it exists  
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name LIKE 'document_chunks_patient_id_fkey%' 
        AND table_name = 'document_chunks'
    ) THEN
        ALTER TABLE document_chunks 
        DROP CONSTRAINT IF EXISTS document_chunks_patient_id_fkey CASCADE;
    END IF;

    -- Drop extraction_id foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name LIKE 'document_chunks_extraction_id_fkey%' 
        AND table_name = 'document_chunks'
    ) THEN
        ALTER TABLE document_chunks 
        DROP CONSTRAINT IF EXISTS document_chunks_extraction_id_fkey CASCADE;
    END IF;
END $$;

-- Step 2: Recreate foreign key constraints with proper CASCADE behavior

-- Patient foreign key - CASCADE delete (when patient is deleted, delete all their chunks)
ALTER TABLE document_chunks 
ADD CONSTRAINT document_chunks_patient_id_fkey 
FOREIGN KEY (patient_id) 
REFERENCES patients(id) 
ON DELETE CASCADE;

-- Document foreign key - CASCADE delete (when document is deleted, delete all its chunks)
ALTER TABLE document_chunks 
ADD CONSTRAINT document_chunks_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES documents(id) 
ON DELETE CASCADE;

-- Extraction foreign key - SET NULL (when extraction is deleted, keep chunks but clear reference)
ALTER TABLE document_chunks 
ADD CONSTRAINT document_chunks_extraction_id_fkey 
FOREIGN KEY (extraction_id) 
REFERENCES extractions(id) 
ON DELETE SET NULL;

-- Step 3: Verify the constraints
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'document_chunks' 
  AND tc.constraint_type = 'FOREIGN KEY';

-- Migration complete!
-- The foreign key constraints now properly cascade deletes.
-- When a document is deleted, all its chunks will be automatically deleted by the database.
