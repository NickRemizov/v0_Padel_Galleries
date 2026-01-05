"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Masonry from "react-masonry-css"
import { Check, X, EyeOff, Eye, Camera } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { UserAvatarSelector } from "@/components/user-avatar-selector"

interface PhotoFace {
  id: string
  photo_id: string
  person_id: string
  recognition_confidence: number | null
  verified: boolean
  hidden_by_user: boolean
  insightface_bbox: any
  faces_count: number  // Total faces on this photo (all people)
  gallery_images?: {
    id: string
    slug?: string
    gallery_id: string
    image_url: string
    original_url: string
    original_filename?: string
    galleries?: {
      id: string
      slug?: string
      title: string
      shoot_date?: string
    }
  }
}

interface HideDialogData {
  photoFaceId: string
  filename: string
  galleryTitle: string
  galleryDate: string
}

interface AvatarDialogData {
  imageUrl: string
}

interface MyPhotosGridProps {
  photoFaces: PhotoFace[]
  personId: string
}

export function MyPhotosGrid({ photoFaces: initialPhotoFaces, personId }: MyPhotosGridProps) {
  const router = useRouter()
  const [photoFaces, setPhotoFaces] = useState(initialPhotoFaces)
  const [loading, setLoading] = useState<string | null>(null)
  const [hideDialog, setHideDialog] = useState<HideDialogData | null>(null)
  const [avatarDialog, setAvatarDialog] = useState<AvatarDialogData | null>(null)

  // Calculate stats from current state
  const totalPhotos = photoFaces.length
  const verifiedPhotos = photoFaces.filter(pf => pf.verified).length
  const hiddenPhotos = photoFaces.filter(pf => pf.hidden_by_user).length

  const breakpointColumns = {
    default: 4,
    1536: 3,
    1024: 2,
    640: 1,
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
  }

  async function handleVerify(photoFaceId: string) {
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/verify`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.map(pf =>
          pf.id === photoFaceId ? { ...pf, verified: true } : pf
        ))
      }
    } catch (error) {
      console.error("Error verifying:", error)
    } finally {
      setLoading(null)
    }
  }

  async function handleReject(photoFaceId: string) {
    if (!confirm("Это точно не вы на фото? Связь с этим фото будет удалена.")) {
      return
    }
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/reject`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.filter(pf => pf.id !== photoFaceId))
      }
    } catch (error) {
      console.error("Error rejecting:", error)
    } finally {
      setLoading(null)
    }
  }

  function openHideDialog(photoFace: PhotoFace) {
    const image = photoFace.gallery_images
    setHideDialog({
      photoFaceId: photoFace.id,
      filename: image?.original_filename || image?.slug || "фото",
      galleryTitle: image?.galleries?.title || "галереи",
      galleryDate: formatDate(image?.galleries?.shoot_date),
    })
  }

  async function confirmHide() {
    if (!hideDialog) return
    const photoFaceId = hideDialog.photoFaceId
    setHideDialog(null)
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/hide`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.map(pf =>
          pf.id === photoFaceId ? { ...pf, hidden_by_user: true } : pf
        ))
      }
    } catch (error) {
      console.error("Error hiding:", error)
    } finally {
      setLoading(null)
    }
  }

  async function handleUnhide(photoFaceId: string) {
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/unhide`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.map(pf =>
          pf.id === photoFaceId ? { ...pf, hidden_by_user: false } : pf
        ))
      }
    } catch (error) {
      console.error("Error unhiding:", error)
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      {/* Stats header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Мои фотографии</h2>
        <p className="text-muted-foreground">
          Всего: {totalPhotos} | Подтверждённых: {verifiedPhotos} | Скрытых: {hiddenPhotos}
        </p>
      </div>

      <Masonry
        breakpointCols={breakpointColumns}
        className="flex -ml-4 w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
      {photoFaces.map((photoFace) => {
        const image = photoFace.gallery_images
        if (!image) return null

        const gallerySlug = image.galleries?.slug || image.gallery_id
        const photoSlug = image.slug || image.id
        const confidence = photoFace.recognition_confidence
        const isOnlyPersonOnPhoto = photoFace.faces_count === 1
        const isLoading = loading === photoFace.id

        return (
          <div
            key={photoFace.id}
            className={`relative mb-4 group overflow-hidden rounded-lg ${
              photoFace.hidden_by_user ? "opacity-50" : ""
            }`}
          >
            {/* Photo link */}
            <Link href={`/gallery/${gallerySlug}?photo=${photoSlug}`}>
              <img
                src={image.image_url || "/placeholder.svg"}
                alt={image.galleries?.title || "Photo"}
                className="w-full h-auto transition-transform duration-300 group-hover:scale-105"
              />
            </Link>

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />

            {/* Confidence badge (bottom-left) - always visible if not verified */}
            {!photoFace.verified && confidence !== null && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md font-medium">
                  {Math.round(confidence * 100)}%
                </span>
                {/* Verify button on hover */}
                <button
                  onClick={(e) => { e.preventDefault(); handleVerify(photoFace.id) }}
                  disabled={isLoading}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-green-500 hover:bg-green-600 text-white p-1.5 rounded-md disabled:opacity-50"
                  title="Подтвердить - это я"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Verified badge */}
            {photoFace.verified && (
              <div className="absolute bottom-2 left-2">
                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Подтверждено
                </span>
              </div>
            )}

            {/* Hidden badge */}
            {photoFace.hidden_by_user && (
              <div className="absolute top-2 left-2">
                <span className="bg-gray-500 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  Скрыто
                </span>
              </div>
            )}

            {/* Avatar button (top-left, on hover, only for non-hidden photos) */}
            {!photoFace.hidden_by_user && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  setAvatarDialog({ imageUrl: image.original_url || image.image_url })
                }}
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-md"
                title="Сделать аватаром"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}

            {/* Reject button (top-right) - always available on hover */}
            <button
              onClick={(e) => { e.preventDefault(); handleReject(photoFace.id) }}
              disabled={isLoading}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-md disabled:opacity-50"
              title="Это не я"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hide/Unhide button (bottom-right) */}
            {isOnlyPersonOnPhoto && (
              photoFace.hidden_by_user ? (
                // Unhide button
                <button
                  onClick={(e) => { e.preventDefault(); handleUnhide(photoFace.id) }}
                  disabled={isLoading}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-md disabled:opacity-50"
                  title="Показать в общем просмотре"
                >
                  <Eye className="w-4 h-4" />
                </button>
              ) : (
                // Hide button
                <button
                  onClick={(e) => { e.preventDefault(); openHideDialog(photoFace) }}
                  disabled={isLoading}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-600 hover:bg-gray-700 text-white p-1.5 rounded-md disabled:opacity-50"
                  title="Скрыть из общего просмотра"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              )
            )}

            {/* Info for multi-person photos */}
            {!isOnlyPersonOnPhoto && (
              <div
                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 text-white text-xs px-2 py-1 rounded-md"
                title="На этом фото не только вы"
              >
                +{photoFace.faces_count - 1}
              </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )
      })}

      </Masonry>

      {/* Hide confirmation dialog */}
      <AlertDialog open={!!hideDialog} onOpenChange={(open) => !open && setHideDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скрыть фото из общего доступа?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Скрыть фото <strong>{hideDialog?.filename}</strong> из галереи{" "}
                <strong>{hideDialog?.galleryTitle} {hideDialog?.galleryDate}</strong> из общего доступа?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHide}>Скрыть</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Avatar selector dialog */}
      {avatarDialog && (
        <UserAvatarSelector
          imageUrl={avatarDialog.imageUrl}
          open={!!avatarDialog}
          onOpenChange={(open) => !open && setAvatarDialog(null)}
          onAvatarUpdated={() => router.refresh()}
        />
      )}
    </>
  )
}
