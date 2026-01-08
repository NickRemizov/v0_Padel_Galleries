"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, X, EyeOff, Eye, UserPlus, Globe, Lock, Menu, Download, Share2 } from "lucide-react"
import { RowsPhotoAlbum, MasonryPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"
import "react-photo-album/masonry.css"
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { UserAvatarSelector } from "@/components/user-avatar-selector"

interface PhotoFace {
  id: string
  photo_id: string
  person_id: string
  recognition_confidence: number | null
  verified: boolean
  hidden_by_user: boolean
  insightface_bbox: any
  faces_count: number
  gallery_images?: {
    id: string
    slug?: string
    gallery_id: string
    image_url: string
    original_url: string
    original_filename?: string
    width?: number
    height?: number
    galleries?: {
      id: string
      slug?: string
      title: string
      shoot_date?: string
      is_public?: boolean
    }
  }
}

interface HideDialogData {
  photoFaceId: string
  filename: string
  galleryTitle: string
  galleryDate: string
}

interface RejectDialogData {
  photoFaceId: string
  filename: string
}

interface AvatarDialogData {
  imageUrl: string
}

interface MobileDrawerData {
  photoFace: PhotoFace
}

interface MyPhotosGridProps {
  photoFaces: PhotoFace[]
  personId: string
}

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    // Check if device supports hover (mouse) - if not, it's touch device
    const hasHover = window.matchMedia('(hover: hover)').matches
    setIsTouch(!hasHover)
  }, [])

  return isTouch
}

// Image component with retry on error
function RetryImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [imageSrc, setImageSrc] = useState(src)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  const handleError = () => {
    if (retryCount < maxRetries) {
      // Retry after delay with cache-busting parameter
      setTimeout(() => {
        const separator = src.includes("?") ? "&" : "?"
        setImageSrc(`${src}${separator}_retry=${Date.now()}`)
        setRetryCount((c) => c + 1)
      }, 1000 * (retryCount + 1)) // 1s, 2s, 3s delays
    }
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  )
}

