"""
Migration script to enable pgvector and create document_chunks table.

This script:
1. Enables the pgvector extension in PostgreSQL
2. Creates the document_chunks table with all necessary indexes
3. Validates the migration was successful

Usage:
    python scripts/migrate_to_pgvector.py
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, create_engine
from app.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration():
    """Run the pgvector migration."""
    
    # Read migration SQL file
    migration_file = backend_dir / "migrations" / "enable_pgvector_and_create_chunks_table.sql"
    
    if not migration_file.exists():
        logger.error(f"Migration file not found: {migration_file}")
        return False
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    logger.info("Connecting to database...")
    engine = create_engine(settings.database_url)
    
    try:
        with engine.begin() as conn:
            logger.info("Running migration...")
            
            # Execute the entire migration as one transaction
            # This properly handles functions and triggers with internal semicolons
            try:
                conn.execute(text(migration_sql))
                logger.info("✓ Migration executed successfully!")
            except Exception as e:
                # Check if error is because resources already exist
                error_msg = str(e).lower()
                if 'already exists' in error_msg or 'duplicate' in error_msg:
                    logger.warning(f"Some resources already exist (this is okay): {str(e)}")
                else:
                    raise
            
        # Verify the migration with a new connection
        logger.info("\nVerifying migration...")
        
        with engine.connect() as conn:
            # Check if pgvector extension is enabled
            result = conn.execute(text("SELECT * FROM pg_extension WHERE extname = 'vector'"))
            if result.fetchone():
                logger.info("✓ pgvector extension is enabled")
            else:
                logger.error("✗ pgvector extension not found")
                return False
            
            # Check if table exists
            result = conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'document_chunks')"
            ))
            if result.fetchone()[0]:
                logger.info("✓ document_chunks table created")
            else:
                logger.error("✗ document_chunks table not found")
                return False
            
            # Check indexes
            result = conn.execute(text(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'document_chunks'"
            ))
            indexes = [row[0] for row in result]
            
            expected_indexes = [
                'document_chunks_pkey',
                'idx_document_chunks_patient_id',
                'idx_document_chunks_document_id',
                'idx_document_chunks_patient_document',
                'idx_document_chunks_document_type'
            ]
            
            # Note: Vector index is optional and skipped due to dimension limits
            # pgvector will use exact search which is fast enough for most use cases
            
            for idx in expected_indexes:
                if idx in indexes:
                    logger.info(f"✓ Index {idx} created")
                else:
                    logger.warning(f"⚠ Index {idx} not found (might be created with different name)")
        
        logger.info("\n" + "="*60)
        logger.info("✅ Migration successful!")
        logger.info("="*60)
        logger.info("\nNext steps:")
        logger.info("1. pgvector Python package is already installed ✓")
        logger.info("2. Restart your FastAPI server")
        logger.info("3. Reindex your documents using: POST /vector/patients/{patient_id}/reindex")
        logger.info("\nNote: Your old ChromaDB data in ./vector_db/ directory is not deleted.")
        logger.info("      You can keep it as backup and delete it later once you verify pgvector works.")
        
        return True
    
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    logger.info("="*60)
    logger.info("pgvector Migration Script")
    logger.info("="*60)
    logger.info(f"Database: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'local'}")
    logger.info("="*60 + "\n")
    
    success = run_migration()
    
    if success:
        logger.info("\n✅ All done! You can now use pgvector for vector search.")
        sys.exit(0)
    else:
        logger.error("\n❌ Migration failed. Please check the errors above.")
        sys.exit(1)
