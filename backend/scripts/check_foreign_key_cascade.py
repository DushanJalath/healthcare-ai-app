"""
Check Foreign Key Cascade Configuration

This script checks if the foreign key constraints on document_chunks table
have proper CASCADE behavior configured.
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


def check_cascade_constraints():
    """Check if foreign key constraints have proper CASCADE behavior."""
    
    query = text("""
        SELECT 
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        LEFT JOIN information_schema.referential_constraints AS rc
            ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'document_chunks' 
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY kcu.column_name;
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        rows = result.fetchall()
        
        if not rows:
            print("❌ ERROR: No foreign key constraints found on document_chunks table!")
            print("   You need to run the migration: migrations/enable_pgvector_and_create_chunks_table.sql")
            return False
        
        print("\n📋 Foreign Key Constraints on document_chunks:")
        print("-" * 100)
        
        all_correct = True
        for row in rows:
            constraint_name = row[0]
            column_name = row[2]
            foreign_table = row[3]
            foreign_column = row[4]
            delete_rule = row[5]
            
            expected_rule = "SET NULL" if column_name == "extraction_id" else "CASCADE"
            is_correct = delete_rule == expected_rule
            status = "✅" if is_correct else "❌"
            
            print(f"{status} {column_name:20} -> {foreign_table}.{foreign_column:15} | DELETE: {delete_rule:10} (expected: {expected_rule})")
            
            if not is_correct:
                all_correct = False
        
        print("-" * 100)
        
        if all_correct:
            print("\n✅ SUCCESS: All foreign key constraints are properly configured!")
            print("   The database will automatically cascade deletes from documents to document_chunks.")
            return True
        else:
            print("\n❌ ERROR: Some foreign key constraints have incorrect DELETE rules!")
            print("   You need to run the migration: migrations/fix_foreign_key_cascade.sql")
            print("\n   To run the migration:")
            print("   psql -h your_host -U your_username -d your_database -f backend/migrations/fix_foreign_key_cascade.sql")
            return False


if __name__ == "__main__":
    try:
        print("Checking foreign key cascade configuration...")
        success = check_cascade_constraints()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("\n   Make sure:")
        print("   1. PostgreSQL is running")
        print("   2. Database connection is configured correctly in .env")
        print("   3. The document_chunks table exists")
        sys.exit(1)
