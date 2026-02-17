"""
Test RAG Chat Endpoint Directly

Test the RAG chat to see if it can answer blood pressure questions.
"""

import sys
import os
from pathlib import Path
import json

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

# Import FastAPI test client
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User

def test_rag_chat(patient_id: int, question: str, auth_token: str = None):
    """Test RAG chat for a patient"""
    print(f"\n{'='*80}")
    print(f"[RAG CHAT TEST]")
    print('='*80)
    print(f"\nPatient ID: {patient_id}")
    print(f"Question: '{question}'")
    print()
    
    # Create test client
    client = TestClient(app)
    
    # If no auth token, try to get a patient user
    if not auth_token:
        db = SessionLocal()
        try:
            # Find a patient user for this patient
            from app.models.patient import Patient
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if not patient or not patient.user_id:
                print("[ERROR] Patient not found or has no user account")
                return
            
            user = db.query(User).filter(User.id == patient.user_id).first()
            if not user:
                print("[ERROR] User not found")
                return
            
            print(f"User: {user.email}")
            
            # Login to get token
            login_response = client.post("/auth/login", data={
                "username": user.email,
                "password": "test123"  # Default test password
            })
            
            if login_response.status_code != 200:
                print(f"[ERROR] Login failed: {login_response.status_code}")
                print(f"Response: {login_response.text}")
                return
            
            auth_token = login_response.json()["access_token"]
            print("[SUCCESS] Logged in")
        
        finally:
            db.close()
    
    # Make RAG chat request
    headers = {"Authorization": f"Bearer {auth_token}"}
    payload = {
        "question": question,
        "top_k": 5,
        "use_vector_search": True
    }
    
    print(f"\nSending request to /patients/{patient_id}/rag/chat")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print()
    
    response = client.post(
        f"/patients/{patient_id}/rag/chat",
        headers=headers,
        json=payload
    )
    
    print(f"Response Status: {response.status_code}")
    print()
    
    if response.status_code != 200:
        print(f"[ERROR] Request failed")
        print(f"Response: {response.text}")
        return
    
    data = response.json()
    
    print("="*80)
    print("RESPONSE")
    print("="*80)
    print(f"\nAnswer:")
    print("-"*80)
    print(data["answer"])
    print("-"*80)
    
    print(f"\nChunks Retrieved: {data['used_top_k']}")
    if data["chunks"]:
        print(f"\nChunk Previews:")
        for i, chunk in enumerate(data["chunks"], 1):
            print(f"\n  Chunk {i}:")
            print(f"    Similarity: {chunk['metadata'].get('similarity', 'N/A'):.4f}")
            print(f"    Document ID: {chunk['metadata'].get('document_id')}")
            print(f"    Preview: {chunk['content'][:100]}...")


def main():
    if len(sys.argv) < 3:
        print("Usage: python test_rag_chat.py <patient_id> <question>")
        print("\nExample:")
        print('  python scripts/test_rag_chat.py 16 "what is my blood pressure"')
        return
    
    patient_id = int(sys.argv[1])
    question = sys.argv[2]
    
    test_rag_chat(patient_id, question)


if __name__ == "__main__":
    main()
