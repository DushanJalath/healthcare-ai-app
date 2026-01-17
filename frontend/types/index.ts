// User and Authentication Types
export enum UserRole {
  ADMIN = 'admin',
  CLINIC_ADMIN = 'clinic_admin',
  CLINIC_STAFF = 'clinic_staff',
  PATIENT = 'patient'
}

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: UserRole
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  first_name: string
  last_name: string
  role: UserRole
  clinic_name?: string
  clinic_license?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

// Patient Types
export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say'
}

export interface Patient {
  id: number
  user_id: number
  clinic_id: number
  patient_id: string
  date_of_birth: string
  gender: Gender
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  medical_history: string
  allergies: string
  current_medications: string
  created_at: string
  updated_at: string
}

// Document Types
export enum DocumentType {
  MEDICAL_REPORT = 'medical_report',
  LAB_RESULT = 'lab_result',
  PRESCRIPTION = 'prescription',
  IMAGING = 'imaging',
  REFERRAL = 'referral',
  OTHER = 'other'
}

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Document {
  id: number
  patient_id: number
  clinic_id: number
  uploaded_by: number
  document_type: DocumentType
  status: DocumentStatus
  filename: string
  file_path: string
  file_size: number
  mime_type: string
  checksum: string
  notes?: string
  processed_at?: string
  created_at: string
  updated_at: string
}

// Extraction Types
export interface Extraction {
  id: number
  document_id: number
  patient_id: number
  extracted_data: Record<string, any>
  confidence_score?: number
  reviewed_by?: number
  reviewed_at?: string
  created_at: string
}

// Clinic Types
export interface Clinic {
  id: number
  name: string
  license_number: string
  address?: string
  phone?: string
  email?: string
  admin_user_id: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// File Upload Types
export interface FileUploadProgress {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export interface DocumentUploadRequest {
  patient_id?: number
  document_type?: DocumentType
  notes?: string
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

export interface DocumentListResponse {
  documents: Document[]
  total: number
  page: number
  per_page: number
}

export interface PatientListResponse {
  patients: Patient[]
  total: number
  page: number
  per_page: number
}

// Clinic Dashboard Types
export interface ClinicDashboardStats {
  total_patients: number
  total_documents: number
  documents_this_month: number
  patients_this_month: number
  storage_used: number
  processing_queue: number
  recent_activity: Array<{
    type: string
    title: string
    timestamp: string
    icon: string
    color: string
  }>
  popular_document_types: Record<string, number>
  patient_demographics: {
    gender_distribution: Record<string, number>
    age_distribution: Record<string, number>
  }
  system_alerts: Array<{
    type: 'info' | 'warning' | 'error'
    title: string
    message: string
    action?: string
  }>
}

// Enhanced Patient types
export interface PatientDetailResponse extends Patient {
  user_first_name?: string
  user_last_name?: string
  user_email?: string
  clinic_name?: string
  documents_count?: number
  last_visit?: string
}

export interface PatientStatsResponse {
  total_patients: number
  new_patients_this_month: number
  patients_by_gender: Record<string, number>
  patients_by_age_group: Record<string, number>
  patients_with_documents: number
  recent_patients: PatientDetailResponse[]
}

// Audit Types
export interface AuditLog {
  id: number
  user_id: number
  action: string
  resource_type: string
  resource_id?: number
  changes?: Record<string, any>
  ip_address?: string
  user_agent?: string
  created_at: string
}
