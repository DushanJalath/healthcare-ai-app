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
