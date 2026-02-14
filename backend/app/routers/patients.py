from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timedelta, date
from pydantic import BaseModel
import os

from openai import OpenAI

from ..database import get_db
from ..models.patient import Patient, Gender
from ..models.user import User, UserRole
from ..models.clinic import Clinic
from ..models.patient_clinic import PatientClinic
from ..models.document import Document, DocumentStatus
from ..models.extraction import Extraction, ExtractionStatus
from ..schemas.patient import (
    PatientCreate, PatientUpdate, PatientResponse, PatientDetailResponse,
    PatientListResponse, PatientSearchRequest, PatientStatsResponse
)
from ..utils.deps import get_current_active_user, require_clinic_access
from ..utils.auth import get_password_hash
from ..utils.password import generate_secure_password
from ..utils.email import send_patient_welcome_email

router = APIRouter(prefix="/patients", tags=["patients"])


# ---------------------------------------------------------------------------
# AI Assistant (replaces legacy RAG-style endpoint)
# ---------------------------------------------------------------------------

DEFAULT_SYSTEM_PROMPT = (
    "You are MediKeep Assistant, a helpful and friendly AI assistant for patients.\n"
    "You help patients understand their medical documents and health information "
    "in clear, simple language.\n\n"
    "PERSONALIZATION:\n"
    "- Address the patient by their first name when appropriate to create a warm, personal connection.\n"
    "- When they greet you (e.g., 'Hi', 'Hello'), respond warmly using their name.\n"
    "- Be conversational and empathetic, as you're helping them with their health information.\n\n"
    "IMPORTANT MEDICAL DISCLAIMER:\n"
    "- You are NOT a doctor and do not provide diagnoses or treatment decisions.\n"
    "- Always remind users to consult their healthcare provider for medical advice.\n"
    "- Be concise, friendly, and focus on explaining concepts clearly.\n"
)

DEFAULT_KNOWLEDGE_BASE = (
    "MediKeep is a secure medical document management platform. Patients can:\n"
    "- Store, organize, and view their medical documents (lab reports, prescriptions, imaging, etc.).\n"
    "- See a timeline of uploads and related activity.\n"
    "- Share selected documents with healthcare providers through time-limited links.\n"
    "The assistant can answer general health questions and help interpret common "
    "medical document terms, but it does not see raw medical records content unless "
    "that content is included in the user's question or follow-up messages.\n"
)


