/**
 * Database Integrity Checker Types
 */

// Реэкспорт типа из integrity модуля
export type { IntegrityReport } from "@/app/admin/actions/integrity"

// Локальные типы для компонента
export interface FaceCardProps {
  item: any
  issueType: string
  showConfidence?: boolean
  showVerified?: boolean
  hasActions?: boolean
  onConfirm: (faceId: string, actionType: "verify" | "elevate", item?: any) => void
  onReject: (faceId: string, actionType: "unverify" | "unlink") => void
  isProcessing: boolean
  isRemoved: boolean
  confidenceThreshold: number
}

export interface IssueRowProps {
  title: string
  count: number
  issueType: string
  description: string
  severity?: "critical" | "high" | "medium" | "low"
  canFix?: boolean
  infoOnly?: boolean
  checked?: boolean
  showConfidence?: boolean
  showVerified?: boolean
  hasActions?: boolean
  maxItems?: number
  simpleCards?: boolean
  customDetailsButton?: boolean
  onCustomDetails?: () => void
  // Данные из родителя
  details: any[]
  isExpanded: boolean
  onToggleExpand: () => void
  onFix: () => void
  isFixing: boolean
  fixingDisabled: boolean
  // Для FaceCard
  onConfirmFace: (faceId: string, actionType: "verify" | "elevate", item?: any) => void
  onRejectFace: (faceId: string, actionType: "unverify" | "unlink") => void
  processingFaces: Set<string>
  removedFaces: Set<string>
  confidenceThreshold: number
}

export interface IntegrityRunControlsProps {
  isChecking: boolean
  onCheck: () => void
  report: import("@/app/admin/actions/integrity").IntegrityReport | null
}

export interface IntegritySummaryProps {
  stats: {
    totalGalleries: number
    totalPhotos: number
    totalPhotoFaces: number
    totalPeople: number
    totalConfigs: number
    totalEventPlayers: number
    totalTelegramBots: number
  }
  checksPerformed: number
}
