from sqlalchemy import Column, Integer, String, Date, Text, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from ..database import Base

class Gender(enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=True)  # Deprecated: kept for backward compatibility during migration
    patient_id = Column(String, unique=True, index=True)  # Hospital patient ID (unique across all clinics)
    date_of_birth = Column(Date)
    gender = Column(Enum(Gender))
    phone = Column(String)
    address = Column(Text)
    emergency_contact_name = Column(String)
    emergency_contact_phone = Column(String)
    medical_history = Column(Text)
    allergies = Column(Text)
    current_medications = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    # Many-to-many relationship with clinics via PatientClinic junction table
    clinic_memberships = relationship("PatientClinic", back_populates="patient", cascade="all, delete-orphan")
    # Legacy one-to-many relationship (deprecated, kept for backward compatibility during migration)
    clinic = relationship("Clinic", back_populates="patients")
    documents = relationship("Document", back_populates="patient")
    extractions = relationship("Extraction", back_populates="patient")
    # Public share links for this patient's medical records
    share_links = relationship(
        "MedicalRecordShareLink",
        back_populates="patient",
        cascade="all, delete-orphan"
    )
    
    # Helper properties for backward compatibility and convenience
    @property
    def clinic_ids(self):
        """Get list of active clinic IDs from memberships."""
        return [membership.clinic_id for membership in self.clinic_memberships if membership.is_active]
    
    @property
    def clinics(self):
        """Get list of active clinics from memberships."""
        return [membership.clinic for membership in self.clinic_memberships if membership.is_active]