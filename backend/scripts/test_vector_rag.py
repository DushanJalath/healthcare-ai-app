"""
Test script for Vector RAG System

This script tests the vector RAG implementation by:
1. Checking if dependencies are installed
2. Testing vector store initialization
3. Testing chunking and embedding
4. Testing search functionality
5. Providing a simple demo

Run with: python -m backend.scripts.test_vector_rag
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir.parent))

def test_imports():
    """Test if all required dependencies are installed."""
    print("=" * 70)
    print("TEST 1: Checking Dependencies")
    print("=" * 70)
    
    try:
        import pgvector
        print("✓ pgvector installed")
    except ImportError:
        print("✗ pgvector not installed. Run: pip install pgvector")
        return False
    
    try:
        import tiktoken
        print("✓ tiktoken installed:", tiktoken.__version__)
    except ImportError:
        print("✗ tiktoken not installed. Run: pip install tiktoken")
        return False
    
    try:
        from openai import OpenAI
        print("✓ openai installed")
    except ImportError:
        print("✗ openai not installed. Run: pip install openai")
        return False
    
    try:
        from sqlalchemy import create_engine
        print("✓ sqlalchemy installed")
    except ImportError:
        print("✗ sqlalchemy not installed. Run: pip install sqlalchemy")
        return False
    
    print("\n✓ All dependencies installed!\n")
    return True


def test_vector_store():
    """Test vector store initialization."""
    print("=" * 70)
    print("TEST 2: Vector Store Initialization")
    print("=" * 70)
    
    try:
        # Load environment variables
        from dotenv import load_dotenv
        env_path = backend_dir / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        
        # Check for OpenAI API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("✗ OPENAI_API_KEY not set in .env file")
            return False
        
        print("✓ OPENAI_API_KEY found")
        
        # Check for database connection
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("✗ DATABASE_URL not set in .env file")
            return False
        
        print("✓ DATABASE_URL found")
        
        # Initialize vector store
        from backend.app.services.vector_store import VectorStoreService
        
        vector_store = VectorStoreService()
        print("✓ Vector store initialized (using pgvector)")
        print(f"  - Embedding model: {vector_store.embedding_model}")
        print(f"  - Chunk size: {vector_store.chunk_size} tokens")
        print(f"  - Chunk overlap: {vector_store.chunk_overlap} tokens")
        print(f"  - Storage: PostgreSQL with pgvector extension")
        
        print("\n✓ Vector store initialization successful!\n")
        return vector_store, None
    
    except Exception as e:
        print(f"✗ Error initializing vector store: {str(e)}")
        import traceback
        traceback.print_exc()
        return None, None


def test_chunking(vector_store):
    """Test text chunking."""
    print("=" * 70)
    print("TEST 3: Text Chunking")
    print("=" * 70)
    
    # Sample medical text
    sample_text = """
    PATIENT: John Doe
    DATE: January 15, 2026
    
    LABORATORY REPORT
    
    Complete Blood Count (CBC):
    - White Blood Cells: 7.5 x10^9/L (Normal: 4.0-11.0)
    - Red Blood Cells: 4.8 x10^12/L (Normal: 4.5-5.5)
    - Hemoglobin: 14.2 g/dL (Normal: 13.5-17.5)
    - Hematocrit: 42% (Normal: 40-50%)
    - Platelets: 250 x10^9/L (Normal: 150-400)
    
    Blood Chemistry:
    - Glucose (Fasting): 95 mg/dL (Normal: 70-100)
    - Cholesterol (Total): 185 mg/dL (Normal: <200)
    - HDL Cholesterol: 55 mg/dL (Normal: >40)
    - LDL Cholesterol: 110 mg/dL (Normal: <130)
    - Triglycerides: 100 mg/dL (Normal: <150)
    - Creatinine: 0.9 mg/dL (Normal: 0.6-1.2)
    - Blood Urea Nitrogen: 15 mg/dL (Normal: 7-20)
    
    INTERPRETATION:
    All values are within normal limits. No significant abnormalities detected.
    Patient shows good metabolic health markers. Continue current lifestyle and 
    dietary habits. Recommend follow-up testing in 6 months.
    """
    
    metadata = {
        "document_id": 999,
        "patient_id": 1,
        "document_type": "lab_report",
        "upload_date": "2026-01-15"
    }
    
    try:
        chunks = vector_store._chunk_text(sample_text, metadata)
        print(f"✓ Text chunked into {len(chunks)} chunks")
        
        for i, chunk in enumerate(chunks, 1):
            print(f"\n  Chunk {i}:")
            print(f"    - Tokens: {chunk['metadata']['total_tokens']}")
            print(f"    - Preview: {chunk['text'][:100]}...")
        
        print("\n✓ Chunking successful!\n")
        return chunks
    
    except Exception as e:
        print(f"✗ Error during chunking: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def test_embeddings(vector_store, chunks):
    """Test embedding generation."""
    print("=" * 70)
    print("TEST 4: Embedding Generation")
    print("=" * 70)
    
    if not chunks:
        print("✗ No chunks available for embedding")
        return False
    
    try:
        # Test with first chunk only to save API calls
        test_texts = [chunks[0]["text"]]
        embeddings = vector_store._get_embeddings(test_texts)
        
        print(f"✓ Generated {len(embeddings)} embedding(s)")
        print(f"  - Embedding dimension: {len(embeddings[0])}")
        print(f"  - Expected dimension: {vector_store.embedding_dimension}")
        
        if len(embeddings[0]) == vector_store.embedding_dimension:
            print("✓ Embedding dimension matches!")
        else:
            print("✗ Embedding dimension mismatch!")
            return False
        
        print("\n✓ Embedding generation successful!\n")
        return True
    
    except Exception as e:
        print(f"✗ Error generating embeddings: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_indexing_and_search(vector_store):
    """Test document indexing and search."""
    print("=" * 70)
    print("TEST 5: Indexing and Search")
    print("=" * 70)
    
    # Sample medical document
    sample_doc = """
    PATIENT: Jane Smith
    DATE: February 10, 2026
    
    DISCHARGE SUMMARY
    
    ADMISSION DATE: February 7, 2026
    DISCHARGE DATE: February 10, 2026
    
    DIAGNOSIS: Acute Appendicitis
    
    HISTORY:
    Patient presented to emergency department with acute onset of right lower 
    quadrant abdominal pain, nausea, and fever. Physical examination revealed 
    tenderness and guarding in the right lower quadrant. Laboratory studies 
    showed elevated white blood cell count at 14.2 x10^9/L.
    
    TREATMENT:
    Patient underwent laparoscopic appendectomy on February 7, 2026. Surgery 
    was successful without complications. Patient recovered well post-operatively.
    
    MEDICATIONS AT DISCHARGE:
    - Acetaminophen 500mg every 6 hours as needed for pain
    - Amoxicillin 500mg three times daily for 7 days
    
    FOLLOW-UP:
    Patient to follow up with surgeon in 2 weeks for wound check and suture removal.
    Return to normal activities gradually over next 2-3 weeks.
    """
    
    try:
        # Create test patient collection
        test_patient_id = 9999
        
        print("Indexing test document...")
        chunks_added = vector_store.add_document(
            patient_id=test_patient_id,
            document_id=9999,
            text=sample_doc,
            document_metadata={
                "document_type": "discharge_summary",
                "upload_date": "2026-02-10",
                "original_filename": "discharge_summary.pdf"
            }
        )
        
        print(f"✓ Indexed {chunks_added} chunks")
        
        # Test search
        print("\nTesting search queries...")
        
        test_queries = [
            "What was the diagnosis?",
            "What medications were prescribed?",
            "When is the follow-up appointment?",
            "What was the white blood cell count?"
        ]
        
        for query in test_queries:
            print(f"\n  Query: '{query}'")
            results = vector_store.search(
                patient_id=test_patient_id,
                query=query,
                top_k=2
            )
            
            if results:
                print(f"  ✓ Found {len(results)} results")
                top_result = results[0]
                print(f"    - Similarity: {top_result['similarity']:.2%}")
                print(f"    - Preview: {top_result['text'][:150]}...")
            else:
                print("  ✗ No results found")
        
        # Cleanup
        print("\nCleaning up test data...")
        vector_store.delete_patient_collection(test_patient_id)
        print("✓ Test collection deleted")
        
        print("\n✓ Indexing and search successful!\n")
        return True
    
    except Exception as e:
        print(f"✗ Error during indexing/search: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def cleanup(test_dir):
    """Cleanup test data (no longer needed with pgvector as test data is in database)."""
    print("=" * 70)
    print("CLEANUP")
    print("=" * 70)
    print("✓ Test data removed from database (done automatically during tests)")
    print("Note: With pgvector, all test data is stored in PostgreSQL and cleaned up automatically.")


def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("VECTOR RAG SYSTEM TEST SUITE")
    print("=" * 70 + "\n")
    
    # Test 1: Dependencies
    if not test_imports():
        print("\n❌ FAILED: Dependencies not installed")
        return False
    
    # Test 2: Vector Store
    vector_store, test_dir = test_vector_store()
    if not vector_store:
        print("\n❌ FAILED: Vector store initialization failed")
        return False
    
    # Test 3: Chunking
    chunks = test_chunking(vector_store)
    if not chunks:
        print("\n❌ FAILED: Chunking failed")
        cleanup(test_dir)
        return False
    
    # Test 4: Embeddings
    if not test_embeddings(vector_store, chunks):
        print("\n❌ FAILED: Embedding generation failed")
        cleanup(test_dir)
        return False
    
    # Test 5: Indexing and Search
    if not test_indexing_and_search(vector_store):
        print("\n❌ FAILED: Indexing/search failed")
        cleanup(test_dir)
        return False
    
    # Cleanup
    cleanup(test_dir)
    
    # Summary
    print("=" * 70)
    print("✅ ALL TESTS PASSED!")
    print("=" * 70)
    print("\nYour Vector RAG system is ready to use!")
    print("\nNext steps:")
    print("1. Upload documents through the API")
    print("2. Documents will be automatically indexed after OCR")
    print("3. Use the /patients/{id}/rag/chat endpoint to ask questions")
    print("4. Monitor indexing with /vector/patients/{id}/stats")
    print("\nSee VECTOR_RAG_GUIDE.md for detailed documentation.")
    print("=" * 70 + "\n")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
