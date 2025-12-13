"""
Geometry utilities for face recognition.
Extracted from routers/recognition.py.
"""


def calculate_iou(box1: dict, box2: dict) -> float:
    """
    Calculate Intersection over Union between two bounding boxes.
    
    Args:
        box1: Dict with keys x, y, width, height
        box2: Dict with keys x, y, width, height
    
    Returns:
        IoU value between 0.0 and 1.0
    """
    x1 = max(box1["x"], box2["x"])
    y1 = max(box1["y"], box2["y"])
    x2 = min(box1["x"] + box1["width"], box2["x"] + box2["width"])
    y2 = min(box1["y"] + box1["height"], box2["y"] + box2["height"])
    
    if x2 < x1 or y2 < y1:
        return 0.0
    
    intersection = (x2 - x1) * (y2 - y1)
    area1 = box1["width"] * box1["height"]
    area2 = box2["width"] * box2["height"]
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0.0


def generate_face_crop_url(photo_url: str, bbox: dict, img_width: int, img_height: int) -> str:
    """
    Generate Vercel Blob URL with crop parameters for face + 30% padding.
    
    Args:
        photo_url: Full image URL
        bbox: Bounding box dict with x, y, width, height (in pixels)
        img_width: Original image width
        img_height: Original image height
    
    Returns:
        URL with crop parameters
    """
    if not photo_url or not bbox:
        return photo_url
    
    # Get bbox coordinates in pixels
    x = bbox.get('x', 0)
    y = bbox.get('y', 0)
    width = bbox.get('width', 0)
    height = bbox.get('height', 0)
    
    # Calculate 30% padding
    padding_x = width * 0.3
    padding_y = height * 0.3
    
    # Calculate crop coordinates with padding
    crop_x = max(0, int(x - padding_x))
    crop_y = max(0, int(y - padding_y))
    crop_width = int(width + padding_x * 2)
    crop_height = int(height + padding_y * 2)
    
    # Ensure crop doesn't exceed image bounds
    if crop_x + crop_width > img_width:
        crop_width = img_width - crop_x
    if crop_y + crop_height > img_height:
        crop_height = img_height - crop_y
    
    # Generate Vercel Blob crop URL
    # Format: ?width=W&height=H&fit=crop&left=X&top=Y
    crop_params = f"?width={crop_width}&height={crop_height}&fit=crop&left={crop_x}&top={crop_y}"
    
    # If URL already has query params, append with &, otherwise use ?
    if '?' in photo_url:
        return f"{photo_url}&{crop_params.lstrip('?')}"
    else:
        return f"{photo_url}{crop_params}"