class RAGChatTurnModel(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RAGChatRequestModel(BaseModel):
    question: str
    top_k: Optional[int] = None
    chat_history: List[RAGChatTurnModel] = []
    # Optional: allow callers to override system prompt / KB for advanced use-cases
    system_prompt: Optional[str] = None
    knowledge_base: Optional[str] = None


class RAGChatChunkModel(BaseModel):
    content: str
    metadata: Dict[str, Any] = {}


class RAGChatResponseModel(BaseModel):
    answer: str
    chunks: List[RAGChatChunkModel] = []
    used_top_k: int = 0


def _build_patient_knowledge_base(patient_id: int, db: Session) -> str:
    """
    Build patient-specific knowledge base from patient personal data and extracted document texts.
    
    Returns a formatted string containing:
    1. Patient personal information (name, demographics, etc.)
    2. All extracted text from patient's documents, sorted by date (newest first)
    
    This allows the AI to personalize responses and understand temporal context.
    """
    # Get patient information
    patient = db.query(Patient).options(
        joinedload(Patient.user)
    ).filter(Patient.id == patient_id).first()
    
    if not patient:
        return ""
    
    # Build patient profile section
    knowledge_parts = [
        "PATIENT PROFILE:",
        "=" * 70,
        ""
    ]
    
    # Add patient name
    if patient.user:
        first_name = patient.user.first_name or ""
        last_name = patient.user.last_name or ""
        full_name = f"{first_name} {last_name}".strip()
        if full_name:
            knowledge_parts.append(f"Patient Name: {full_name}")
            knowledge_parts.append(f"First Name: {first_name}")
    
    # Add patient ID
    if patient.patient_id:
        knowledge_parts.append(f"Patient ID: {patient.patient_id}")
    
    # Add demographics
    if patient.date_of_birth:
        dob_str = patient.date_of_birth.strftime("%B %d, %Y")
        knowledge_parts.append(f"Date of Birth: {dob_str}")
        
        # Calculate age
        today = date.today()
        age = today.year - patient.date_of_birth.year
        if patient.date_of_birth.month > today.month or \
           (patient.date_of_birth.month == today.month and patient.date_of_birth.day > today.day):
            age -= 1
        knowledge_parts.append(f"Age: {age} years old")
    
    if patient.gender:
        knowledge_parts.append(f"Gender: {patient.gender.value}")
    
    # Add contact information (if available)
    if patient.phone:
        knowledge_parts.append(f"Phone: {patient.phone}")
    
    if patient.user and patient.user.email:
        knowledge_parts.append(f"Email: {patient.user.email}")
    
    if patient.address:
        knowledge_parts.append(f"Address: {patient.address}")
    
    # Add medical information
    if patient.allergies:
        knowledge_parts.append(f"Known Allergies: {patient.allergies}")
    
    if patient.medical_history:
        knowledge_parts.append(f"Medical History: {patient.medical_history}")
    
    if patient.current_medications:
        knowledge_parts.append(f"Current Medications: {patient.current_medications}")
    
    # Add emergency contact
    if patient.emergency_contact_name:
        knowledge_parts.append(f"Emergency Contact: {patient.emergency_contact_name}")
        if patient.emergency_contact_phone:
            knowledge_parts.append(f"Emergency Contact Phone: {patient.emergency_contact_phone}")
    
    knowledge_parts.append("")
    knowledge_parts.append("NOTE: This is the patient you are currently speaking with. Address them by their first name " +
                          "to personalize the conversation and make them feel comfortable.")
    knowledge_parts.append("")
    knowledge_parts.append("=" * 70)
    knowledge_parts.append("")
    
    # Query all completed extractions for this patient, joined with document info
    # Sort by document upload_date DESC to prioritize recent documents
    extractions_query = (
        db.query(Extraction, Document)
        .join(Document, Extraction.document_id == Document.id)
        .filter(
            Extraction.patient_id == patient_id,
            Extraction.status == ExtractionStatus.COMPLETED,
            Extraction.raw_text.isnot(None),
            Extraction.raw_text != ""
        )
        .order_by(desc(Document.upload_date))
        .all()
    )
    
    if not extractions_query:
        # If no documents, still return patient profile
        knowledge_parts.append("No medical documents have been uploaded yet.")
        return "\n".join(knowledge_parts)
    
    # Add documents section
    knowledge_parts.append("PATIENT'S MEDICAL DOCUMENTS (sorted by date, newest first):")
    knowledge_parts.append("=" * 70)
    knowledge_parts.append("")
    knowledge_parts.append("IMPORTANT: When answering questions about time-sensitive data (like lab values, "
                          "sugar levels, blood pressure, etc.), always prioritize the MOST RECENT document dates. "
                          "If asked about 'latest' or 'current' values, use data from the newest documents.")
    knowledge_parts.append("")
    
    for idx, (extraction, document) in enumerate(extractions_query, 1):
        # Format document metadata
        doc_date = document.upload_date.strftime("%B %d, %Y") if document.upload_date else "Unknown date"
        doc_type = document.document_type.value if document.document_type else "Unknown type"
        doc_name = document.original_filename or f"Document {document.id}"
        
        # Add document header
        knowledge_parts.append(f"--- Document {idx} ---")
        knowledge_parts.append(f"Date: {doc_date}")
        knowledge_parts.append(f"Type: {doc_type}")
        knowledge_parts.append(f"Filename: {doc_name}")
        knowledge_parts.append("")
        
        # Add extracted text
        text = extraction.raw_text.strip()
        # Truncate very long documents to avoid token limits (keep first 2000 chars per doc)
        if len(text) > 2000:
            text = text[:2000] + "\n... (document continues)"
        knowledge_parts.append(text)
        knowledge_parts.append("")
        knowledge_parts.append("-" * 70)
        knowledge_parts.append("")
    
    knowledge_parts.append(f"Total documents: {len(extractions_query)}")
    knowledge_parts.append("")
    
    return "\n".join(knowledge_parts)


@router.post("/{patient_id}/rag/chat", response_model=RAGChatResponseModel)
async def patient_ai_chat(
    patient_id: int,
    body: RAGChatRequestModel,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Patient-specific AI assistant chat endpoint.

    This endpoint:
    - Fetches all extracted text from patient's documents (sorted by date, newest first)
    - Builds a date-aware knowledge base that prioritizes recent data
    - Sends the system prompt, patient-specific knowledge base, chat history, 
      and current question to OpenAI
    - Returns the model's answer in a chat-friendly format
    
    The knowledge base includes document dates to help the AI understand temporal 
    context (e.g., latest sugar levels vs older readings).
    """
    # Reuse existing permission checks to ensure the caller can access this patient
    _ = _get_patient_detail(patient_id, db, current_user)

    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI assistant is not configured. Please set OPENAI_API_KEY.",
        )

    client = OpenAI(api_key=openai_api_key)

    # Build patient-specific knowledge base from extracted documents
    patient_knowledge = _build_patient_knowledge_base(patient_id, db)

    # Build system prompt + knowledge base
    system_prompt = DEFAULT_SYSTEM_PROMPT
    if body.system_prompt:
        system_prompt += "\n\nAdditional instructions:\n" + body.system_prompt.strip()

    knowledge_base = DEFAULT_KNOWLEDGE_BASE
    if body.knowledge_base:
        knowledge_base += "\n\nCustom knowledge:\n" + body.knowledge_base.strip()
    
    # Add patient-specific document knowledge
    if patient_knowledge:
        knowledge_base += "\n\n" + patient_knowledge

    system_message = (
        system_prompt
        + "\n\n-----\n"
        + "INTERNAL KNOWLEDGE BASE (do not list verbatim unless useful):\n"
        + knowledge_base
    )

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_message}
    ]

    # Add prior chat history for context
    for turn in body.chat_history or []:
        if turn.content and turn.role in ("user", "assistant"):
            messages.append({"role": turn.role, "content": turn.content})

    # Current user question goes last
    messages.append({"role": "user", "content": body.question})

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.2,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI assistant request failed: {str(e)}",
        )

    answer = completion.choices[0].message.content if completion.choices else ""
    if not answer:
        answer = "I'm sorry, I couldn't generate a helpful answer. Please try asking in a different way."

    # For compatibility with existing frontend types, return chunks/used_top_k
    return RAGChatResponseModel(
        answer=answer,
        chunks=[],
        used_top_k=0,
    )


def _get_next_patient_id_for_clinic(clinic_id: int, db: Session) -> str:
    """Generate next patient ID for the clinic, e.g. C1-0001, C1-0002."""
    prefix = f"C{clinic_id}-"
    # Find max numeric suffix among existing patient_ids with this prefix
    patients_with_prefix = db.query(Patient.patient_id).filter(
        Patient.patient_id.like(f"{prefix}%")
    ).all()
    max_seq = 0
    for (pid,) in patients_with_prefix:
        if pid and pid.startswith(prefix):
            try:
                seq = int(pid[len(prefix):])
                max_seq = max(max_seq, seq)
            except ValueError:
                pass
    return f"{prefix}{max_seq + 1:04d}"

@router.post("", response_model=PatientDetailResponse)
@router.post("/", response_model=PatientDetailResponse)
async def create_patient(
    patient_data: PatientCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Create a new patient with enhanced validation and optional user account creation."""
    
    # Get clinic from user's clinic_id
    if not current_user.clinic_id:
        raise HTTPException(status_code=400, detail="User is not assigned to a clinic")
    
    clinic_id = current_user.clinic_id
    
    # Verify clinic exists and is active
    clinic = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    if not clinic.is_active:
        raise HTTPException(status_code=400, detail="Clinic is not active")
    
    # Handle user account creation/lookup if email is provided
    user_id = patient_data.user_id
    generated_password = None
    existing_user = None
    
    if patient_data.email:
        # Check if user with this email already exists
        existing_user = db.query(User).filter(User.email == patient_data.email).first()
        if existing_user:
            # Check if this user is already a patient
            if existing_user.role != UserRole.PATIENT:
                raise HTTPException(
                    status_code=400, 
                    detail=f"User with email {patient_data.email} already exists with role {existing_user.role}"
                )
            # Use existing user
            user_id = existing_user.id
        else:
            # Create new user account for patient
            if not patient_data.first_name or not patient_data.last_name:
                raise HTTPException(
                    status_code=400,
                    detail="first_name and last_name are required when email is provided"
                )
            
            # Generate secure password
            generated_password = generate_secure_password()
            hashed_password = get_password_hash(generated_password)
            
            # Create user account
            new_user = User(
                email=patient_data.email,
                hashed_password=hashed_password,
                first_name=patient_data.first_name,
                last_name=patient_data.last_name,
                role=UserRole.PATIENT,
                clinic_id=None  # Patients don't belong to a clinic directly
            )
            db.add(new_user)
            db.flush()  # Flush to get the user ID
            user_id = new_user.id
            
            # Schedule email sending in background
            background_tasks.add_task(
                send_patient_welcome_email,
                to_email=patient_data.email,
                first_name=patient_data.first_name,
                password=generated_password
            )
    
    # Validate user association if provided (but not created above)
    if patient_data.user_id and not patient_data.email:
        user = db.query(User).filter(
            User.id == patient_data.user_id,
            User.role == UserRole.PATIENT
        ).first()
        if not user:
            raise HTTPException(status_code=404, detail="Patient user not found")
        user_id = patient_data.user_id
    
    # Find or create patient record
    # Priority: 1) Find by user_id if provided, 2) Find by patient_id
    existing_patient = None
    
    if user_id:
        # First, try to find existing patient by user_id (if user exists)
        existing_patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    
    if not existing_patient and patient_data.patient_id:
        # If not found by user_id, check by patient_id when provided (patient_id is unique globally)
        existing_patient = db.query(Patient).filter(
            Patient.patient_id == patient_data.patient_id
        ).first()
    
    # If patient exists, check if already enrolled in this clinic
    if existing_patient:
        existing_membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == existing_patient.id,
            PatientClinic.clinic_id == clinic_id,
            PatientClinic.is_active == True
        ).first()
        if existing_membership:
            raise HTTPException(status_code=400, detail="Patient is already enrolled in this clinic")
        
        # Patient exists - update user_id if it was just created/linked
        if user_id and existing_patient.user_id != user_id:
            existing_patient.user_id = user_id
        # Update clinic_id for backward compatibility if not set
        if not existing_patient.clinic_id:
            existing_patient.clinic_id = clinic_id
        patient = existing_patient
    else:
        # Create new patient record
        # Auto-generate patient_id per clinic when not provided
        patient_id_value = patient_data.patient_id
        if not patient_id_value or not str(patient_id_value).strip():
            patient_id_value = _get_next_patient_id_for_clinic(clinic_id, db)
        patient_dict = patient_data.dict(exclude={'clinic_id', 'email', 'first_name', 'last_name', 'user_id'})
        patient_dict["patient_id"] = patient_id_value
        patient = Patient(
            **patient_dict,
            clinic_id=clinic_id,  # Set for backward compatibility
            user_id=user_id
        )
        db.add(patient)
        db.flush()  # Flush to get patient.id
    
    # Create PatientClinic membership
    membership = PatientClinic(
        patient_id=patient.id,
        clinic_id=clinic_id,
        is_active=True
    )
    db.add(membership)
    db.commit()
    db.refresh(patient)
    
    # Return detailed response
    return _get_patient_detail(patient.id, db, current_user)

@router.get("", response_model=PatientListResponse)
@router.get("/", response_model=PatientListResponse)
async def get_patients(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    gender: Optional[Gender] = None,
    age_min: Optional[int] = None,
    age_max: Optional[int] = None,
    has_documents: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get patients with enhanced filtering and search."""
    
    # Build base query with eager loading to avoid N+1 queries
    query = db.query(Patient).options(
        joinedload(Patient.user),
        joinedload(Patient.clinic_memberships).joinedload(PatientClinic.clinic)
    )
    
    # Apply role-based filtering
    if current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        if current_user.clinic_id:
            # Filter by active clinic memberships using PatientClinic
            query = query.join(PatientClinic).filter(
                PatientClinic.clinic_id == current_user.clinic_id,
                PatientClinic.is_active == True
            ).distinct()
        else:
            # If user has no clinic_id, return empty result
            query = query.filter(Patient.id == -1)  # Impossible condition
    elif current_user.role == UserRole.PATIENT:
        query = query.filter(Patient.user_id == current_user.id)
    
    # Apply search
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Patient.patient_id.ilike(search_filter),
                Patient.emergency_contact_name.ilike(search_filter),
                Patient.address.ilike(search_filter)
            )
        )
    
    # Apply filters
    if gender:
        query = query.filter(Patient.gender == gender)
    
    if age_min or age_max:
        today = date.today()
        if age_min:
            max_birth_date = today.replace(year=today.year - age_min)
            query = query.filter(Patient.date_of_birth <= max_birth_date)
        if age_max:
            min_birth_date = today.replace(year=today.year - age_max - 1)
            query = query.filter(Patient.date_of_birth >= min_birth_date)
    
    if has_documents is not None:
        if has_documents:
            query = query.filter(Patient.documents.any())
        else:
            query = query.filter(~Patient.documents.any())
    
    # Get total count (before pagination)
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * per_page
    patients = query.offset(offset).limit(per_page).all()
    
    # Optimize: Pre-fetch document counts for all patients in one query
    patient_ids = [p.id for p in patients]
    doc_counts = db.query(
        Document.patient_id,
        func.count(Document.id).label('count')
    ).filter(
        Document.patient_id.in_(patient_ids)
    ).group_by(Document.patient_id).all()
    
    doc_count_map = {pid: count for pid, count in doc_counts}
    
    # Get last document dates in one query
    last_doc_results = db.query(
        Document.patient_id,
        func.max(Document.upload_date).label('last_upload')
    ).filter(
        Document.patient_id.in_(patient_ids)
    ).group_by(Document.patient_id).all()
    
    last_doc_map = {pid: last_upload for pid, last_upload in last_doc_results}
    
    # Build detailed responses using pre-fetched data
    patient_details = []
    for patient in patients:
        detail = _build_patient_detail_optimized(patient, doc_count_map.get(patient.id, 0), last_doc_map.get(patient.id))
        patient_details.append(detail)
    
    return PatientListResponse(
        patients=patient_details,
        total=total,
        page=page,
        per_page=per_page
    )

@router.get("/stats", response_model=PatientStatsResponse)
async def get_patient_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Get patient statistics for clinic dashboard."""
    
    # Get clinic
    clinic = db.query(Clinic).filter(Clinic.admin_user_id == current_user.id).first()
    if not clinic:
        raise HTTPException(status_code=400, detail="Clinic not found")
    
    # Base query for clinic patients using PatientClinic
    base_query = db.query(Patient).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic.id,
        PatientClinic.is_active == True
    ).distinct()
    
    # Total patients
    total_patients = base_query.count()
    
    # New patients this month
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_patients_this_month = base_query.filter(
        Patient.created_at >= month_start
    ).count()
    
    # Patients by gender (using PatientClinic)
    gender_stats = db.query(Patient.gender, func.count(Patient.id)).join(PatientClinic).filter(
        PatientClinic.clinic_id == clinic.id,
        PatientClinic.is_active == True
    ).group_by(Patient.gender).all()
    
    patients_by_gender = {
        str(gender.value) if gender else 'not_specified': count 
        for gender, count in gender_stats
    }
    
    # Patients by age group
    today = date.today()
    age_groups = {
        '0-18': 0, '19-30': 0, '31-50': 0, '51-70': 0, '70+': 0
    }
    
    patients_with_dob = base_query.filter(Patient.date_of_birth.isnot(None)).all()
    for patient in patients_with_dob:
        age = today.year - patient.date_of_birth.year
        if patient.date_of_birth.month > today.month or \
           (patient.date_of_birth.month == today.month and patient.date_of_birth.day > today.day):
            age -= 1
        
        if age <= 18:
            age_groups['0-18'] += 1
        elif age <= 30:
            age_groups['19-30'] += 1
        elif age <= 50:
            age_groups['31-50'] += 1
        elif age <= 70:
            age_groups['51-70'] += 1
        else:
            age_groups['70+'] += 1
    
    # Patients with documents
    patients_with_documents = base_query.filter(Patient.documents.any()).count()
    
    # Recent patients
    recent_patients = base_query.options(
        joinedload(Patient.user)
    ).order_by(Patient.created_at.desc()).limit(5).all()
    
    recent_patient_details = [_build_patient_detail(p, db) for p in recent_patients]
    
    return PatientStatsResponse(
        total_patients=total_patients,
        new_patients_this_month=new_patients_this_month,
        patients_by_gender=patients_by_gender,
        patients_by_age_group=age_groups,
        patients_with_documents=patients_with_documents,
        recent_patients=recent_patient_details
    )

@router.get("/{patient_id}", response_model=PatientDetailResponse)
async def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get patient details with comprehensive information."""
    return _get_patient_detail(patient_id, db, current_user)

@router.put("/{patient_id}", response_model=PatientDetailResponse)
async def update_patient(
    patient_id: int,
    patient_update: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update patient information with validation."""
    
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check permissions
    if current_user.role == UserRole.PATIENT:
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        if not current_user.clinic_id:
            raise HTTPException(status_code=403, detail="Access denied")
        # Check if patient is enrolled in current user's clinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == current_user.clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied: Patient not enrolled in your clinic")
    
    # Update fields
    update_data = patient_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    
    db.commit()
    db.refresh(patient)
    
    return _get_patient_detail(patient.id, db, current_user)

@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access)
):
    """Delete patient (clinic admin only)."""
    
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check clinic permissions
    if not current_user.clinic_id:
        raise HTTPException(status_code=403, detail="Access denied")
    # Check if patient is enrolled in current user's clinic
    membership = db.query(PatientClinic).filter(
        PatientClinic.patient_id == patient.id,
        PatientClinic.clinic_id == current_user.clinic_id,
        PatientClinic.is_active == True
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied: Patient not enrolled in your clinic")
    
    # Check if patient has documents
    document_count = db.query(Document).filter(Document.patient_id == patient.id).count()
    if document_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete patient with {document_count} documents. Delete or reassign documents first."
        )
    
    db.delete(patient)
    db.commit()
    
    return {"message": "Patient deleted successfully"}

