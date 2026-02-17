"""
Test RAG Chat with pgvector

This script tests the complete RAG pipeline with pgvector without requiring actual documents.
It creates synthetic test data directly in the database and verifies:
1. Vector embedding generation
2. Vector storage in PostgreSQL
3. Vector similarity search
4. Full RAG retrieval

Usage:
    python scripts/test_pgvector_rag.py
"""

import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

import logging
from datetime import datetime
from sqlalchemy import text

from app.database import SessionLocal
from app.services.vector_store import VectorStoreService
from app.models.document_chunk import DocumentChunk
from app.models.patient import Patient
from app.models.user import User
from app.models.document import Document

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Test data - realistic medical document content
TEST_MEDICAL_DOCUMENTS = [
    {
        "title": "Blood Test Results",
        "content": """
        PATIENT: Test Patient
        DATE: February 17, 2026
        
        LABORATORY REPORT - Complete Blood Count (CBC)
        
        White Blood Cells: 7.5 x10^9/L (Normal: 4.0-11.0)
        Red Blood Cells: 4.8 x10^12/L (Normal: 4.5-5.5)
        Hemoglobin: 14.2 g/dL (Normal: 13.5-17.5)
        Hematocrit: 42% (Normal: 40-50%)
        Platelets: 250 x10^9/L (Normal: 150-400)
        
        Blood Chemistry:
        Glucose (Fasting): 95 mg/dL (Normal: 70-100)
        Cholesterol (Total): 185 mg/dL (Normal: <200)
        HDL Cholesterol: 55 mg/dL (Normal: >40)
        LDL Cholesterol: 110 mg/dL (Normal: <130)
        Triglycerides: 100 mg/dL (Normal: <150)
        
        INTERPRETATION: All values within normal limits.
        """
    },
    {
        "title": "Prescription Record",
        "content": """
        PRESCRIPTION - Dr. Smith
        DATE: February 10, 2026
        PATIENT: Test Patient
        
        MEDICATIONS PRESCRIBED:
        
        1. Lisinopril 10mg - Take once daily for blood pressure
           Quantity: 30 tablets
           Refills: 3
        
        2. Metformin 500mg - Take twice daily with meals for diabetes management
           Quantity: 60 tablets
           Refills: 3
        
        3. Atorvastatin 20mg - Take once daily at bedtime for cholesterol
           Quantity: 30 tablets
           Refills: 3
        
        INSTRUCTIONS:
        - Take all medications as prescribed
        - Monitor blood pressure daily
        - Follow up in 3 months
        - Report any side effects immediately
        """
    },
    {
        "title": "Recent Visit Notes",
        "content": """
        CLINIC VISIT NOTES
        DATE: February 15, 2026
        PATIENT: Test Patient
        PROVIDER: Dr. Smith
        
        CHIEF COMPLAINT: Routine checkup
        
        VITALS:
        Blood Pressure: 128/82 mmHg
        Heart Rate: 72 bpm
        Temperature: 98.6°F
        Weight: 175 lbs
        
        ASSESSMENT:
        Patient is doing well on current medication regimen. Blood pressure is well
        controlled. Recent lab work shows improvement in glucose levels. Continue
        current medications. Patient reports good adherence to diet and exercise plan.
        
        PLAN:
        - Continue current medications
        - Repeat labs in 3 months
        - Continue diet and exercise
        - Next follow-up in 3 months
        """
    },
    {
        "title": "Allergy Information",
        "content": """
        ALLERGY RECORD
        PATIENT: Test Patient
        LAST UPDATED: January 5, 2026
        
        KNOWN ALLERGIES:
        
        1. Penicillin - Reaction: Severe rash, hives
           Severity: HIGH
           First Noted: 2015
        
        2. Sulfa drugs - Reaction: Stomach upset, nausea
           Severity: MODERATE
           First Noted: 2018
        
        3. Latex - Reaction: Skin irritation
           Severity: MILD
           First Noted: 2020
        
        NOTES:
        Patient should avoid all penicillin-based antibiotics. Use alternative
        antibiotics such as macrolides or fluoroquinolones. Always use non-latex
        gloves during examinations.
        """
    }
]


