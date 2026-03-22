"""Image conversion module using Pillow."""

from __future__ import annotations

import logging
import os
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

# Format-specific save options
_QUALITY_FORMATS = {'JPEG', 'WEBP'}
_FORMAT_EXTENSIONS = {
    'JPEG': '.jpg',
    'PNG': '.png',
    'WEBP': '.webp',
    'BMP': '.bmp',
    'TIFF': '.tiff',
    'ICO': '.ico',
}


class ConversionError(Exception):
    """Raised when image conversion fails."""


class ValidationError(Exception):
    """Raised when input validation fails."""


def convert_image(
    input_path: str,
    output_path: str,
    target_format: str,
    quality: int = 85,
    resize: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Convert an image to the specified format.

    Args:
        input_path: Path to the source image file.
        output_path: Path to save the converted image.
        target_format: Target format ('WEBP', 'PNG', 'JPEG', 'BMP', 'TIFF', 'ICO').
        quality: Quality level 1-100, used for JPEG and WebP.
        resize: Optional (width, height) tuple for resizing.

    Returns:
        Dict with conversion result info including original and converted sizes.

    Raises:
        ValidationError: If parameters are invalid.
        ConversionError: If conversion fails.
    """
    target_format = target_format.upper()
    if target_format not in _FORMAT_EXTENSIONS:
        raise ValidationError(f"Unsupported target format: {target_format}")

    if not 1 <= quality <= 100:
        raise ValidationError(f"Quality must be between 1 and 100, got {quality}")

    original_size = os.path.getsize(input_path)

    try:
        img = Image.open(input_path)
    except Exception as exc:
        raise ConversionError(f"Cannot open image: {exc}") from exc

    try:
        # Convert RGBA to RGB for formats that don't support alpha
        if target_format in ('JPEG', 'BMP') and img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
            img = background

        if resize:
            width, height = resize
            if width > 0 and height > 0:
                img = img.resize((width, height), Image.LANCZOS)
            elif width > 0:
                ratio = width / img.width
                img = img.resize((width, int(img.height * ratio)), Image.LANCZOS)
            elif height > 0:
                ratio = height / img.height
                img = img.resize((int(img.width * ratio), height), Image.LANCZOS)

        save_kwargs: dict[str, Any] = {}
        if target_format in _QUALITY_FORMATS:
            save_kwargs['quality'] = quality
        if target_format == 'PNG':
            save_kwargs['optimize'] = True
        if target_format == 'ICO':
            # ICO needs specific sizes
            sizes = [(min(img.width, 256), min(img.height, 256))]
            save_kwargs['sizes'] = sizes

        img.save(output_path, format=target_format, **save_kwargs)

        converted_size = os.path.getsize(output_path)

        logger.info(
            "Converted %s -> %s (%d bytes -> %d bytes)",
            input_path, output_path, original_size, converted_size,
        )

        return {
            'original_size': original_size,
            'converted_size': converted_size,
            'format': target_format,
            'width': img.width,
            'height': img.height,
        }

    except ConversionError:
        raise
    except Exception as exc:
        raise ConversionError(f"Conversion failed: {exc}") from exc
    finally:
        img.close()
