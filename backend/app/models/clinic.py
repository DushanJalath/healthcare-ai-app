from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from ..database import Base

class ClinicType(enum.Enum):
    GENERAL_MEDICINE = "general_medicine"
    PAEDIATRIC = "paediatric"
    OBSTETRICS_GYNAECOLOGY = "obstetrics_gynaecology"
    SPECIALIZED_MEDICAL = "specialized_medical"
    SURGICAL = "surgical"

class Clinic(Base):
    __tablename__ = "clinics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    clinic_type = Column(Enum(ClinicType), nullable=True, index=True)  # Optional for backward compatibility
    license_number = Column(String, unique=True, nullable=False)
    address = Column(Text)
    phone = Column(String)
    email = Column(String)
    admin_user_id = Column(Integer, ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    # Users associated with this clinic via clinic_id
    users = relationship("User", primaryjoin="Clinic.id == User.clinic_id", back_populates="clinic")
    # Admin user relationship via admin_user_id  
    admin = relationship("User", foreign_keys=[admin_user_id], uselist=False, post_update=True)
    # Many-to-many relationship with patients via PatientClinic junction table
    patient_memberships = relationship("PatientClinic", back_populates="clinic", cascade="all, delete-orphan")
    # Legacy one-to-many relationship (deprecated, kept for backward compatibility during migration)
    patients = relationship("Patient", back_populates="clinic")
    documents = relationship("Document", back_populates="clinic")