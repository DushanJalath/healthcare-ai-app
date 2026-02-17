# Database Migrations

This directory contains SQL migration scripts for database schema changes.

## Running Migrations

### Manual SQL Execution

1. Connect to your PostgreSQL database using your preferred tool (psql, pgAdmin, DBeaver, etc.)
2. Run the SQL scripts in order if there are multiple migrations
3. Always backup your database before running migrations

### Current Migrations

#### `add_clinic_id_to_users.sql`
Adds the `clinic_id` column to the `users` table to link users to their clinics.

**To run:**
```bash
psql -h localhost -U your_username -d your_database -f migrations/add_clinic_id_to_users.sql
```

Or copy and paste the SQL into your database management tool.

**What it does:**
- Adds `clinic_id` column (nullable)
- Adds foreign key constraint to `clinics` table
- Creates an index for better query performance
- Includes optional update query for existing clinic_admin users

**Note:** After running this migration, existing `clinic_admin` users may need their `clinic_id` updated to match their clinic's `id`.

#### `enable_pgvector_and_create_chunks_table.sql` ⭐ NEW
Migrates vector database from ChromaDB to pgvector (PostgreSQL native vector extension).

**To run:**
```bash
psql -h your_host -U your_username -d your_database -f migrations/enable_pgvector_and_create_chunks_table.sql
```

Or for Neon database (using connection string from .env):
```bash
psql "postgresql://neondb_owner:your_password@your_host/neondb?sslmode=require" -f migrations/enable_pgvector_and_create_chunks_table.sql
```

**What it does:**
- Enables the `pgvector` extension in PostgreSQL
- Creates `document_chunks` table to store text chunks with embeddings
- Creates indexes for efficient filtering (patient_id, document_id, document_type)
- Creates HNSW index for fast vector similarity search using cosine distance
- Adds triggers for automatic timestamp updates

**Prerequisites:**
- PostgreSQL 12+ with pgvector extension available
- For managed databases (Neon, Supabase, AWS RDS), pgvector is usually pre-installed

**Benefits:**
- Consolidates all data in PostgreSQL (no separate ChromaDB needed)
- Better integration with existing database infrastructure
- Improved query performance with native SQL joins
- Easier backup and maintenance

**Note:** After running this migration, you'll need to reindex existing documents using the `/vector/patients/{patient_id}/reindex` endpoint.
