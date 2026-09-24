from pydantic import BaseModel, Field


class ValidationIssue(BaseModel):
    field: str
    code: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[ValidationIssue] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorDetail
