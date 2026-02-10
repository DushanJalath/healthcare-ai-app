from datetime import timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User,UserRole
from ..models.clinic import Clinic
from ..models.patient import Patient
from ..schemas.auth import LoginRequest, RegisterRequest
from ..schemas.user import Token, UserResponse, RefreshTokenRequest, RefreshTokenResponse
from ..utils.auth import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_refresh_token
from ..utils.deps import get_current_active_user
from ..config import settings

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", response_model=UserResponse)
async def register(
    user_data: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user."""
    # Check if user exists
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate clinic license for clinic staff
    clinic_id = None
    if user_data.role == UserRole.CLINIC_STAFF:
        if not user_data.clinic_license:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Clinic license number required for clinic staff"
            )
        # Find clinic by license number
        db_clinic = db.query(Clinic).filter(Clinic.license_number == user_data.clinic_license).first()
        if not db_clinic:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clinic not found with the provided license number"
            )
        if not db_clinic.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Clinic is not active"
            )
        clinic_id = db_clinic.id
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        clinic_id=clinic_id  # Set clinic_id for clinic staff
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Create clinic if user is clinic admin
    if user_data.role == UserRole.CLINIC_ADMIN:
        if not user_data.clinic_name or not user_data.clinic_license:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Clinic name and license required for clinic admin"
            )
        
        db_clinic = Clinic(
            name=user_data.clinic_name,
            license_number=user_data.clinic_license,
            admin_user_id=db_user.id
        )
        db.add(db_clinic)
        db.commit()
        db.refresh(db_clinic)
        
        # Update user with clinic_id
        db_user.clinic_id = db_clinic.id
        db.commit()
        db.refresh(db_user)
    
    # Create patient profile if user is patient
    if user_data.role == UserRole.PATIENT:
        # Generate a unique patient_id
        patient_id = f"PAT-{uuid.uuid4().hex[:8].upper()}"
        db_patient = Patient(
            user_id=db_user.id,
            patient_id=patient_id
        )
        db.add(db_patient)
        db.commit()
    
    return UserResponse.from_orm(db_user)

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Authenticate user and return access token."""
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "user": UserResponse.from_orm(user)
    }


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_access_token(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Exchange refresh token for new access token to persist session."""
    email = verify_refresh_token(refresh_data.refresh_token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


@router.post("/login/json", response_model=Token)
async def login_json(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """JSON login endpoint for frontend."""
    user = db.query(User).filter(User.email == login_data.email).first()
    
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "user": UserResponse.from_orm(user)
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user profile."""
    return UserResponse.from_orm(current_user)

@router.post("/fix-patient-profile")
async def fix_patient_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create missing patient profile for patient users."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for patient users"
        )
    
    # Check if patient profile already exists
    existing_patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if existing_patient:
        return {"message": "Patient profile already exists", "patient_id": existing_patient.patient_id}
    
    # Create patient profile
    patient_id = f"PAT-{uuid.uuid4().hex[:8].upper()}"
    db_patient = Patient(
        user_id=current_user.id,
        patient_id=patient_id
    )
    db.add(db_patient)
    db.commit()
    
    return {"message": "Patient profile created", "patient_id": patient_id}