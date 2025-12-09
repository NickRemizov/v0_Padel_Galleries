def generate_face_crop_url(photo_url: str, bbox: dict, img_width: int, img_height: int) -> str:
    """
    Generate Vercel Blob URL with crop parameters for face + 50% padding.
    
    Args:
        photo_url: Full image URL
        bbox: Bounding box dict with x, y, width, height (in pixels)
        img_width: Original image width
        img_height: Original image height
    
    Returns:
        URL with crop parameters
    """
    if not photo_url or not bbox:
        logger.warning(f"[generate_face_crop_url] Missing data: photo_url={bool(photo_url)}, bbox={bool(bbox)}")
        return photo_url
    
    # Get bbox coordinates in pixels
    x = bbox.get('x', 0)
    y = bbox.get('y', 0)
    width = bbox.get('width', 0)
    height = bbox.get('height', 0)
    
    logger.info(f"[generate_face_crop_url] Input bbox: x={x}, y={y}, width={width}, height={height}, img: {img_width}x{img_height}")
    
    # Calculate 50% padding
    padding_x = width * 0.5
    padding_y = height * 0.5
    
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
        crop_url = f"{photo_url}&{crop_params.lstrip('?')}"
    else:
        crop_url = f"{photo_url}{crop_params}"
    
    logger.info(f"[generate_face_crop_url] Generated crop URL: {crop_url}")
    return crop_url
