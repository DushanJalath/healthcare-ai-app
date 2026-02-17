"""
Fix Foreign Key Cascade Constraints on document_chunks table

This script fixes the foreign key constraints to ensure proper CASCADE behavior
when deleting documents or patients. This prevents "null value in column" errors.

Usage:
    python -m scripts.fix_foreign_key_cascade

Prerequisites:
    - Database connection configured in .env
    - Application not actively deleting documents during migration
"""

import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def fix_foreign_key_constraints():
    """Fix foreign key constraints to have proper CASCADE behavior."""
    
    logger.info("=" * 80)
    logger.info("Starting Foreign Key Cascade Fix Migration")
    logger.info("=" * 80)
    
    try:
        with engine.begin() as connection:
            # Step 1: Check current constraints
            logger.info("\nStep 1: Checking current foreign key constraints...")
            
            result = connection.execute(text("""
                SELECT 
                    tc.constraint_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    rc.delete_rule
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                LEFT JOIN information_schema.referential_constraints AS rc
                    ON tc.constraint_name = rc.constraint_name
                WHERE tc.table_name = 'document_chunks' 
                  AND tc.constraint_type = 'FOREIGN KEY'
                ORDER BY kcu.column_name;
            """))
            
            constraints = result.fetchall()
            if constraints:
                logger.info("Current foreign key constraints:")
                for constraint in constraints:
                    logger.info(f"  - {constraint[0]}: {constraint[1]} -> {constraint[2]} (DELETE: {constraint[3]})")
            else:
                logger.warning("No foreign key constraints found on document_chunks table!")
            
            # Step 2: Drop existing foreign key constraints
            logger.info("\nStep 2: Dropping existing foreign key constraints...")
            
            # Find and drop document_id constraint
            result = connection.execute(text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'document_chunks' 
                  AND constraint_type = 'FOREIGN KEY'
                  AND constraint_name LIKE '%document_id%';
            """))
            doc_constraint = result.fetchone()
            if doc_constraint:
                logger.info(f"  Dropping constraint: {doc_constraint[0]}")
                connection.execute(text(f"""
                    ALTER TABLE document_chunks 
                    DROP CONSTRAINT IF EXISTS {doc_constraint[0]} CASCADE;
                """))
            
            # Find and drop patient_id constraint
            result = connection.execute(text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'document_chunks' 
                  AND constraint_type = 'FOREIGN KEY'
                  AND constraint_name LIKE '%patient_id%';
            """))
            patient_constraint = result.fetchone()
            if patient_constraint:
                logger.info(f"  Dropping constraint: {patient_constraint[0]}")
                connection.execute(text(f"""
                    ALTER TABLE document_chunks 
                    DROP CONSTRAINT IF EXISTS {patient_constraint[0]} CASCADE;
                """))
            
            # Find and drop extraction_id constraint
            result = connection.execute(text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'document_chunks' 
                  AND constraint_type = 'FOREIGN KEY'
                  AND constraint_name LIKE '%extraction_id%';
            """))
            extraction_constraint = result.fetchone()
            if extraction_constraint:
                logger.info(f"  Dropping constraint: {extraction_constraint[0]}")
                connection.execute(text(f"""
                    ALTER TABLE document_chunks 
                    DROP CONSTRAINT IF EXISTS {extraction_constraint[0]} CASCADE;
                """))
            
            logger.info("  All old constraints dropped successfully")
            
            # Step 3: Recreate foreign key constraints with proper CASCADE
            logger.info("\nStep 3: Creating new foreign key constraints with CASCADE behavior...")
            
            # Patient foreign key - CASCADE delete
            logger.info("  Creating patient_id foreign key with ON DELETE CASCADE...")
            connection.execute(text("""
                ALTER TABLE document_chunks 
                ADD CONSTRAINT document_chunks_patient_id_fkey 
                FOREIGN KEY (patient_id) 
                REFERENCES patients(id) 
                ON DELETE CASCADE;
            """))
            
            # Document foreign key - CASCADE delete
            logger.info("  Creating document_id foreign key with ON DELETE CASCADE...")
            connection.execute(text("""
                ALTER TABLE document_chunks 
                ADD CONSTRAINT document_chunks_document_id_fkey 
                FOREIGN KEY (document_id) 
                REFERENCES documents(id) 
                ON DELETE CASCADE;
            """))
            
            # Extraction foreign key - SET NULL
            logger.info("  Creating extraction_id foreign key with ON DELETE SET NULL...")
            connection.execute(text("""
                ALTER TABLE document_chunks 
                ADD CONSTRAINT document_chunks_extraction_id_fkey 
                FOREIGN KEY (extraction_id) 
                REFERENCES extractions(id) 
                ON DELETE SET NULL;
            """))
            
            logger.info("  All new constraints created successfully")
            
            # Step 4: Verify the new constraints
            logger.info("\nStep 4: Verifying new foreign key constraints...")
            
            result = connection.execute(text("""
                SELECT 
                    tc.constraint_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    rc.delete_rule
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                LEFT JOIN information_schema.referential_constraints AS rc
                    ON tc.constraint_name = rc.constraint_name
                WHERE tc.table_name = 'document_chunks' 
                  AND tc.constraint_type = 'FOREIGN KEY'
                ORDER BY kcu.column_name;
            """))
            
            new_constraints = result.fetchall()
            logger.info("New foreign key constraints:")
            for constraint in new_constraints:
                logger.info(f"  ✓ {constraint[0]}: {constraint[1]} -> {constraint[2]} (DELETE: {constraint[3]})")
            
            # Verify CASCADE behavior
            cascade_ok = True
            for constraint in new_constraints:
                if constraint[1] in ['patient_id', 'document_id'] and constraint[3] != 'CASCADE':
                    logger.error(f"  ✗ FAILED: {constraint[1]} should have CASCADE delete, but has {constraint[3]}")
                    cascade_ok = False
                elif constraint[1] == 'extraction_id' and constraint[3] != 'SET NULL':
                    logger.error(f"  ✗ FAILED: extraction_id should have SET NULL, but has {constraint[3]}")
                    cascade_ok = False
            
            if not cascade_ok:
                raise Exception("Constraint verification failed!")
            
            logger.info("\n" + "=" * 80)
            logger.info("✓ Migration completed successfully!")
            logger.info("=" * 80)
            logger.info("\nWhat changed:")
            logger.info("  - document_id foreign key now has ON DELETE CASCADE")
            logger.info("  - patient_id foreign key now has ON DELETE CASCADE")
            logger.info("  - extraction_id foreign key now has ON DELETE SET NULL")
            logger.info("\nResult:")
            logger.info("  When you delete a document, all its chunks will be automatically deleted.")
            logger.info("  This prevents the 'null value in column document_id' error.")
            
            return True
            
    except Exception as e:
        logger.error("\n" + "=" * 80)
        logger.error("✗ Migration FAILED!")
        logger.error("=" * 80)
        logger.error(f"Error: {str(e)}")
        logger.error("\nThe database was not modified (transaction rolled back).")
        return False


if __name__ == "__main__":
    logger.info("Foreign Key Cascade Fix Migration Script")
    logger.info("This will fix the foreign key constraints on document_chunks table\n")
    
    success = fix_foreign_key_constraints()
    
    if success:
        logger.info("\n✓ You can now delete documents without errors!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed. Please check the error messages above.")
        sys.exit(1)
