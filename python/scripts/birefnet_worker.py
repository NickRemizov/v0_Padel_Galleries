#!/usr/bin/env python3
"""
BiRefNet Background Removal Worker.
Runs with birefnet_venv (separate from main service).

Usage: python birefnet_worker.py <input_path> <output_path>
Exit codes:
  0 - success
  1 - error (message in stderr)
"""

import sys
import os

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

# Singleton model instance
_model = None
_device = None


def get_model():
    """Load model once and cache."""
    global _model, _device

    if _model is None:
        print("Loading BiRefNet model...", file=sys.stderr)
        _model = AutoModelForImageSegmentation.from_pretrained(
            'ZhengPeng7/BiRefNet',
            trust_remote_code=True
        )
        _model.eval()
        _device = 'cuda' if torch.cuda.is_available() else 'cpu'
        _model.to(_device)
        print(f"Model loaded on {_device}", file=sys.stderr)

    return _model, _device


def remove_background(input_path: str, output_path: str) -> bool:
    """
    Remove background from image.

    Args:
        input_path: Path to input image
        output_path: Path to save PNG with transparency

    Returns:
        True on success
    """
    model, device = get_model()

    # Load image
    image = Image.open(input_path).convert('RGB')
    original_size = image.size

    # Transform for model (1024x1024)
    transform = transforms.Compose([
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    input_tensor = transform(image).unsqueeze(0).to(device)

    # Inference
    with torch.no_grad():
        preds = model(input_tensor)[-1].sigmoid()

    # Get mask and resize to original
    mask = preds[0].squeeze().cpu()
    mask_pil = transforms.ToPILImage()(mask)
    mask_pil = mask_pil.resize(original_size, Image.LANCZOS)

    # Apply mask
    image_rgba = image.convert('RGBA')
    image_rgba.putalpha(mask_pil)

    # Crop to content (remove transparent padding)
    bbox = image_rgba.split()[3].getbbox()
    if bbox:
        image_rgba = image_rgba.crop(bbox)

    # Save PNG with transparency
    image_rgba.save(output_path, 'PNG')
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python birefnet_worker.py <input_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        remove_background(input_path, output_path)
        print(output_path)  # Print output path on success
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
