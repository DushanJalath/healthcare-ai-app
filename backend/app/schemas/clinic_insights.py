from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ClinicInsightsChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ClinicInsightsChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    chat_history: Optional[List[ClinicInsightsChatTurn]] = None


class ClinicInsightsChatResponse(BaseModel):
    answer: str
    """Natural-language reply with aggregate information only (no patient identifiers)."""
