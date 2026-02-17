"""
Document Chunk Model for Vector Storage

Stores text chunks with their embeddings for RAG retrieval using pgvector.
Each chunk is linked to a patient and document for filtering and access control.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from ..database import Base


class DocumentChunk(Base):
    """
    Stores document chunks with vector embeddings for semantic search.
    
    Uses pgvector extension for efficient similarity search.
    """
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    extraction_id = Column(Integer, ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    
    # Chunk data
    chunk_text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)  # Order within document
    
    # Token information
    chunk_start_token = Column(Integer)
    chunk_end_token = Column(Integer)
    total_tokens = Column(Integer)
    
    # Document metadata (denormalized for faster filtering)
    document_type = Column(String)
    original_filename = Column(String)
    upload_date = Column(DateTime(timezone=True))
    extraction_method = Column(String)
    
    # Vector embedding (3072 dimensions for text-embedding-3-large)
    embedding = Column(Vector(3072), nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships with proper cascade behavior
    patient = relationship("Patient", backref="document_chunks")
    document = relationship("Document", back_populates="chunks")
    extraction = relationship("Extraction", backref="chunks")


# Create indexes for efficient querying
# Index on patient_id for filtering by patient
Index('idx_document_chunks_patient_id', DocumentChunk.patient_id)

# Index on document_id for filtering by document
Index('idx_document_chunks_document_id', DocumentChunk.document_id)

# Composite index for patient + document filtering
Index('idx_document_chunks_patient_document', DocumentChunk.patient_id, DocumentChunk.document_id)

# IVFFlat index for vector similarity search (created via migration)
# Using IVFFlat instead of HNSW because we have 3072-dimension embeddings (HNSW max is 2000)
# This will be created in the migration:
# CREATE INDEX idx_document_chunks_embedding_ivfflat ON document_chunks USING ivfflat (embedding vector_cosine_ops);