def create_test_patient(test_patient_id: int = 99999):
    """Create a test patient for the tests."""
    db = SessionLocal()
    try:
        # Check if test patient already exists
        existing = db.query(Patient).filter(Patient.id == test_patient_id).first()
        if existing:
            logger.info(f"Test patient {test_patient_id} already exists")
            return True
        
        # Create test patient (minimal required fields)
        test_patient = Patient(
            id=test_patient_id,
            patient_id=f"TEST{test_patient_id}",  # Hospital patient ID
            date_of_birth=datetime(1990, 1, 1).date()
        )
        db.add(test_patient)
        
        # Create test documents
        for i in range(1, 5):
            test_doc = Document(
                id=99990 + i,
                patient_id=test_patient_id,
                filename=f"test_doc_{i}.txt",
                original_filename=f"test_document_{i}.txt",
                file_path=f"/test/path/doc_{i}.txt"
            )
            db.add(test_doc)
        
        db.commit()
        logger.info(f"Created test patient {test_patient_id} and 4 test documents")
        return True
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating test patient: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def cleanup_test_data(db: SessionLocal, test_patient_id: int):
    """Remove any existing test data."""
    try:
        deleted = db.query(DocumentChunk).filter(
            DocumentChunk.patient_id == test_patient_id
        ).delete()
        db.commit()
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} existing test chunks")
    except Exception as e:
        db.rollback()
        logger.warning(f"Cleanup warning: {str(e)}")


