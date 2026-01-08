/**
 * Format file size in KB
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "N/A"
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

/**
 * Format date as DD.MM
 */
export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

// Re-export from shared location
export { calculateFacePosition } from "@/lib/utils/face-position"

/**
 * Get image dimensions from a File object
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
