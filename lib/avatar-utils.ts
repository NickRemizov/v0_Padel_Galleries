/**
 * Avatar generation utilities.
 * Creates cropped avatar from image URL and face bounding box.
 * 
 * Crop algorithm:
 * - Height = 500% of bbox height (100% above + 100% face + 300% below)
 * - Width calculated to maintain 3:4 aspect ratio
 * - Centered horizontally on face
 * - Final size: 420x560 pixels
 */

const AVATAR_WIDTH = 420
const AVATAR_HEIGHT = 560
const AVATAR_ASPECT = 3 / 4 // width / height

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculate crop area for avatar based on face bounding box.
 * Returns coordinates in original image space.
 */
export function calculateAvatarCropArea(
  bbox: BoundingBox,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  // Total height = 500% of bbox height
  // 100% above bbox + 100% bbox itself + 300% below bbox
  const cropHeight = bbox.height * 5
  
  // Width to maintain 3:4 aspect ratio
  const cropWidth = cropHeight * AVATAR_ASPECT
  
  // Y position: bbox.y - 100% of bbox height (to add space above)
  let cropY = bbox.y - bbox.height
  
  // X position: center horizontally on the face
  const faceCenterX = bbox.x + bbox.width / 2
  let cropX = faceCenterX - cropWidth / 2
  
  // Clamp to image boundaries
  if (cropX < 0) {
    cropX = 0
  }
  if (cropY < 0) {
    cropY = 0
  }
  if (cropX + cropWidth > imageWidth) {
    cropX = Math.max(0, imageWidth - cropWidth)
  }
  if (cropY + cropHeight > imageHeight) {
    cropY = Math.max(0, imageHeight - cropHeight)
  }
  
  // Final width/height after clamping
  const finalWidth = Math.min(cropWidth, imageWidth - cropX)
  const finalHeight = Math.min(cropHeight, imageHeight - cropY)
  
  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(finalWidth),
    height: Math.round(finalHeight)
  }
}

/**
 * Load image from URL and return HTMLImageElement.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Generate avatar blob from image URL and face bounding box.
 * 
 * @param imageUrl - URL of the source image
 * @param bbox - Face bounding box coordinates
 * @returns Blob with cropped and scaled avatar image (JPEG, 420x560)
 */
export async function generateAvatarBlob(
  imageUrl: string,
  bbox: BoundingBox
): Promise<Blob> {
  const img = await loadImage(imageUrl)
  
  const cropArea = calculateAvatarCropArea(
    bbox,
    img.naturalWidth,
    img.naturalHeight
  )
  
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_WIDTH
  canvas.height = AVATAR_HEIGHT
  
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Failed to get canvas context")
  }
  
  // Draw cropped and scaled image
  ctx.drawImage(
    img,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    AVATAR_WIDTH,
    AVATAR_HEIGHT
  )
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Failed to create avatar blob"))
        }
      },
      "image/jpeg",
      0.9
    )
  })
}

/**
 * Upload avatar blob to server and return URL.
 */
export async function uploadAvatarBlob(
  blob: Blob,
  personId: string
): Promise<string> {
  const formData = new FormData()
  const filename = `avatar-${personId}-${Date.now()}.jpg`
  formData.append("file", blob, filename)
  
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Avatar upload failed")
  }
  
  const result = await response.json()
  return result.url
}
