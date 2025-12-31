export interface GalleryInfo {
  id: string
  title: string
  shoot_date: string | null
  total_photos: number
  photos_to_process: number
  selected: boolean
}

export interface ProcessingResult {
  galleryId: string
  galleryTitle: string
  imageId: string
  filename: string
  facesFound: number
  facesRecognized: number
  status: "pending" | "processing" | "success" | "error"
  error?: string
}

export type ProcessingMode = "unprocessed" | "unverified"

export const modeLabels = {
  unprocessed: {
    title: "Необработанные фото",
    description: "Фото, которые ещё не проходили детекцию лиц (has_been_processed = false)",
    empty: "Нет галерей с необработанными фото",
    badge: "к обработке",
  },
  unverified: {
    title: "Неверифицированные лица",
    description: "Фото с лицами, где confidence < 1 (не подтверждены вручную)",
    empty: "Нет галерей с неверифицированными лицами",
    badge: "к верификации",
  },
}