export function MyPhotosGrid({ photoFaces: initialPhotoFaces, personId }: MyPhotosGridProps) {
  const router = useRouter()
  const [photoFaces, setPhotoFaces] = useState(initialPhotoFaces)
  const [loading, setLoading] = useState<string | null>(null)
  const [hideDialog, setHideDialog] = useState<HideDialogData | null>(null)
  const [rejectDialog, setRejectDialog] = useState<RejectDialogData | null>(null)
  const [avatarDialog, setAvatarDialog] = useState<AvatarDialogData | null>(null)
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawerData | null>(null)
  const isTouch = useIsTouchDevice()

  const totalPhotos = photoFaces.length
  const verifiedPhotos = photoFaces.filter(pf => pf.verified).length
  const hiddenPhotos = photoFaces.filter(pf => pf.hidden_by_user).length

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

  function openRejectDialog(photoFace: PhotoFace) {
    const image = photoFace.gallery_images
    setRejectDialog({
      photoFaceId: photoFace.id,
      filename: image?.original_filename || image?.slug || "фото",
    })
  }

  async function confirmReject() {
    if (!rejectDialog) return
    const photoFaceId = rejectDialog.photoFaceId
    setRejectDialog(null)
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

  async function handleDownload(imageUrl: string, filename: string) {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Error downloading:", error)
    }
  }

  async function handleShare(imageUrl: string, title: string) {
    const shareUrl = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `${title} - Padel in Valencia`,
          url: shareUrl,
        })
      } catch (error) {
        // User cancelled or error
        if ((error as Error).name !== "AbortError") {
          console.error("Error sharing:", error)
        }
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl)
        alert("Ссылка скопирована")
      } catch {
        console.error("Failed to copy link")
      }
    }
  }

  const photos = useMemo(() => {
    return photoFaces
      .filter(pf => pf.gallery_images)
      .map((photoFace) => {
        const image = photoFace.gallery_images!
        return {
          src: image.image_url || "/placeholder.svg",
          width: image.width || 1200,
          height: image.height || 800,
          key: photoFace.id,
          photoFace,
        }
      })
  }, [photoFaces])

  // Mobile version - minimal UI with info button
  const renderMobilePhoto = (
    _props: { onClick?: () => void },
    { photo, width, height }: { photo: typeof photos[0]; width: number; height: number }
  ) => {
    const photoFace = photo.photoFace
    const image = photoFace.gallery_images!
    const gallerySlug = image.galleries?.slug || image.gallery_id
    const photoSlug = image.slug || image.id
    const isLoading = loading === photoFace.id

    return (
      <div
        className={`relative overflow-hidden rounded-lg ${
          photoFace.hidden_by_user ? "opacity-50" : ""
        }`}
        style={{ width, height }}
      >
        <Link href={`/gallery/${gallerySlug}?photo=${photoSlug}`}>
          <RetryImage
            src={photo.src}
            alt={image.galleries?.title || "Photo"}
            className="w-full h-full object-cover"
          />
        </Link>

        {/* Hidden indicator - top right */}
        {photoFace.hidden_by_user && (
          <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full">
            <EyeOff className="w-4 h-4" />
          </div>
        )}

        {/* Menu button - bottom right */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setMobileDrawer({ photoFace })
          }}
          className="absolute bottom-2 right-2 bg-black/60 text-white p-2 rounded"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    )
  }

  // Desktop version - full UI with hover effects
  const renderDesktopPhoto = (
    _props: { onClick?: () => void },
    { photo, width, height }: { photo: typeof photos[0]; width: number; height: number }
  ) => {
    const photoFace = photo.photoFace
    const image = photoFace.gallery_images!
    const gallerySlug = image.galleries?.slug || image.gallery_id
    const photoSlug = image.slug || image.id
    const confidence = photoFace.recognition_confidence
    const isOnlyPersonOnPhoto = photoFace.faces_count === 1
    const isLoading = loading === photoFace.id

    return (
      <div
        className={`relative overflow-hidden rounded-lg group ${
          photoFace.hidden_by_user ? "opacity-50" : ""
        }`}
        style={{ width, height }}
      >
        <Link href={`/gallery/${gallerySlug}?photo=${photoSlug}`}>
          <RetryImage
            src={photo.src}
            alt={image.galleries?.title || "Photo"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />

        {/* Gallery info badge (bottom-left, first row) */}
        <div className="absolute bottom-9 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
            {image.galleries?.is_public ? (
              <Globe className="w-3 h-3 text-green-400" />
            ) : (
              <Lock className="w-3 h-3 text-yellow-400" />
            )}
            <span className="max-w-[150px] truncate">
              {image.galleries?.title} {formatDate(image.galleries?.shoot_date)}
            </span>
          </div>
        </div>

        {/* Confidence badge (bottom-left) */}
        {!photoFace.verified && confidence !== null && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md font-medium">
              {Math.round(confidence * 100)}%
            </span>
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
            <div
              className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm"
              title="Подтверждено"
            >
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
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

        {/* Avatar button */}
        {!photoFace.hidden_by_user && (
          <button
            onClick={(e) => {
              e.preventDefault()
              setAvatarDialog({ imageUrl: image.original_url || image.image_url })
            }}
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-md"
            title="Сделать аватаром"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}

        {/* Reject button */}
        <button
          onClick={(e) => { e.preventDefault(); openRejectDialog(photoFace) }}
          disabled={isLoading}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-md disabled:opacity-50"
          title="Это не я"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hide/Unhide button */}
        {isOnlyPersonOnPhoto && (
          photoFace.hidden_by_user ? (
            <button
              onClick={(e) => { e.preventDefault(); handleUnhide(photoFace.id) }}
              disabled={isLoading}
              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-md disabled:opacity-50"
              title="Показать в общем просмотре"
            >
              <Eye className="w-4 h-4" />
            </button>
          ) : (
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

        {/* Multi-person indicator */}
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

      {isTouch ? (
        <RowsPhotoAlbum
          key={`rows-${photos.length}`}
          photos={photos}
          targetRowHeight={350}
          render={{ photo: renderMobilePhoto }}
          spacing={4}
        />
      ) : (
        <MasonryPhotoAlbum
          key={`masonry-${photos.length}`}
          photos={photos}
          columns={(containerWidth) => {
            if (containerWidth < 900) return 2
            if (containerWidth < 1400) return 3
            return 4
          }}
          render={{ photo: renderDesktopPhoto }}
          spacing={8}
        />
      )}

      {/* Mobile drawer for photo actions */}
      <Drawer open={!!mobileDrawer} onOpenChange={(open) => !open && setMobileDrawer(null)}>
        <DrawerContent>
          {mobileDrawer && (() => {
            const photoFace = mobileDrawer.photoFace
            const image = photoFace.gallery_images!
            const isOnlyPersonOnPhoto = photoFace.faces_count === 1
            const isLoading = loading === photoFace.id
            const filename = image.original_filename || image.slug || "photo"

            return (
              <div className="px-4 pb-8">
                <DrawerHeader className="px-0">
                  <DrawerTitle className="text-left">{filename}</DrawerTitle>
                  <DrawerDescription className="text-left">
                    {image.galleries?.title} {formatDate(image.galleries?.shoot_date)}
                  </DrawerDescription>
                </DrawerHeader>

                <div className="flex flex-col gap-2 mt-4">
                  {/* 1. Verify button - only if not verified */}
                  {!photoFace.verified && (
                    <Button
                      variant="default"
                      className="w-full justify-start gap-3"
                      disabled={isLoading}
                      onClick={() => {
                        handleVerify(photoFace.id)
                        setMobileDrawer(null)
                      }}
                    >
                      <Check className="w-5 h-5" />
                      Подтвердить, что это я
                    </Button>
                  )}

                  {/* 2. Reject button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    disabled={isLoading}
                    onClick={() => {
                      openRejectDialog(photoFace)
                      setMobileDrawer(null)
                    }}
                  >
                    <X className="w-5 h-5" />
                    Это не я
                  </Button>

                  {/* 3. Hide/Unhide button - only if single person */}
                  {isOnlyPersonOnPhoto && (
                    photoFace.hidden_by_user ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3"
                        disabled={isLoading}
                        onClick={() => {
                          handleUnhide(photoFace.id)
                          setMobileDrawer(null)
                        }}
                      >
                        <Eye className="w-5 h-5" />
                        Показать в галерее
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3"
                        disabled={isLoading}
                        onClick={() => {
                          openHideDialog(photoFace)
                          setMobileDrawer(null)
                        }}
                      >
                        <EyeOff className="w-5 h-5" />
                        Скрыть из галереи
                      </Button>
                    )
                  )}

                  {/* 4. Avatar button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      setAvatarDialog({ imageUrl: image.original_url || image.image_url })
                      setMobileDrawer(null)
                    }}
                  >
                    <UserPlus className="w-5 h-5" />
                    Сделать аватаром
                  </Button>

                  {/* 5. Download button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      handleDownload(image.original_url || image.image_url, filename)
                      setMobileDrawer(null)
                    }}
                  >
                    <Download className="w-5 h-5" />
                    Скачать фото
                  </Button>

                  {/* 6. Share button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() => {
                      handleShare(image.image_url, image.galleries?.title || "Фото")
                      setMobileDrawer(null)
                    }}
                  >
                    <Share2 className="w-5 h-5" />
                    Поделиться
                  </Button>
                </div>
              </div>
            )
          })()}
        </DrawerContent>
      </Drawer>

      {/* Reject confirmation dialog */}
      <AlertDialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить связь с фото?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Это точно не вы на фото <strong>{rejectDialog?.filename}</strong>?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReject}>Да, это не я</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
