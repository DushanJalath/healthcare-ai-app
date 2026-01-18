#!/usr/bin/env python3
"""
Migration script to add clinic_id column to users table.

This script adds the clinic_id foreign key column to the users table,
which links users to their assigned clinics.
"""

import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.clinic import Clinic
from app.models.user import User, UserRole

def run_migration():
    """Run the migration to add clinic_id column to users table."""
    
    print("Starting migration: Add clinic_id to users table...")
    
    with engine.connect() as connection:
        # Start a transaction
        trans = connection.begin()
        try:
            # Add clinic_id column if it doesn't exist
            print("  - Adding clinic_id column...")
            connection.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
            """))
            
            # Add foreign key constraint
            print("  - Adding foreign key constraint...")
            # Drop constraint if it exists first (for idempotency)
            connection.execute(text("""
                ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_clinic_id;
            """))
            connection.execute(text("""
                ALTER TABLE users 
                ADD CONSTRAINT fk_users_clinic_id 
                FOREIGN KEY (clinic_id) REFERENCES clinics(id);
            """))
            
            # Create index
            print("  - Creating index...")
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_users_clinic_id ON users(clinic_id);
            """))
            
            # Commit the transaction
            trans.commit()
            print("[OK] Migration completed successfully!")
            
        except Exception as e:
            trans.rollback()
            print(f"[ERROR] Migration failed: {e}")
            sys.exit(1)

def update_existing_clinic_admins():
    """Update existing clinic_admin users to set their clinic_id."""
    
    print("\nUpdating existing clinic_admin users...")
    
    db = SessionLocal()
    try:
        # Find all clinic_admin users without clinic_id
        admin_users = db.query(User).filter(
            User.role == UserRole.CLINIC_ADMIN,
            User.clinic_id.is_(None)
        ).all()
        
        updated_count = 0
        for user in admin_users:
            # Find clinic where this user is the admin
            clinic = db.query(Clinic).filter(Clinic.admin_user_id == user.id).first()
            if clinic:
                user.clinic_id = clinic.id
                updated_count += 1
                print(f"  - Updated user {user.email} (ID: {user.id}) with clinic_id: {clinic.id}")
        
        if updated_count > 0:
            db.commit()
            print(f"[OK] Updated {updated_count} clinic_admin user(s)")
        else:
            print("  - No clinic_admin users needed updating")
            
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to update clinic_admin users: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Add clinic_id to users table")
    print("=" * 60)
    
    # Run the migration
    run_migration()
    
    # Optionally update existing clinic_admin users
    try:
        update_existing_clinic_admins()
    except Exception as e:
        print(f"Warning: Could not update clinic_admin users: {e}")
    
    print("\n" + "=" * 60)
    print("Migration process completed!")
    print("=" * 60)
