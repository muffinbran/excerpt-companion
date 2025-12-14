from pydantic import BaseModel, Field
from typing import List, Optional


class NoteModel(BaseModel):
    pitch: str = Field(..., description="The pitch of the note (e.g., C4, D#5)")
    duration_quarter: float = Field(
        ..., description="Duration of the note in quarter lengths"
    )
    offset: float = Field(..., description="Offset of the note in quarter lengths")


class RestModel(BaseModel):
    duration_quarter: float = Field(
        ..., description="Duration of the rest in quarter lengths"
    )
    offset: float = Field(..., description="Offset of the rest in quarter lengths")


NoteOrRest = NoteModel | RestModel


class ExcerptModel(BaseModel):
    # Keep ID as a string for minimal compatibility (can be UUID string)
    id: str = Field(..., description="The unique identifier of the excerpt")
    # source_path is useful for debugging but optional for a minimal build
    source_path: Optional[str] = Field(
        None, description="The source path of the excerpt file"
    )
    title: str = Field(..., description="The title of the excerpt")
    notes_and_rests: List[NoteOrRest] = Field(
        ..., description="List of notes and rests in the excerpt"
    )
    composer: Optional[str] = Field(None, description="The composer of the excerpt")
    duration: Optional[float] = Field(
        None, description="Total duration of the excerpt in quarter lengths"
    )
    key_signature: Optional[str] = Field(
        None, description="Key signature of the excerpt"
    )
    time_signature: Optional[str] = Field(
        None, description="Time signature of the excerpt"
    )
    tempo: Optional[int] = Field(None, description="Tempo of the excerpt in BPM")
