/**
 * Lightbox Formatters
 * 
 * Utility functions for formatting display values
 */

export function formatDateDDMM(dateString?: string): string {
  if (!dateString) return ""

  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")

  return `${day}.${month}`
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "N/A"
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return ""
  return `${width} × ${height} px`
}
