/**
 * Image Lightbox - Types
 * 
 * Рефакторинг: 600 строк → 8 модулей
 * @refactored 2025-12-29
 */

export interface LightboxImage {
  id?: string
  slug?: string
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
  gallerySlug?: string
  currentPlayerId?: string
  currentPlayerSlug?: string
}

export interface VerifiedPerson {
  id: string
  slug?: string
  name: string
  hasGallery?: boolean  // If false, name is shown but not clickable
}
