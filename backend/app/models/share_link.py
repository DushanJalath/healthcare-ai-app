from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base


class MedicalRecordShareLink(Base):
    """
    Public share link for a patient's medical records.

    A random token is used as the public identifier. Anyone with the token
    can view the patient's documents until the link expires or is revoked.
    """

    __tablename__ = "medical_record_share_links"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    token = Column(String(128), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    view_count = Column(Integer, default=0, nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="share_links")

