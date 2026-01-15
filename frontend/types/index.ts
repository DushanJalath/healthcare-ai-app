// ... (Previous types remain the same)

// File Upload Types
export interface FileUploadProgress {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface DocumentUploadRequest {
  patient_id?: number;
  document_type?: DocumentType;
  notes?: string;
}

// API Response Types (Updated)
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  page: number;
  per_page: number;
}

export interface PatientListResponse {
  patients: Patient[];
  total: number;
  page: number;
  per_page: number;
}

// ... existing types ...

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