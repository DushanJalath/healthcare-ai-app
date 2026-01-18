from sqlalchemy import Column, Integer, DateTime, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class PatientClinic(Base):
    """
    Junction table for many-to-many relationship between Patients and Clinics.
    Tracks which clinics a patient is registered with.
    """
    __tablename__ = "patient_clinics"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    enrolled_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)  # Allow soft disenrollment
    notes = Column(Text, nullable=True)  # Optional: reason for enrollment, special notes
    
    # Ensure a patient can only be enrolled once per clinic
    __table_args__ = (
        UniqueConstraint('patient_id', 'clinic_id', name='uq_patient_clinic'),
    )
    
    # Relationships
    patient = relationship("Patient", back_populates="clinic_memberships")
    clinic = relationship("Clinic", back_populates="patient_memberships")
