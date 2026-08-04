from pydantic import BaseModel, Field


class LayoutGenerateRequest(BaseModel):
    project_id: str = Field(min_length=1)
    prompt: str = Field(min_length=10)
