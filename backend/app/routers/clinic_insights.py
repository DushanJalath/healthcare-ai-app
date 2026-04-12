from fastapi import APIRouter, Depends, HTTPException, Request, status

from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.clinic_insights import (
    ClinicInsightsChatRequest,
    ClinicInsightsChatResponse,
)
from ..services.clinic_insights import run_clinic_insights_chat
from ..utils.audit import get_audit_logger
from ..models.audit_log import AuditAction, AuditEntityType
from ..utils.deps import require_clinic_access
from ..models.user import User
from .clinic import get_user_clinic

router = APIRouter(prefix="/clinic/insights", tags=["clinic-insights"])


@router.post("/chat", response_model=ClinicInsightsChatResponse)
async def clinic_insights_chat(
    body: ClinicInsightsChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinic_access),
):
    """
    Privacy-oriented assistant for clinic staff and admins: answers with aggregate
    numbers only (no patient names). Condition counts use medical history plus
    conditions extracted from processed documents.
    """
    clinic = get_user_clinic(current_user, db)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        )

    history = None
    if body.chat_history:
        history = [t.model_dump() for t in body.chat_history]

    answer, classified = run_clinic_insights_chat(
        db,
        clinic.id,
        clinic.name,
        body.question.strip(),
        history,
    )

    audit_logger = get_audit_logger(db)
    audit_logger.log(
        action=AuditAction.VIEW,
        entity_type=AuditEntityType.CLINIC,
        entity_id=clinic.id,
        entity_name=clinic.name,
        user=current_user,
        clinic_id=clinic.id,
        description="Clinic insights chat aggregate query",
        request=request,
        extra_metadata={
            "intent": classified.intent,
            "condition_query": classified.condition_query,
        },
        success=True,
    )

    return ClinicInsightsChatResponse(answer=answer)
