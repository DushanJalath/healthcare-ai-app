-- Migration: Enable pgvector extension and create document_chunks table
-- Description: This migration enables the pgvector extension for vector similarity search
--              and creates the document_chunks table to store embeddings with text chunks.
-- 
-- Prerequisites:
-- 1. PostgreSQL 12+ (pgvector requires 11+, but 12+ recommended)
-- 2. pgvector extension must be available on your PostgreSQL server
--    For managed databases (Neon, Supabase, AWS RDS, etc.), pgvector is usually pre-installed
--
-- To run this migration:
-- psql -h your_host -U your_username -d your_database -f migrations/enable_pgvector_and_create_chunks_table.sql

-- Step 1: Enable pgvector extension
-- This adds vector data type and similarity search functions to PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    
    -- Foreign keys
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    extraction_id INTEGER REFERENCES extractions(id) ON DELETE SET NULL,
    
    -- Chunk data
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    
    -- Token information
    chunk_start_token INTEGER,
    chunk_end_token INTEGER,
    total_tokens INTEGER,
    
    -- Document metadata (denormalized for faster filtering)
    document_type VARCHAR,
    original_filename VARCHAR,
    upload_date TIMESTAMP WITH TIME ZONE,
    extraction_method VARCHAR,
    
    -- Vector embedding (3072 dimensions for OpenAI text-embedding-3-large)
    embedding vector(3072) NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Step 3: Create indexes for efficient querying

-- Index on patient_id for filtering by patient
CREATE INDEX IF NOT EXISTS idx_document_chunks_patient_id 
ON document_chunks(patient_id);

-- Index on document_id for filtering by document
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id 
ON document_chunks(document_id);

-- Composite index for patient + document filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_patient_document 
ON document_chunks(patient_id, document_id);

-- Index on document_type for filtering by type
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_type 
ON document_chunks(document_type);

-- Step 4: Vector index (optional)
-- NOTE: The current pgvector version on many hosted databases (including Neon) has a
--       2000-dimension limit for vector indexes (HNSW and IVFFlat).
--       Since we're using 3072-dimension embeddings (text-embedding-3-large), 
--       we skip the index for now.
--
-- pgvector will use exact search (brute force) which is:
-- - Still VERY fast for small to medium datasets (<100K vectors)
-- - Accurate (no approximation)
-- - Works perfectly fine for most use cases
--
-- If you upgrade to pgvector 0.7.0+ or use a smaller embedding model (1536 dimensions),
-- you can add an index manually:
--
-- For HNSW (fastest, requires pgvector 0.7.0+):
--   CREATE INDEX idx_document_chunks_embedding_hnsw 
--   ON document_chunks USING hnsw (embedding vector_cosine_ops);
--
-- For IVFFlat (good balance):
--   CREATE INDEX idx_document_chunks_embedding_ivfflat 
--   ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
--
-- For exact search (no index needed - what we're using now):
--   No index required, pgvector will automatically use exact search

-- Step 5: Add a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for updated_at
CREATE TRIGGER trigger_document_chunks_updated_at
    BEFORE UPDATE ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_chunks_updated_at();

-- Migration complete!
-- You can now use pgvector for semantic search of medical documents.

-- Verify the migration:
-- 1. Check if pgvector is enabled:
--    SELECT * FROM pg_extension WHERE extname = 'vector';
--
-- 2. Check if table was created:
--    \d document_chunks
--
-- 3. Check if indexes were created:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'document_chunks';
