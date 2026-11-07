import os
import re
import logging
from django.utils.timezone import now
from .models import UploadedDocument, ExtractedDocumentContent

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.txt', '.md'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB in bytes


def validate_document_file(file_obj):
    """
    Validates uploaded file extension and size.
    Raises ValueError on invalid file.
    """
    name = file_obj.name.lower()
    _, ext = os.path.splitext(name)

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file format '{ext}'. Allowed formats: PDF, DOCX, TXT, MD.")

    if file_obj.size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE // (1024 * 1024)
        raise ValueError(f"File size exceeds maximum limit of {max_mb} MB.")

    return ext.lstrip('.')


def clean_extracted_text(text: str) -> str:
    """
    Cleans and normalizes extracted text.
    Removes null bytes, excess consecutive blank lines, and normalizes spacing.
    """
    if not text:
        return ""
    # Strip null bytes and control chars
    text = text.replace('\x00', '')
    # Normalize multiple blank lines to at most two
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Strip leading/trailing whitespace
    return text.strip()


def extract_text_from_file(file_path: str, file_type: str) -> tuple[str, int]:
    """
    Extracts text content and page/section count from a file on disk.
    Returns (cleaned_text, page_count).
    """
    cleaned_type = file_type.lower().strip('.')

    if cleaned_type == 'pdf':
        import pypdf
        reader = pypdf.PdfReader(file_path)
        page_count = len(reader.pages)
        pages_text = []
        for i, page in enumerate(reader.pages):
            extracted = page.extract_text()
            if extracted:
                pages_text.append(extracted)
        raw_text = "\n\n".join(pages_text)
        return clean_extracted_text(raw_text), max(page_count, 1)

    elif cleaned_type == 'docx':
        import docx
        doc = docx.Document(file_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    paragraphs.append(row_text)
        raw_text = "\n\n".join(paragraphs)
        return clean_extracted_text(raw_text), 1

    elif cleaned_type in ('txt', 'md'):
        for encoding in ('utf-8', 'utf-8-sig', 'latin-1'):
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    raw_text = f.read()
                return clean_extracted_text(raw_text), 1
            except UnicodeDecodeError:
                continue
        raise ValueError("Could not decode text file with supported encodings (UTF-8, Latin-1).")

    else:
        raise ValueError(f"No text extractor configured for file type: {file_type}")


def process_document(document: UploadedDocument) -> UploadedDocument:
    """
    Processes an uploaded document:
    1. Sets status to 'processing'
    2. Runs file-specific text extraction
    3. Cleans text & computes metrics
    4. Creates/updates ExtractedDocumentContent
    5. Sets status to 'completed' or 'failed'
    """
    document.status = 'processing'
    document.error_message = None
    document.save(update_fields=['status', 'error_message', 'updated_at'])

    try:
        if not document.file or not os.path.isfile(document.file.path):
            raise FileNotFoundError("Stored document file could not be located on disk.")

        extracted_text, page_count = extract_text_from_file(
            file_path=document.file.path,
            file_type=document.file_type
        )

        words = len(extracted_text.split()) if extracted_text else 0
        chars = len(extracted_text)

        ExtractedDocumentContent.objects.update_or_create(
            document=document,
            defaults={
                'text_content': extracted_text,
                'word_count': words,
                'char_count': chars,
                'page_count': page_count,
                'extracted_at': now(),
            }
        )

        document.status = 'completed'
        document.error_message = None
        document.save(update_fields=['status', 'error_message', 'updated_at'])
        logger.info(f"Successfully processed document {document.id} ({document.original_name})")

    except Exception as e:
        logger.error(f"Error processing document {document.id}: {str(e)}", exc_info=True)
        document.status = 'failed'
        document.error_message = str(e)
        document.save(update_fields=['status', 'error_message', 'updated_at'])

    return document

