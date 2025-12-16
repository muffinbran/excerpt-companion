from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from typing import List
import zipfile
import xml.etree.ElementTree as ET

from app.schemas.excerpt_model import ExcerptModel
from app.services.excerpt_service import get_excerpts_dir, parse_excerpt

router = APIRouter(prefix="/excerpts", tags=["excerpts"])


@router.get("/instruments")
async def get_instruments():
    """Get all available instruments (subdirectories with excerpts)."""
    excerpts_dir = get_excerpts_dir()
    instruments = []

    for item in excerpts_dir.iterdir():
        if item.is_dir() and any(item.glob("*.mxl")):
            instruments.append(item.name.title())  # Capitalize first letter

    return sorted(instruments)


@router.get("/", response_model=List[ExcerptModel])
async def get_all_excerpts():
    """Get all available excerpts."""
    excerpts_dir = get_excerpts_dir()
    excerpts = []

    # Search recursively for .mxl files in subdirectories
    for file_path in excerpts_dir.rglob("*.mxl"):
        try:
            excerpt = parse_excerpt(file_path)
            if excerpt:
                excerpts.append(excerpt)
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            continue

    return excerpts


@router.get("/{excerpt_title}", response_model=ExcerptModel)
async def get_excerpt_by_title(excerpt_title: str):
    """Get a specific excerpt by title."""
    excerpts_dir = get_excerpts_dir()

    # Look for files that match the title (search recursively)
    for file_path in excerpts_dir.rglob("*.mxl"):
        if excerpt_title.lower() in file_path.stem.lower():
            try:
                excerpt = parse_excerpt(file_path)
                if excerpt:
                    return excerpt
            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Error parsing excerpt: {e}"
                )

    raise HTTPException(status_code=404, detail="Excerpt not found")


@router.get("/{excerpt_title}/musicxml")
async def get_excerpt_musicxml(excerpt_title: str):
    """Get the raw MusicXML content for a specific excerpt."""
    excerpts_dir = get_excerpts_dir()

    # Look for files that match the title (search recursively)
    for file_path in excerpts_dir.rglob("*.mxl"):
        if excerpt_title.lower() in file_path.stem.lower():
            try:
                # Extract MusicXML from .mxl file (which is a compressed format)
                with zipfile.ZipFile(file_path, "r") as zip_file:
                    # Look for the main MusicXML file in the archive
                    xml_files = [
                        name for name in zip_file.namelist() if name.endswith(".xml")
                    ]
                    if not xml_files:
                        raise HTTPException(
                            status_code=500, detail="No XML file found in MXL archive"
                        )

                    xml_content = None

                    # Try to find the best MusicXML file
                    for xml_file in xml_files:
                        try:
                            content = zip_file.read(xml_file).decode("utf-8")

                            # Try to parse as XML to validate structure
                            try:
                                root = ET.fromstring(content)
                                # Check for MusicXML root elements
                                if (
                                    root.tag.endswith("score-partwise")
                                    or "score-partwise" in root.tag
                                ):
                                    xml_content = content
                                    print(f"Found partwise MusicXML: {xml_file}")
                                    break
                                elif (
                                    root.tag.endswith("score-timewise")
                                    or "score-timewise" in root.tag
                                ):
                                    xml_content = content
                                    print(f"Found timewise MusicXML: {xml_file}")
                                    break
                            except ET.ParseError:
                                continue

                        except Exception as e:
                            print(f"Error reading {xml_file}: {e}")
                            continue

                    # Fallback to first XML file if no valid MusicXML found
                    if xml_content is None:
                        main_xml = xml_files[0]
                        xml_content = zip_file.read(main_xml).decode("utf-8")
                        print(f"Using fallback XML file: {main_xml}")

                    # Validate that we have some content
                    if not xml_content or len(xml_content.strip()) < 50:
                        raise HTTPException(
                            status_code=500,
                            detail="Extracted XML content is empty or too short",
                        )

                    return Response(
                        content=xml_content,
                        media_type="application/xml",
                        headers={
                            "Content-Disposition": f'inline; filename="{file_path.stem}.xml"'
                        },
                    )

            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Error reading MusicXML: {e}"
                )

    raise HTTPException(status_code=404, detail="Excerpt not found")
