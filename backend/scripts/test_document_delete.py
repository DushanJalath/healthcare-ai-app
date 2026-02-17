"""
Test Document Deletion After Fix

This script tests that document deletion works correctly after the CASCADE fix.
It will attempt to delete a document and verify no errors occur.

Usage:
    python -m scripts.test_document_delete --document-id <id>
    
Example:
    python -m scripts.test_document_delete --document-id 43
"""

import sys
import argparse
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.database import engine
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def test_document_deletion(document_id: int):
    """Test that a document can be deleted without errors."""
    
    logger.info(f"Testing deletion of document ID: {document_id}")
    
    with Session(engine) as session:
        # Step 1: Check if document exists
        document = session.query(Document).filter(Document.id == document_id).first()
        
        if not document:
            logger.error(f"✗ Document {document_id} not found!")
            return False
        
        logger.info(f"✓ Found document: {document.original_filename}")
        
        # Step 2: Count chunks before deletion
        chunk_count = session.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).count()
        
        logger.info(f"✓ Document has {chunk_count} chunks")
        
        # Step 3: Attempt to delete the document
        try:
            logger.info("Attempting to delete document...")
            session.delete(document)
            session.commit()
            logger.info("✓ Document deleted successfully!")
        except Exception as e:
            logger.error(f"✗ Failed to delete document: {str(e)}")
            session.rollback()
            return False
        
        # Step 4: Verify chunks were also deleted
        remaining_chunks = session.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).count()
        
        if remaining_chunks > 0:
            logger.warning(f"⚠ Warning: {remaining_chunks} chunks still exist!")
            logger.warning("  The CASCADE delete may not be working correctly.")
            return False
        else:
            logger.info(f"✓ All {chunk_count} chunks were automatically deleted")
        
        logger.info("\n" + "=" * 80)
        logger.info("✓ TEST PASSED - Document deletion works correctly!")
        logger.info("=" * 80)
        return True


def main():
    parser = argparse.ArgumentParser(description='Test document deletion after CASCADE fix')
    parser.add_argument('--document-id', type=int, required=True, 
                       help='ID of the document to delete (for testing)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Check document without actually deleting it')
    
    args = parser.parse_args()
    
    if args.dry_run:
        logger.info("DRY RUN MODE - Will not actually delete the document")
        with Session(engine) as session:
            document = session.query(Document).filter(Document.id == args.document_id).first()
            if document:
                chunk_count = session.query(DocumentChunk).filter(
                    DocumentChunk.document_id == args.document_id
                ).count()
                logger.info(f"✓ Document {args.document_id} exists: {document.original_filename}")
                logger.info(f"✓ Has {chunk_count} chunks")
                logger.info("\nTo actually test deletion, run without --dry-run flag")
            else:
                logger.error(f"✗ Document {args.document_id} not found")
        return
    
    # Run the test
    success = test_document_deletion(args.document_id)
    
    if success:
        logger.info("\n✓ The CASCADE fix is working correctly!")
        sys.exit(0)
    else:
        logger.error("\n✗ There may still be an issue with CASCADE deletes.")
        logger.error("  Please check the error messages above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
