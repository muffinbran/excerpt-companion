from music21 import converter, note
from pathlib import Path

from app.schemas.excerpt_model import ExcerptModel
from app.utils.ids import id_for_path


def get_project_root() -> Path:
    """Return the project's root directory.
    Uses the file location to compute the project root.
    """
    return Path(__file__).resolve().parents[3]


def get_excerpts_dir() -> Path:
    """Return the project's data/excerpts directory.
    Uses the file location to compute the project root.
    """
    return get_project_root() / "data" / "excerpts"


def _token_from_music21(obj) -> dict:
    """Convert a music21 Note or Rest to a serializable dict matching NoteModel/RestModel."""
    if isinstance(obj, note.Rest):
        return {
            "pitch": "rest",
            "duration_quarter": float(obj.duration.quarterLength),
            "offset": float(obj.offset),
        }
    if isinstance(obj, note.Note):
        pitch = obj.pitch.nameWithOctave if obj.pitch is not None else ""
        return {
            "pitch": pitch,
            "duration_quarter": float(obj.duration.quarterLength),
            "offset": float(obj.offset),
        }
    # fallback
    return {"pitch": str(obj), "duration_quarter": 0.0, "offset": 0.0}


def parse_excerpt(file_path: Path) -> ExcerptModel | None:
    """Parse a MusicXML file and return its notes and rests."""
    project_root = get_project_root()
    excerpt_id = id_for_path(file_path, project_root)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    try:
        score = converter.parse(str(file_path))
        notes_and_rests = [
            _token_from_music21(n) for n in score.recurse().notesAndRests
        ]

        # safe tempo lookup
        tempo_marks = score.metronomeMarkBoundaries()
        tempo = (
            int(tempo_marks[0][2].getQuarterBPM())
            if tempo_marks and tempo_marks[0][2]
            else None
        )

        return ExcerptModel(
            id=str(excerpt_id),
            source_path=str(file_path.relative_to(project_root)),
            title=(
                score.metadata.title
                if score.metadata and score.metadata.title
                else "Unknown Title"
            ),
            notes_and_rests=notes_and_rests,
            composer=(
                score.metadata.composer
                if score.metadata and score.metadata.composer
                else "Unknown Composer"
            ),
            duration=score.duration.quarterLength,
            key_signature=str(score.analyze("key")),
            time_signature=(
                str(score.flat.getTimeSignatures()[0])
                if score.flat.getTimeSignatures()
                else "Unknown Time Signature"
            ),
            tempo=tempo,
        )
    except Exception as e:
        raise ValueError(f"Error parsing MusicXML file: {e}")


EXCERPTS_DIR = get_excerpts_dir()

# Testing (will clean up later)
if __name__ == "__main__":
    example_file = EXCERPTS_DIR / "Mozart Exposition (clarinet).mxl"
    score = converter.parse(str(example_file))
    excerpt = parse_excerpt(example_file)
    print(excerpt)