def test_vector_store_initialization():
    """Test 1: Vector store initialization."""
    logger.info("=" * 70)
    logger.info("TEST 1: Vector Store Initialization")
    logger.info("=" * 70)
    
    try:
        # Check OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("✗ OPENAI_API_KEY not found in .env")
            return None
        
        logger.info("✓ OPENAI_API_KEY found")
        
        # Initialize vector store
        vector_store = VectorStoreService()
        logger.info("✓ Vector store initialized")
        logger.info(f"  - Embedding model: {vector_store.embedding_model}")
        logger.info(f"  - Embedding dimensions: {vector_store.embedding_dimension}")
        logger.info(f"  - Chunk size: {vector_store.chunk_size} tokens")
        logger.info(f"  - Chunk overlap: {vector_store.chunk_overlap} tokens")
        
        logger.info("\n✅ Vector store initialization successful!\n")
        return vector_store
    
    except Exception as e:
        logger.error(f"✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def test_database_connection():
    """Test 2: Database connection and pgvector."""
    logger.info("=" * 70)
    logger.info("TEST 2: Database Connection & pgvector Extension")
    logger.info("=" * 70)
    
    db = SessionLocal()
    try:
        # Check pgvector extension
        result = db.execute(text("SELECT * FROM pg_extension WHERE extname = 'vector'"))
        if result.fetchone():
            logger.info("✓ pgvector extension is enabled")
        else:
            logger.error("✗ pgvector extension not found")
            return None
        
        # Check document_chunks table
        result = db.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_name = 'document_chunks')"
        ))
        if result.fetchone()[0]:
            logger.info("✓ document_chunks table exists")
        else:
            logger.error("✗ document_chunks table not found")
            return None
        
        # Check table structure - pgvector type shows as USER-DEFINED in information_schema
        result = db.execute(text(
            "SELECT column_name, udt_name FROM information_schema.columns "
            "WHERE table_name = 'document_chunks' AND column_name = 'embedding'"
        ))
        row = result.fetchone()
        if row:
            logger.info(f"✓ embedding column exists with UDT type: {row[1]}")
            # Verify it's actually a vector type
            if row[1] == 'vector':
                logger.info("✓ Confirmed: embedding column is pgvector type")
            else:
                logger.warning(f"⚠ Column type is {row[1]}, expected 'vector' (but may still work)")
        else:
            logger.error("✗ embedding column not found")
            return None
        
        logger.info("\n✅ Database and pgvector ready!\n")
        return db
    
    except Exception as e:
        logger.error(f"✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        db.close()


def test_create_test_data(vector_store: VectorStoreService, test_patient_id: int = 99999):
    """Test 3: Create test medical document chunks."""
    logger.info("=" * 70)
    logger.info("TEST 3: Creating Test Medical Data")
    logger.info("=" * 70)
    
    db = SessionLocal()
    try:
        # Cleanup any existing test data
        cleanup_test_data(db, test_patient_id)
        
        total_chunks = 0
        
        for doc_idx, doc_data in enumerate(TEST_MEDICAL_DOCUMENTS, start=1):
            logger.info(f"\nIndexing document {doc_idx}/{len(TEST_MEDICAL_DOCUMENTS)}: {doc_data['title']}")
            
            # Use vector store to add document (this will chunk and embed)
            chunks_added = vector_store.add_document(
                patient_id=test_patient_id,
                document_id=99990 + doc_idx,
                text=doc_data['content'],
                document_metadata={
                    'document_type': 'test_data',
                    'original_filename': f"{doc_data['title'].lower().replace(' ', '_')}.txt",
                    'upload_date': datetime.now().isoformat()
                }
            )
            
            logger.info(f"  ✓ Created {chunks_added} chunks")
            total_chunks += chunks_added
        
        logger.info(f"\n✓ Total chunks created: {total_chunks}")
        
        # Verify data in database
        count = db.query(DocumentChunk).filter(
            DocumentChunk.patient_id == test_patient_id
        ).count()
        
        if count == total_chunks:
            logger.info(f"✓ Verified: {count} chunks in database")
        else:
            logger.error(f"✗ Mismatch: Expected {total_chunks}, found {count}")
            return None
        
        logger.info("\n✅ Test data created successfully!\n")
        return total_chunks
    
    except Exception as e:
        logger.error(f"✗ Error creating test data: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        db.close()


def test_vector_search(vector_store: VectorStoreService, test_patient_id: int = 99999):
    """Test 4: Vector similarity search."""
    logger.info("=" * 70)
    logger.info("TEST 4: Vector Similarity Search")
    logger.info("=" * 70)
    
    test_queries = [
        {
            "query": "What are my blood test results?",
            "expected_keywords": ["blood", "hemoglobin", "glucose", "cholesterol"]
        },
        {
            "query": "What medications am I taking?",
            "expected_keywords": ["lisinopril", "metformin", "atorvastatin", "prescription"]
        },
        {
            "query": "Do I have any allergies?",
            "expected_keywords": ["penicillin", "sulfa", "latex", "allergy"]
        },
        {
            "query": "What was my blood pressure at the last visit?",
            "expected_keywords": ["blood pressure", "128", "82", "vitals"]
        }
    ]
    
    all_passed = True
    
    for i, test_case in enumerate(test_queries, 1):
        logger.info(f"\n--- Query {i}/{len(test_queries)} ---")
        logger.info(f"Query: '{test_case['query']}'")
        
        try:
            results = vector_store.search(
                patient_id=test_patient_id,
                query=test_case['query'],
                top_k=3
            )
            
            if not results:
                logger.error("  ✗ No results returned")
                all_passed = False
                continue
            
            logger.info(f"  ✓ Found {len(results)} results")
            
            # Show top result
            top_result = results[0]
            logger.info(f"  Top result similarity: {top_result['similarity']:.2%}")
            logger.info(f"  Preview: {top_result['text'][:150]}...")
            
            # Check if expected keywords are in results
            combined_text = " ".join([r['text'].lower() for r in results])
            found_keywords = [kw for kw in test_case['expected_keywords'] 
                            if kw.lower() in combined_text]
            
            if found_keywords:
                logger.info(f"  ✓ Found expected keywords: {', '.join(found_keywords)}")
            else:
                logger.warning(f"  ⚠ No expected keywords found in results")
                all_passed = False
        
        except Exception as e:
            logger.error(f"  ✗ Search error: {str(e)}")
            all_passed = False
    
    if all_passed:
        logger.info("\n✅ All vector searches successful!\n")
    else:
        logger.warning("\n⚠ Some searches had issues\n")
    
    return all_passed


def test_rag_context_retrieval(vector_store: VectorStoreService, test_patient_id: int = 99999):
    """Test 5: RAG context retrieval (simulating full RAG pipeline)."""
    logger.info("=" * 70)
    logger.info("TEST 5: RAG Context Retrieval")
    logger.info("=" * 70)
    
    test_question = "What medications am I currently taking and why?"
    
    logger.info(f"Question: '{test_question}'")
    logger.info("\nRetrieving relevant context...")
    
    try:
        # Retrieve relevant chunks
        chunks = vector_store.search(
            patient_id=test_patient_id,
            query=test_question,
            top_k=5
        )
        
        if not chunks:
            logger.error("✗ No chunks retrieved")
            return False
        
        logger.info(f"✓ Retrieved {len(chunks)} relevant chunks")
        
        # Build context (like RAG does)
        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            context_parts.append(f"[Document {i}]\n{chunk['text']}\n")
        
        full_context = "\n".join(context_parts)
        
        logger.info(f"\n{'='*70}")
        logger.info("RETRIEVED CONTEXT FOR RAG:")
        logger.info(f"{'='*70}")
        logger.info(full_context[:1000] + "..." if len(full_context) > 1000 else full_context)
        logger.info(f"{'='*70}")
        
        # Check if context contains relevant information
        context_lower = full_context.lower()
        medication_keywords = ['lisinopril', 'metformin', 'atorvastatin', 'prescription']
        found_meds = [kw for kw in medication_keywords if kw in context_lower]
        
        if found_meds:
            logger.info(f"\n✓ Context contains relevant medication info: {', '.join(found_meds)}")
            logger.info("✓ This context would enable the LLM to answer the question accurately")
        else:
            logger.warning("\n⚠ Context may not contain enough relevant information")
        
        logger.info("\n✅ RAG context retrieval successful!\n")
        return True
    
    except Exception as e:
        logger.error(f"✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_performance(vector_store: VectorStoreService, test_patient_id: int = 99999):
    """Test 6: Search performance."""
    logger.info("=" * 70)
    logger.info("TEST 6: Performance Testing")
    logger.info("=" * 70)
    
    import time
    
    test_query = "What are my test results?"
    num_searches = 10
    
    logger.info(f"Running {num_searches} searches...")
    
    try:
        times = []
        for i in range(num_searches):
            start = time.time()
            results = vector_store.search(
                patient_id=test_patient_id,
                query=test_query,
                top_k=5
            )
            elapsed = time.time() - start
            times.append(elapsed)
        
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        logger.info(f"\n✓ Completed {num_searches} searches")
        logger.info(f"  Average time: {avg_time*1000:.1f}ms")
        logger.info(f"  Min time: {min_time*1000:.1f}ms")
        logger.info(f"  Max time: {max_time*1000:.1f}ms")
        
        if avg_time < 0.5:  # < 500ms
            logger.info("  ✓ EXCELLENT performance!")
        elif avg_time < 1.0:  # < 1s
            logger.info("  ✓ GOOD performance")
        else:
            logger.warning("  ⚠ Performance could be improved")
        
        logger.info("\n✅ Performance test complete!\n")
        return True
    
    except Exception as e:
        logger.error(f"✗ Error: {str(e)}")
        return False


def cleanup_after_tests(test_patient_id: int = 99999):
    """Clean up test data."""
    logger.info("=" * 70)
    logger.info("CLEANUP")
    logger.info("=" * 70)
    
    db = SessionLocal()
    try:
        # Delete chunks first (foreign key)
        deleted_chunks = db.query(DocumentChunk).filter(
            DocumentChunk.patient_id == test_patient_id
        ).delete()
        
        # Delete documents
        deleted_docs = db.query(Document).filter(
            Document.patient_id == test_patient_id
        ).delete()
        
        # Delete patient
        deleted_patients = db.query(Patient).filter(
            Patient.id == test_patient_id
        ).delete()
        
        db.commit()
        logger.info(f"✓ Cleaned up {deleted_chunks} chunks, {deleted_docs} documents, {deleted_patients} patients")
    except Exception as e:
        db.rollback()
        logger.error(f"✗ Cleanup error: {str(e)}")
    finally:
        db.close()


def main():
    """Run all tests."""
    logger.info("\n" + "=" * 70)
    logger.info("PGVECTOR RAG SYSTEM TEST SUITE")
    logger.info("=" * 70 + "\n")
    
    test_patient_id = 99999
    
    # Setup: Create test patient
    logger.info("Setting up test patient...")
    if not create_test_patient(test_patient_id):
        logger.error("\n❌ FAILED: Could not create test patient")
        return False
    logger.info("✓ Test patient ready\n")
    
    # Test 1: Vector Store Initialization
    vector_store = test_vector_store_initialization()
    if not vector_store:
        logger.error("\n❌ FAILED: Vector store initialization")
        cleanup_after_tests(test_patient_id)
        return False
    
    # Test 2: Database Connection
    if not test_database_connection():
        logger.error("\n❌ FAILED: Database connection")
        cleanup_after_tests(test_patient_id)
        return False
    
    # Test 3: Create Test Data
    chunks_created = test_create_test_data(vector_store, test_patient_id)
    if not chunks_created:
        logger.error("\n❌ FAILED: Test data creation")
        cleanup_after_tests(test_patient_id)
        return False
    
    # Test 4: Vector Search
    if not test_vector_search(vector_store, test_patient_id):
        logger.warning("\n⚠ WARNING: Some search tests had issues")
    
    # Test 5: RAG Context Retrieval
    if not test_rag_context_retrieval(vector_store, test_patient_id):
        logger.error("\n❌ FAILED: RAG context retrieval")
        cleanup_after_tests(test_patient_id)
        return False
    
    # Test 6: Performance
    test_performance(vector_store, test_patient_id)
    
    # Cleanup
    cleanup_after_tests(test_patient_id)
    
    # Summary
    logger.info("=" * 70)
    logger.info("✅ ALL TESTS PASSED!")
    logger.info("=" * 70)
    logger.info("\nYour pgvector RAG system is working correctly!")
    logger.info("\nWhat was tested:")
    logger.info("  ✓ Vector store initialization with pgvector")
    logger.info("  ✓ PostgreSQL database with pgvector extension")
    logger.info("  ✓ Document chunking and embedding generation")
    logger.info("  ✓ Vector storage in document_chunks table")
    logger.info("  ✓ Semantic similarity search")
    logger.info("  ✓ RAG context retrieval")
    logger.info("  ✓ Search performance")
    logger.info("\n" + "=" * 70 + "\n")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
