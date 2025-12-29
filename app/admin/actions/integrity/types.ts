/**
 * Integrity Module Types
 * Типы для проверки целостности базы данных
 */

export interface IntegrityReport {
  stats: {
    totalGalleries: number
    totalPhotos: number
    totalPhotoFaces: number
    totalPeople: number
    totalConfigs: number
    totalEventPlayers: number
    totalTelegramBots: number
  }
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    confidenceWithoutVerified: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    orphanedLinks: number
    unrecognizedFaces: number
  }
  people: {
    withoutFaces: number
    duplicatePeople: number
  }
  totalIssues: number
  checksPerformed: number
  details: Record<string, any[]>
}

export interface IntegrityActionResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface FixResult {
  fixed: number
  issueType: string
  details?: any
  message?: string
}
