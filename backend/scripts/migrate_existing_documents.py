"""
Migration script to index existing documents into vector database.

This script should be run once after deploying the vector RAG system
to index all existing documents that were uploaded before the system was in place.

Usage:
    python -m backend.scripts.migrate_existing_documents [--patient-id ID] [--dry-run]

Options:
    --patient-id ID    Only migrate documents for specific patient
    --dry-run          Show what would be done without actually doing it
    --batch-size N     Process N patients at a time (default: 10)
"""

import sys
import os
import argparse
from pathlib import Path
from datetime import datetime

# Add parent directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir.parent))

# Load environment variables
from dotenv import load_dotenv
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)

from backend.app.database import SessionLocal
from backend.app.models.patient import Patient
from backend.app.models.document import Document
from backend.app.models.extraction import Extraction, ExtractionStatus
from backend.app.services.vector_indexing import reindex_all_patient_documents


def get_migration_stats(db, patient_id=None):
    """Get statistics about documents that need migration."""
    query = db.query(Patient)
    if patient_id:
        query = query.filter(Patient.id == patient_id)
    
    patients = query.all()
    
    stats = {
        "total_patients": len(patients),
        "patients_with_docs": 0,
        "total_documents": 0,
        "documents_with_extraction": 0,
        "patients_to_migrate": []
    }
    
    for patient in patients:
        docs = db.query(Document).filter(
            Document.patient_id == patient.id
        ).all()
        
        if docs:
            stats["patients_with_docs"] += 1
            stats["total_documents"] += len(docs)
            
            docs_with_extraction = 0
            for doc in docs:
                extraction = db.query(Extraction).filter(
                    Extraction.document_id == doc.id,
                    Extraction.status == ExtractionStatus.COMPLETED,
                    Extraction.raw_text.isnot(None)
                ).first()
                
                if extraction:
                    docs_with_extraction += 1
            
            stats["documents_with_extraction"] += docs_with_extraction
            
            if docs_with_extraction > 0:
                stats["patients_to_migrate"].append({
                    "patient_id": patient.id,
                    "patient_name": f"{patient.user.first_name} {patient.user.last_name}" if patient.user else f"Patient {patient.patient_id}",
                    "document_count": len(docs),
                    "extractable_count": docs_with_extraction
                })
    
    return stats


def migrate_patient(patient_id, dry_run=False):
    """Migrate a single patient's documents."""
    if dry_run:
        print(f"[DRY RUN] Would migrate patient {patient_id}")
        return {"patient_id": patient_id, "dry_run": True}
    
    try:
        results = reindex_all_patient_documents(patient_id)
        return results
    except Exception as e:
        return {
            "patient_id": patient_id,
            "error": str(e)
        }


def main():
    parser = argparse.ArgumentParser(
        description="Migrate existing documents to vector database"
    )
    parser.add_argument(
        "--patient-id",
        type=int,
        help="Only migrate specific patient ID"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without doing it"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Process N patients at a time"
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("VECTOR RAG MIGRATION TOOL")
    print("=" * 70)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ ERROR: OPENAI_API_KEY not set in .env file")
        return 1
    
    db = SessionLocal()
    
    try:
        # Get statistics
        print("Analyzing documents...")
        stats = get_migration_stats(db, args.patient_id)
        
        print("\n" + "=" * 70)
        print("MIGRATION STATISTICS")
        print("=" * 70)
        print(f"Total patients: {stats['total_patients']}")
        print(f"Patients with documents: {stats['patients_with_docs']}")
        print(f"Total documents: {stats['total_documents']}")
        print(f"Documents with completed extraction: {stats['documents_with_extraction']}")
        print(f"Patients to migrate: {len(stats['patients_to_migrate'])}")
        print()
        
        if not stats['patients_to_migrate']:
            print("✅ No patients need migration!")
            return 0
        
        # Show patients to migrate
        print("Patients to be migrated:")
        print("-" * 70)
        for p in stats['patients_to_migrate']:
            print(f"  Patient {p['patient_id']}: {p['patient_name']}")
            print(f"    - {p['extractable_count']} documents with completed extraction")
        print()
        
        if args.dry_run:
            print("=" * 70)
            print("DRY RUN MODE - No changes will be made")
            print("=" * 70)
            print("\nRun without --dry-run to perform actual migration.")
            return 0
        
        # Confirm
        response = input("Proceed with migration? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            print("Migration cancelled.")
            return 0
        
        print("\n" + "=" * 70)
        print("STARTING MIGRATION")
        print("=" * 70)
        print()
        
        # Migrate patients
        results = []
        for i, patient_info in enumerate(stats['patients_to_migrate'], 1):
            patient_id = patient_info['patient_id']
            print(f"[{i}/{len(stats['patients_to_migrate'])}] Migrating patient {patient_id}...")
            
            result = migrate_patient(patient_id, args.dry_run)
            results.append(result)
            
            if "error" in result:
                print(f"  ❌ Failed: {result['error']}")
            else:
                print(f"  ✅ Success: {result['indexed']} documents, {result['total_chunks']} chunks")
                if result['failed'] > 0:
                    print(f"  ⚠️  {result['failed']} documents failed")
            
            print()
        
        # Summary
        print("=" * 70)
        print("MIGRATION COMPLETE")
        print("=" * 70)
        
        successful = sum(1 for r in results if "error" not in r)
        failed = sum(1 for r in results if "error" in r)
        total_chunks = sum(r.get('total_chunks', 0) for r in results if "error" not in r)
        total_indexed = sum(r.get('indexed', 0) for r in results if "error" not in r)
        
        print(f"Successful: {successful}/{len(results)} patients")
        print(f"Failed: {failed}/{len(results)} patients")
        print(f"Total documents indexed: {total_indexed}")
        print(f"Total chunks created: {total_chunks}")
        print()
        print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)
        
        return 0 if failed == 0 else 1
    
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1
    
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
