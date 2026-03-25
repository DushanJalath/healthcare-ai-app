import enum

from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey, Enum,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from ..database import Base


class MedicalEntryStatus(enum.Enum):
    ONGOING = "ongoing"
    RESOLVED = "resolved"
    CHRONIC = "chronic"


class MedicalHistoryEntry(Base):
    """
    A single medical episode in a patient's history, similar to a LinkedIn
    "experience" entry.  Each row captures one condition / treatment period
    with its medications, treating clinic, and date range.
    """

    __tablename__ = "medical_history_entries"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)

    title = Column(String(255), nullable=False)
    condition = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    medications = Column(Text, nullable=True)
    treating_doctor = Column(String(255), nullable=True)

    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True)
    clinic_name = Column(String(255), nullable=True)

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(Enum(MedicalEntryStatus), default=MedicalEntryStatus.RESOLVED, nullable=False)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="medical_history_entries")
    clinic = relationship("Clinic", foreign_keys=[clinic_id])
    creator = relationship("User", foreign_keys=[created_by])
