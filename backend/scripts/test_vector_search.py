"""
Test Vector Search

Test if vector search can find blood pressure information.
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from app.services.vector_store import get_vector_store


def test_search(patient_id: int, query: str, top_k: int = 5):
    """Test vector search for a patient"""
    print(f"\n{'='*80}")
    print(f"[VECTOR SEARCH TEST]")
    print('='*80)
    print(f"\nPatient ID: {patient_id}")
    print(f"Query: '{query}'")
    print(f"Top K: {top_k}")
    print()
    
    try:
        # Get vector store
        vector_store = get_vector_store()
        
        # Perform search
        results = vector_store.search(
            patient_id=patient_id,
            query=query,
            top_k=top_k
        )
        
        if not results:
            print("[ERROR] No results found!")
            print("\nPossible reasons:")
            print("1. Patient has no indexed documents")
            print("2. Query doesn't match any chunks semantically")
            print("3. Vector store is not properly initialized")
            return
        
        print(f"[SUCCESS] Found {len(results)} relevant chunks\n")
        
        for i, chunk in enumerate(results, 1):
            print(f"{'='*80}")
            print(f"Result {i}:")
            print(f"{'='*80}")
            print(f"Similarity Score: {chunk['similarity']:.4f} ({chunk['similarity']*100:.1f}%)")
            print(f"Distance: {chunk['distance']:.4f}")
            print(f"\nMetadata:")
            metadata = chunk['metadata']
            print(f"  Document ID: {metadata.get('document_id')}")
            print(f"  Document Type: {metadata.get('document_type')}")
            print(f"  Filename: {metadata.get('original_filename')}")
            print(f"  Upload Date: {metadata.get('upload_date')}")
            print(f"  Chunk Index: {metadata.get('chunk_index')}")
            print(f"  Tokens: {metadata.get('total_tokens')}")
            
            print(f"\nText Content:")
            print("-" * 80)
            print(chunk['text'][:500])
            if len(chunk['text']) > 500:
                print("...")
            print("-" * 80)
            print()
        
    except Exception as e:
        print(f"[ERROR] Vector search failed: {str(e)}")
        import traceback
        traceback.print_exc()


def main():
    if len(sys.argv) < 3:
        print("Usage: python test_vector_search.py <patient_id> <query>")
        print("\nExample:")
        print('  python scripts/test_vector_search.py 16 "what is my blood pressure"')
        return
    
    patient_id = int(sys.argv[1])
    query = sys.argv[2]
    top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    
    test_search(patient_id, query, top_k)


if __name__ == "__main__":
    main()
