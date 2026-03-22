import os


class Config:
    """Application configuration."""

    BASE_DIR = os.path.dirname(__file__)
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB
    ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp', 'ico', 'svg'}
    TARGET_IMAGE_FORMATS = {'WEBP', 'PNG', 'JPEG', 'BMP', 'TIFF', 'ICO'}
    ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'docx', 'md', 'html', 'htm', 'txt'}
    DOCUMENT_CONVERSIONS = {
        'pdf-to-docx', 'docx-to-pdf',
        'pdf-to-images', 'images-to-pdf',
        'md-to-pdf', 'md-to-html',
        'html-to-pdf', 'txt-to-pdf',
    }
    MAX_PDF_PAGES = 50
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    FILE_TTL_SECONDS = 3600  # 1 hour
