from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base


class PatientDocumentCondition(Base):
    """
    Condition phrases extracted from processed documents (e.g. OCR text).
    Used for aggregate clinic queries without enumerating a global disease taxonomy.
    Rows are replaced when the same document is re-processed.
    """

    __tablename__ = "patient_document_conditions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    extraction_id = Column(Integer, ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    condition_label = Column(String(512), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    patient = relationship("Patient", back_populates="document_conditions")
    document = relationship("Document", back_populates="document_conditions")
    extraction = relationship("Extraction", back_populates="document_conditions")
