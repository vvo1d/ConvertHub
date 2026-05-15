"""ConvertHub — image converter web service."""

from __future__ import annotations

import atexit
import io
import logging
import os
import threading
import time
import uuid
import zipfile

import magic
from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file,
    send_from_directory,
)
from werkzeug.utils import secure_filename

from config import Config
from converters.image_converter import ConversionError, ValidationError, convert_image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# MIME types considered valid images
_IMAGE_MIMES = {
    'image/png', 'image/jpeg', 'image/gif', 'image/bmp',
    'image/tiff', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon',
    'image/svg+xml',
}

# Map target format -> file extension
_EXT_MAP = {
    'WEBP': '.webp',
    'PNG': '.png',
    'JPEG': '.jpg',
    'BMP': '.bmp',
    'TIFF': '.tiff',
    'ICO': '.ico',
}


def _cleanup_old_files() -> None:
    """Remove uploaded files older than FILE_TTL_SECONDS."""
    ttl = app.config.get('FILE_TTL_SECONDS', 3600)
    upload_dir = app.config['UPLOAD_FOLDER']
    now = time.time()
    for fname in os.listdir(upload_dir):
        if fname == '.gitkeep':
            continue
        fpath = os.path.join(upload_dir, fname)
        if os.path.isfile(fpath) and now - os.path.getmtime(fpath) > ttl:
            try:
                os.remove(fpath)
                logger.info("Cleaned up old file: %s", fname)
            except OSError:
                pass


def _start_cleanup_scheduler(interval: int = 600) -> None:
    """Run _cleanup_old_files() every `interval` seconds in a background thread."""
    stop_event = threading.Event()

    def loop():
        while not stop_event.wait(interval):
            try:
                _cleanup_old_files()
            except Exception:
                logger.exception("Cleanup error")

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    atexit.register(stop_event.set)


_start_cleanup_scheduler()


def _get_ext(filename: str) -> str:
    """Get lowercase file extension without dot."""
    if '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[1].lower()


def _allowed_file(filename: str) -> bool:
    """Check if the file extension is allowed for images."""
    return _get_ext(filename) in app.config['ALLOWED_IMAGE_EXTENSIONS']


def _validate_mime(filepath: str) -> bool:
    """Validate that the file's MIME type is an allowed image type."""
    try:
        mime = magic.from_file(filepath, mime=True)
        return mime in _IMAGE_MIMES
    except Exception:
        return False


# --- Routes ---

@app.route('/')
def index():
    """Main page with conversion categories."""
    return render_template('index.html')


@app.route('/convert/image')
def convert_image_page():
    """Image conversion page."""
    return render_template('convert_image.html')


@app.route('/convert/crop')
def convert_crop_page():
    """Image crop editor page."""
    return render_template('convert_crop.html')


@app.route('/api/convert/image', methods=['POST'])
def api_convert_image():
    """API endpoint for image conversion."""
    _cleanup_old_files()

    # Check file presence
    if 'file' not in request.files:
        return jsonify(success=False, error='Файл не выбран'), 400

    file = request.files['file']
    if file.filename == '' or file.filename is None:
        return jsonify(success=False, error='Файл не выбран'), 400

    if not _allowed_file(file.filename):
        return jsonify(success=False, error='Недопустимый формат файла'), 400

    # Read parameters
    target_format = request.form.get('format', 'WEBP').upper()
    if target_format not in app.config['TARGET_IMAGE_FORMATS']:
        return jsonify(success=False, error=f'Неподдерживаемый формат: {target_format}'), 400

    quality = int(request.form.get('quality', 85))
    width = int(request.form.get('width', 0))
    height = int(request.form.get('height', 0))
    resize = (width, height) if width or height else None

    # Save uploaded file
    unique_id = uuid.uuid4().hex
    original_ext = os.path.splitext(secure_filename(file.filename))[1]
    input_filename = f"{unique_id}{original_ext}"
    input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
    file.save(input_path)

    # Validate MIME type
    if not _validate_mime(input_path):
        os.remove(input_path)
        return jsonify(success=False, error='Файл не является допустимым изображением'), 400

    # Convert
    output_ext = _EXT_MAP.get(target_format, '.bin')
    output_filename = f"{unique_id}_converted{output_ext}"
    output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)

    try:
        result = convert_image(
            input_path=input_path,
            output_path=output_path,
            target_format=target_format,
            quality=quality,
            resize=resize,
        )
    except (ValidationError, ConversionError) as exc:
        # Clean up input on failure
        if os.path.exists(input_path):
            os.remove(input_path)
        return jsonify(success=False, error=str(exc)), 400

    return jsonify(
        success=True,
        filename=output_filename,
        original_size=result['original_size'],
        converted_size=result['converted_size'],
        width=result['width'],
        height=result['height'],
        download_url=f'/download/{output_filename}',
    )


@app.route('/download/<filename>')
def download_file(filename: str):
    """Serve a converted file for download."""
    safe_name = secure_filename(filename)
    return send_from_directory(
        app.config['UPLOAD_FOLDER'],
        safe_name,
        as_attachment=True,
    )


@app.route('/api/download-zip', methods=['POST'])
def download_zip():
    """Create a ZIP archive from a list of converted files and send it."""
    data = request.get_json()
    if not data or 'files' not in data:
        return jsonify(success=False, error='Не указаны файлы'), 400

    filenames = data['files']
    if not filenames or len(filenames) > 10:
        return jsonify(success=False, error='Допустимо от 1 до 10 файлов'), 400

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname in filenames:
            safe_name = secure_filename(fname)
            fpath = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
            if os.path.isfile(fpath):
                zf.write(fpath, arcname=safe_name)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name='converthub_images.zip',
    )


if __name__ == '__main__':
    app.run(debug=True, port=5000)