def _get_patient_detail(patient_id: int, db: Session, current_user: User) -> PatientDetailResponse:
    """Helper function to get patient with full details."""
    
    query = db.query(Patient).options(
        joinedload(Patient.user),
        joinedload(Patient.clinic),  # For backward compatibility
        joinedload(Patient.clinic_memberships).joinedload(PatientClinic.clinic)
    )
    
    if current_user.role == UserRole.PATIENT:
        patient = query.filter(
            Patient.id == patient_id,
            Patient.user_id == current_user.id
        ).first()
    else:
        patient = query.filter(Patient.id == patient_id).first()
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check clinic permissions for clinic users
    if current_user.role in [UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]:
        if not current_user.clinic_id:
            raise HTTPException(status_code=403, detail="Access denied")
        # Check if patient is enrolled in current user's clinic
        membership = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.clinic_id == current_user.clinic_id,
            PatientClinic.is_active == True
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied: Patient not enrolled in your clinic")
    
    return _build_patient_detail(patient, db)

def _build_patient_detail(patient: Patient, db: Session) -> PatientDetailResponse:
    """Build detailed patient response."""
    
    # Use optimized version if data is already loaded
    return _build_patient_detail_optimized(patient, None, None, db)

def _build_patient_detail_optimized(
    patient: Patient, 
    documents_count: Optional[int] = None,
    last_visit: Optional[datetime] = None,
    db: Optional[Session] = None
) -> PatientDetailResponse:
    """Build detailed patient response with optional pre-fetched data to avoid N+1 queries."""
    
    # Get clinic memberships from already loaded relationship (if available)
    memberships = patient.clinic_memberships if hasattr(patient, 'clinic_memberships') else []
    # Filter active memberships
    active_memberships = [m for m in memberships if m.is_active] if memberships else []
    
    # If memberships not loaded, query them (fallback)
    if not active_memberships and db:
        active_memberships = db.query(PatientClinic).filter(
            PatientClinic.patient_id == patient.id,
            PatientClinic.is_active == True
        ).options(joinedload(PatientClinic.clinic)).all()
    
    # Get clinic IDs and names from memberships
    clinic_ids = [m.clinic_id for m in active_memberships]
    clinic_names = [m.clinic.name for m in active_memberships if m.clinic]
    
    # Get primary clinic (first active membership, or legacy clinic_id)
    primary_clinic = active_memberships[0].clinic if active_memberships else (patient.clinic if hasattr(patient, 'clinic') else None)
    primary_clinic_name = primary_clinic.name if primary_clinic else None
    
    # Get documents count (use pre-fetched if available, otherwise query)
    if documents_count is None and db:
        documents_count = db.query(Document).filter(Document.patient_id == patient.id).count()
    elif documents_count is None:
        documents_count = 0
    
    # Get last document upload date (use pre-fetched if available, otherwise query)
    if last_visit is None and db:
        last_document = db.query(Document).filter(
            Document.patient_id == patient.id
        ).order_by(desc(Document.upload_date)).first()
        last_visit = last_document.upload_date if last_document else None
    
    response_data = PatientResponse.from_orm(patient).dict()
    
    # Add clinic_ids from memberships
    response_data["clinic_ids"] = clinic_ids
    
    # Add additional details
    response_data.update({
        "user_first_name": patient.user.first_name if patient.user else None,
        "user_last_name": patient.user.last_name if patient.user else None,
        "user_email": patient.user.email if patient.user else None,
        "clinic_name": primary_clinic_name,  # Primary clinic for backward compatibility
        "clinic_names": clinic_names,  # All clinic names
        "documents_count": documents_count,
        "last_visit": last_visit
    })
    
    return PatientDetailResponse(**response_data)