-- Migration: Add performance indexes for frequently queried columns
-- This migration adds indexes to improve query performance on commonly filtered columns

-- Indexes for documents table (most frequently queried)
CREATE INDEX IF NOT EXISTS ix_documents_patient_id ON documents(patient_id);
CREATE INDEX IF NOT EXISTS ix_documents_clinic_id ON documents(clinic_id);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_upload_date ON documents(upload_date);
CREATE INDEX IF NOT EXISTS ix_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS ix_documents_patient_clinic ON documents(patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS ix_documents_patient_status ON documents(patient_id, status);
CREATE INDEX IF NOT EXISTS ix_documents_clinic_status ON documents(clinic_id, status);

-- Indexes for patients table
CREATE INDEX IF NOT EXISTS ix_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS ix_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS ix_patients_date_of_birth ON patients(date_of_birth);
CREATE INDEX IF NOT EXISTS ix_patients_gender ON patients(gender);
CREATE INDEX IF NOT EXISTS ix_patients_created_at ON patients(created_at);

-- Composite index for common patient queries
CREATE INDEX IF NOT EXISTS ix_patients_clinic_created ON patients(clinic_id, created_at);

-- Indexes for audit_logs table (if it exists and is frequently queried)
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_patient_id ON audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS ix_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_created ON audit_logs(user_id, created_at);

-- Index for patient_clinics composite queries
CREATE INDEX IF NOT EXISTS ix_patient_clinics_clinic_active ON patient_clinics(clinic_id, is_active);
CREATE INDEX IF NOT EXISTS ix_patient_clinics_patient_active ON patient_clinics(patient_id, is_active);
