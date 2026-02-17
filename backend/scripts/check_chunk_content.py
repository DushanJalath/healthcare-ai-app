"""
Check the actual content of all chunks for a document
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from app.database import SessionLocal
from app.models.document_chunk import DocumentChunk


def check_chunks(document_id: int):
    db = SessionLocal()
    
    try:
        chunks = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id
        ).order_by(DocumentChunk.chunk_index).all()
        
        print(f"\n{'='*80}")
        print(f"Document {document_id} - All Chunks")
        print('='*80)
        
        for chunk in chunks:
            print(f"\n{'='*80}")
            print(f"Chunk {chunk.chunk_index} (ID: {chunk.id})")
            print(f"Tokens: {chunk.total_tokens}")
            print('='*80)
            print(chunk.chunk_text)
            print()
            
            # Check if this chunk has blood pressure
            if "blood pressure" in chunk.chunk_text.lower() or "128/82" in chunk.chunk_text:
                print("[!!! THIS CHUNK CONTAINS BLOOD PRESSURE INFO !!!]")
                print()
    
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_chunk_content.py <document_id>")
        sys.exit(1)
    
    doc_id = int(sys.argv[1])
    check_chunks(doc_id)
