/**
 * Image Lightbox - Types
 * 
 * Рефакторинг: 600 строк → 8 модулей
 * @refactored 2025-12-29
 */

export interface LightboxImage {
  id?: string
  url: string
  originalUrl: string
  alt: string
  filename?: string
  fileSize?: number
  width?: number
  height?: number
  galleryTitle?: string
  galleryDate?: string
}

export interface ImageLightboxProps {
  images: LightboxImage[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  galleryId?: string
  currentPlayerId?: string
}

export interface VerifiedPerson {
  id: string
  name: string
}
