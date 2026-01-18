#!/usr/bin/env python3
"""
Migration script to migrate from single-clinic to multi-clinic patient support.

This script:
1. Creates the patient_clinics junction table
2. Migrates existing patient-clinic relationships
3. Adds clinic_type support to clinics
"""

import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.patient import Patient
from app.models.clinic import Clinic
from app.models.patient_clinic import PatientClinic

def run_migration():
    """Run the migration to multi-clinic support."""
    
    print("Starting migration: Add multi-clinic patient support...")
    
    db = SessionLocal()
    try:
        with engine.connect() as connection:
            # Start a transaction
            trans = connection.begin()
            try:
                print("\nStep 1: Creating patient_clinics table...")
                
                # Create patient_clinics table
                connection.execute(text("""
                    CREATE TABLE IF NOT EXISTS patient_clinics (
                        id SERIAL PRIMARY KEY,
                        patient_id INTEGER NOT NULL,
                        clinic_id INTEGER NOT NULL,
                        enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        is_active BOOLEAN DEFAULT TRUE,
                        notes TEXT,
                        
                        CONSTRAINT fk_patient_clinics_patient 
                            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                        CONSTRAINT fk_patient_clinics_clinic 
                            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
                        CONSTRAINT uq_patient_clinic UNIQUE (patient_id, clinic_id)
                    );
                """))
                
                # Create indexes
                print("  - Creating indexes...")
                connection.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_patient_clinics_patient_id 
                    ON patient_clinics(patient_id);
                """))
                connection.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_patient_clinics_clinic_id 
                    ON patient_clinics(clinic_id);
                """))
                connection.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_patient_clinics_is_active 
                    ON patient_clinics(is_active);
                """))
                
                print("Step 2: Adding clinic_type column to clinics table...")
                connection.execute(text("""
                    ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_type VARCHAR(50);
                """))
                connection.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_clinics_clinic_type 
                    ON clinics(clinic_type);
                """))
                
                print("Step 3: Making clinic_id nullable in patients table...")
                connection.execute(text("""
                    ALTER TABLE patients ALTER COLUMN clinic_id DROP NOT NULL;
                """))
                
                # Commit schema changes
                trans.commit()
                print("[OK] Schema changes committed!")
                
            except Exception as e:
                trans.rollback()
                print(f"[ERROR] Schema migration failed: {e}")
                raise
        
        # Step 4: Migrate data (separate transaction)
        print("\nStep 4: Migrating existing patient-clinic relationships...")
        
        # Get all patients with clinic_id
        patients_with_clinic = db.query(Patient).filter(
            Patient.clinic_id.isnot(None)
        ).all()
        
        migrated_count = 0
        skipped_count = 0
        
        for patient in patients_with_clinic:
            # Check if membership already exists
            existing = db.query(PatientClinic).filter(
                PatientClinic.patient_id == patient.id,
                PatientClinic.clinic_id == patient.clinic_id
            ).first()
            
            if not existing:
                # Create PatientClinic membership
                membership = PatientClinic(
                    patient_id=patient.id,
                    clinic_id=patient.clinic_id,
                    is_active=True
                )
                db.add(membership)
                migrated_count += 1
            else:
                skipped_count += 1
        
        db.commit()
        print(f"  - Migrated {migrated_count} patient-clinic relationships")
        print(f"  - Skipped {skipped_count} (already exists)")
        
        # Verify migration
        print("\nStep 5: Verifying migration...")
        total_patients = db.query(Patient).filter(Patient.clinic_id.isnot(None)).count()
        total_memberships = db.query(PatientClinic).filter(PatientClinic.is_active == True).count()
        
        print(f"  - Total patients with clinic_id: {total_patients}")
        print(f"  - Total active memberships: {total_memberships}")
        
        if total_memberships >= total_patients:
            print("[OK] Migration completed successfully!")
            print("\nNote: clinic_id column in patients table is kept for backward compatibility.")
            print("You can remove it in a future migration after verifying everything works.")
        else:
            print(f"[WARNING] Migration may be incomplete. Expected at least {total_patients} memberships, got {total_memberships}")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
