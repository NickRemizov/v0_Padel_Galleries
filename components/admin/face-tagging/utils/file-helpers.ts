/**
 * Extract and clean filename from image URL
 */
export function getDisplayFileName(imageUrl: string, maxLength = 50): string {
  try {
    const rawFileName = imageUrl.split("/").pop()?.split("?")[0] || "unknown"
    const decodedFileName = decodeURIComponent(rawFileName)
    // Remove Supabase hash suffix like -abc123xyz.jpg -> .jpg
    const cleanedFileName = decodedFileName.replace(/-[a-zA-Z0-9]{20,}(\.[^.]+)$/, "$1")
    
    if (cleanedFileName.length > maxLength) {
      return cleanedFileName.substring(0, maxLength) + "..."
    }
    return cleanedFileName
  } catch (error) {
    return imageUrl.split("/").pop()?.split("?")[0] || "unknown"
  }
}

/**
 * Get full filename without truncation
 */
export function getFullFileName(imageUrl: string): string {
  try {
    const rawFileName = imageUrl.split("/").pop()?.split("?")[0] || "unknown"
    const decodedFileName = decodeURIComponent(rawFileName)
    return decodedFileName.replace(/-[a-zA-Z0-9]{20,}(\.[^.]+)$/, "$1")
  } catch {
    return imageUrl.split("/").pop()?.split("?")[0] || "unknown"
  }
}
