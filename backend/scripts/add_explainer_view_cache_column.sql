-- Run once if the `extractions` table already exists without `explainer_view_cache`.
-- SQLAlchemy create_all() does not add new columns to existing tables.

-- PostgreSQL
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS explainer_view_cache JSON;

-- SQLite (omit IF NOT EXISTS on older SQLite; skip if column already exists)
-- ALTER TABLE extractions ADD COLUMN explainer_view_cache TEXT;
