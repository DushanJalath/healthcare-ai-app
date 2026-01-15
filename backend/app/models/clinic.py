from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Clinic(Base):
    __tablename__ = "clinics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    license_number = Column(String, unique=True, nullable=False)
    address = Column(Text)
    phone = Column(String)
    email = Column(String)
    admin_user_id = Column(Integer, ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    users = relationship("User", back_populates="clinic")
    patients = relationship("Patient", back_populates="clinic")
    documents = relationship("Document", back_populates="clinic")