"use client"

import { useCallback } from "react"
import type { PersonPhoto } from "../types"
import { PersonGalleryPhotoCard } from "./PersonGalleryPhotoCard"

interface PersonGalleryPhotosListProps {
  photos: PersonPhoto[]
  selectedPhotos: Set<string>
  loading: boolean
  onSelectPhoto: (photoId: string) => void
  onOpenTagging: (photoId: string, imageUrl: string) => void
  onDeletePhoto: (photoId: string) => void
  onVerifyPhoto: (photoId: string) => void
  onOpenAvatarSelector: (photoId: string) => void
}

export function PersonGalleryPhotosList({
  photos,
  selectedPhotos,
  loading,
  onSelectPhoto,
  onOpenTagging,
  onDeletePhoto,
  onVerifyPhoto,
  onOpenAvatarSelector,
}: PersonGalleryPhotosListProps) {
  // Stable callbacks to prevent unnecessary re-renders
  const handleSelect = useCallback((photoId: string) => onSelectPhoto(photoId), [onSelectPhoto])
  const handleOpenTagging = useCallback((photoId: string, url: string) => onOpenTagging(photoId, url), [onOpenTagging])
  const handleDelete = useCallback((photoId: string) => onDeletePhoto(photoId), [onDeletePhoto])
  const handleVerify = useCallback((photoId: string) => onVerifyPhoto(photoId), [onVerifyPhoto])
  const handleOpenAvatar = useCallback((photoId: string) => onOpenAvatarSelector(photoId), [onOpenAvatarSelector])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Нет подтвержденных фотографий</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {photos.map((photo) => (
        <PersonGalleryPhotoCard
          key={photo.id}
          photo={photo}
          isSelected={selectedPhotos.has(photo.id)}
          onSelect={handleSelect}
          onOpenTagging={handleOpenTagging}
          onDelete={handleDelete}
          onVerify={handleVerify}
          onOpenAvatarSelector={handleOpenAvatar}
        />
      ))}
    </div>
  )
}
