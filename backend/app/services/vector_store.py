"""
Vector Store Service for Patient Document RAG System

This service manages vector embeddings for patient documents using:
- OpenAI text-embedding-3-large for embeddings
- pgvector (PostgreSQL extension) for vector storage
- Structured chunking (400 tokens, 50 overlap)
"""

import os
import tiktoken
from openai import OpenAI
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text, func
import logging

from ..database import SessionLocal
from ..models.document_chunk import DocumentChunk

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Manages vector embeddings and retrieval for patient documents using pgvector."""
    
    def __init__(self, openai_api_key: Optional[str] = None):
        """
        Initialize the vector store service.
        
        Args:
            openai_api_key: OpenAI API key for embeddings
        """
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OpenAI API key is required for vector embeddings")
        
        self.openai_client = OpenAI(api_key=self.openai_api_key)
        
        # Tokenizer for chunking
        self.encoding = tiktoken.encoding_for_model("gpt-4")
        
        # Chunking parameters
        self.chunk_size = 400  # tokens
        self.chunk_overlap = 50  # tokens
        
        # Embedding model
        self.embedding_model = "text-embedding-3-large"
        self.embedding_dimension = 3072  # text-embedding-3-large dimension
    
    def _chunk_text(self, text: str, document_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Chunk text into smaller pieces with overlap.
        
        Args:
            text: The text to chunk
            document_metadata: Metadata about the document (id, type, date, etc.)
        
        Returns:
            List of chunk dictionaries with text and metadata
        """
        if not text or not text.strip():
            return []
        
        # Tokenize the text
        tokens = self.encoding.encode(text)
        
        chunks = []
        start = 0
        chunk_index = 0
        
        while start < len(tokens):
            # Get chunk tokens
            end = start + self.chunk_size
            chunk_tokens = tokens[start:end]
            
            # Decode back to text
            chunk_text = self.encoding.decode(chunk_tokens)
            
            # Create chunk with metadata
            chunk = {
                "text": chunk_text,
                "metadata": {
                    **document_metadata,
                    "chunk_index": chunk_index,
                    "chunk_start_token": start,
                    "chunk_end_token": end,
                    "total_tokens": len(chunk_tokens)
                }
            }
            
            chunks.append(chunk)
            
            # Move to next chunk with overlap
            start = start + self.chunk_size - self.chunk_overlap
            chunk_index += 1
        
        logger.info(f"Chunked document {document_metadata.get('document_id')} into {len(chunks)} chunks")
        return chunks
    
    def _get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts using OpenAI.
        
        Args:
            texts: List of text strings to embed
        
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        try:
            response = self.openai_client.embeddings.create(
                model=self.embedding_model,
                input=texts
            )
            
            embeddings = [item.embedding for item in response.data]
            logger.info(f"Generated {len(embeddings)} embeddings")
            return embeddings
        
        except Exception as e:
            logger.error(f"Error generating embeddings: {str(e)}")
            raise
    
    
    def add_document(
        self, 
        patient_id: int, 
        document_id: int,
        text: str,
        document_metadata: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Add a document to the patient's vector database.
        
        Args:
            patient_id: Patient ID
            document_id: Document ID
            text: Extracted text from the document
            document_metadata: Additional metadata (type, date, filename, etc.)
        
        Returns:
            Number of chunks added
        """
        if not text or not text.strip():
            logger.warning(f"No text provided for document {document_id}")
            return 0
        
        # Prepare metadata
        metadata = {
            "patient_id": patient_id,
            "document_id": document_id,
            **(document_metadata or {})
        }
        
        # Chunk the document
        chunks = self._chunk_text(text, metadata)
        
        if not chunks:
            logger.warning(f"No chunks created for document {document_id}")
            return 0
        
        # Generate embeddings for all chunks
        chunk_texts = [chunk["text"] for chunk in chunks]
        embeddings = self._get_embeddings(chunk_texts)
        
        # Store chunks in database
        db = SessionLocal()
        try:
            for i, chunk in enumerate(chunks):
                chunk_metadata = chunk["metadata"]
                
                # Create DocumentChunk record
                db_chunk = DocumentChunk(
                    patient_id=patient_id,
                    document_id=document_id,
                    extraction_id=chunk_metadata.get("extraction_id"),
                    chunk_text=chunk["text"],
                    chunk_index=chunk_metadata["chunk_index"],
                    chunk_start_token=chunk_metadata["chunk_start_token"],
                    chunk_end_token=chunk_metadata["chunk_end_token"],
                    total_tokens=chunk_metadata["total_tokens"],
                    document_type=chunk_metadata.get("document_type"),
                    original_filename=chunk_metadata.get("original_filename"),
                    upload_date=chunk_metadata.get("upload_date"),
                    extraction_method=chunk_metadata.get("extraction_method"),
                    embedding=embeddings[i]
                )
                db.add(db_chunk)
            
            db.commit()
            logger.info(f"Added {len(chunks)} chunks from document {document_id} to patient {patient_id}'s vector store")
            return len(chunks)
        
        except Exception as e:
            db.rollback()
            logger.error(f"Error adding document chunks: {str(e)}")
            raise
        finally:
            db.close()
    
    def delete_document(self, patient_id: int, document_id: int) -> bool:
        """
        Remove a document's chunks from the patient's vector database.
        
        Args:
            patient_id: Patient ID
            document_id: Document ID to remove
        
        Returns:
            True if successful
        """
        db = SessionLocal()
        try:
            # Delete all chunks for this document
            deleted_count = db.query(DocumentChunk).filter(
                DocumentChunk.patient_id == patient_id,
                DocumentChunk.document_id == document_id
            ).delete()
            
            db.commit()
            logger.info(f"Deleted {deleted_count} chunks from document {document_id}")
            return True
        
        except Exception as e:
            db.rollback()
            logger.error(f"Error deleting document {document_id}: {str(e)}")
            return False
        finally:
            db.close()
    
    def search(
        self, 
        patient_id: int, 
        query: str, 
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for relevant document chunks for a patient using cosine similarity.
        
        Args:
            patient_id: Patient ID
            query: Search query
            top_k: Number of results to return
            filter_metadata: Optional metadata filters (e.g., document_type)
        
        Returns:
            List of relevant chunks with metadata and similarity scores
        """
        db = SessionLocal()
        try:
            # Generate embedding for the query
            query_embedding = self._get_embeddings([query])[0]
            
            # Build base query with distance calculation
            # Calculate cosine distance and include it in results
            distance_expr = DocumentChunk.embedding.cosine_distance(query_embedding).label('distance')
            
            query_obj = db.query(
                DocumentChunk,
                distance_expr
            ).filter(
                DocumentChunk.patient_id == patient_id
            )
            
            # Apply metadata filters if provided
            if filter_metadata:
                if "document_type" in filter_metadata:
                    query_obj = query_obj.filter(
                        DocumentChunk.document_type == filter_metadata["document_type"]
                    )
                if "document_id" in filter_metadata:
                    query_obj = query_obj.filter(
                        DocumentChunk.document_id == filter_metadata["document_id"]
                    )
            
            # Perform vector similarity search using cosine distance
            # Order by cosine distance (smaller = more similar)
            results = query_obj.order_by(distance_expr).limit(top_k).all()
            
            # Format results
            chunks = []
            for chunk, distance in results:
                # Calculate cosine similarity (1 - cosine distance)
                # pgvector cosine_distance returns values from 0 to 2
                # where 0 = identical, 1 = orthogonal, 2 = opposite
                similarity = 1 - (distance / 2)  # Normalize to 0-1 range
                
                chunk_data = {
                    "text": chunk.chunk_text,
                    "metadata": {
                        "patient_id": chunk.patient_id,
                        "document_id": chunk.document_id,
                        "extraction_id": chunk.extraction_id,
                        "chunk_index": chunk.chunk_index,
                        "chunk_start_token": chunk.chunk_start_token,
                        "chunk_end_token": chunk.chunk_end_token,
                        "total_tokens": chunk.total_tokens,
                        "document_type": chunk.document_type,
                        "original_filename": chunk.original_filename,
                        "upload_date": chunk.upload_date.isoformat() if chunk.upload_date else None,
                        "extraction_method": chunk.extraction_method
                    },
                    "distance": float(distance),
                    "similarity": float(similarity)
                }
                chunks.append(chunk_data)
            
            logger.info(f"Found {len(chunks)} relevant chunks for patient {patient_id}")
            return chunks
        
        except Exception as e:
            logger.error(f"Error searching for patient {patient_id}: {str(e)}")
            return []
        finally:
            db.close()
    
    def get_patient_stats(self, patient_id: int) -> Dict[str, Any]:
        """
        Get statistics about a patient's vector database.
        
        Args:
            patient_id: Patient ID
        
        Returns:
            Dictionary with stats (document count, chunk count, etc.)
        """
        db = SessionLocal()
        try:
            # Count total chunks
            total_chunks = db.query(DocumentChunk).filter(
                DocumentChunk.patient_id == patient_id
            ).count()
            
            # Count unique documents
            total_documents = db.query(func.count(func.distinct(DocumentChunk.document_id))).filter(
                DocumentChunk.patient_id == patient_id
            ).scalar() or 0
            
            return {
                "patient_id": patient_id,
                "total_chunks": total_chunks,
                "total_documents": total_documents,
                "collection_name": f"patient_{patient_id}_docs"
            }
        
        except Exception as e:
            logger.error(f"Error getting stats for patient {patient_id}: {str(e)}")
            return {
                "patient_id": patient_id,
                "error": str(e)
            }
        finally:
            db.close()
    
    def delete_patient_collection(self, patient_id: int) -> bool:
        """
        Delete all vector data for a patient.
        
        Args:
            patient_id: Patient ID
        
        Returns:
            True if successful
        """
        db = SessionLocal()
        try:
            # Delete all chunks for this patient
            deleted_count = db.query(DocumentChunk).filter(
                DocumentChunk.patient_id == patient_id
            ).delete()
            
            db.commit()
            logger.info(f"Deleted {deleted_count} chunks for patient {patient_id}")
            return True
        
        except Exception as e:
            db.rollback()
            logger.error(f"Error deleting collection for patient {patient_id}: {str(e)}")
            return False
        finally:
            db.close()


# Global instance (initialized when needed)
_vector_store_instance: Optional[VectorStoreService] = None


def get_vector_store() -> VectorStoreService:
    """Get or create the global vector store instance."""
    global _vector_store_instance
    
    if _vector_store_instance is None:
        _vector_store_instance = VectorStoreService()
    
    return _vector_store_instance
