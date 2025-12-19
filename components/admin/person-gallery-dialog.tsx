"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Check, Trash2, User, ArrowUpDown, ArrowUp } from "lucide-react"
import {
  getPersonPhotosWithDetailsAction,
  unlinkPersonFromPhotoAction,
  verifyPersonOnPhotoAction,
} from "@/app/admin/actions"
import { FaceTaggingDialog } from "./face-tagging-dialog"
import { AvatarSelector } from "./avatar-selector"

interface PersonGalleryDialogProps {
  personId: string
  personName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface PersonPhoto {
  id: string
  image_url: string
  gallery_id: string
  width: number
  height: number
  faceId: string
  confidence: number | null
  verified: boolean
  boundingBox: BoundingBox | null
  faceCount: number
  filename: string
  gallery_name?: string
  shootDate?: string
  sort_order?: string
  created_at?: string
}

// Type for tagging image state with neighbor IDs
interface TaggingImageState {
  id: string
  url: string
  prevId: string | null
  nextId: string | null
}

/**
 * Calculate background styles for face-centered thumbnails.
 *
 * Algorithm:
 * 1. Scale: face height should be ~25% of container. Max zoom 3.5x, min 1x (never shrink)
 * 2. Horizontal: center face, but don't go beyond image edges
 * 3. Vertical: face center at 1/4 from top, but don't go beyond image edges
 */
function calculateFaceStyles(
  bbox: BoundingBox | null | undefined,
  imgWidth: number,
  imgHeight: number,
): { backgroundSize: string; backgroundPosition: string } | null {
  // Validate bbox
  if (!bbox || typeof bbox !== "object") return null

  const { x, y, width, height } = bbox

  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number")
    return null

  if (width <= 0 || height <= 0 || imgWidth <= 0 || imgHeight <= 0) return null

  const imageAspect = imgWidth / imgHeight
  const isLandscape = imageAspect >= 1

  // === STEP 1: Calculate scale ===
  // Target: face height = 25% of container height
  const targetFaceHeight = 0.25
  const faceHeightRatio = height / imgHeight

  let scale: number
  if (isLandscape) {
    // Landscape: container height = image height at scale 1
    scale = targetFaceHeight / faceHeightRatio
  } else {
    // Portrait: container height shows more of image height
    // At scale 1, visible height = imgHeight * (imgWidth/imgHeight) = imgWidth equivalent
    scale = (targetFaceHeight * imageAspect) / faceHeightRatio
  }

  // Clamp scale: never shrink (min 1), max zoom 3.5x
  scale = Math.max(1, Math.min(scale, 3.5))

  // === STEP 2: Calculate scaled dimensions relative to container ===
  let scaledWidth: number
  let scaledHeight: number
  let backgroundSize: string

  if (isLandscape) {
    // Landscape: height fits container, width overflows
    scaledHeight = scale
    scaledWidth = scale * imageAspect
    backgroundSize = `auto ${scale * 100}%`
  } else {
    // Portrait: width fits container, height overflows
    scaledWidth = scale
    scaledHeight = scale / imageAspect
    backgroundSize = `${scale * 100}% auto`
  }

  // === STEP 3: Calculate position ===
  // Face center in normalized image coordinates (0-1)
  const faceCenterX = (x + width / 2) / imgWidth
  const faceCenterY = (y + height / 2) / imgHeight

  // Target position in container (0-1)
  const targetX = 0.5 // center horizontally
  const targetY = 0.25 // 1/4 from top

  // Calculate required offset to place face center at target position
  // offset = where face is in scaled image - where we want it in container
  let offsetX = faceCenterX * scaledWidth - targetX
  let offsetY = faceCenterY * scaledHeight - targetY

  // Clamp offsets so we don't show beyond image edges
  // Offset range: 0 to (scaledSize - 1)
  const maxOffsetX = Math.max(0, scaledWidth - 1)
  const maxOffsetY = Math.max(0, scaledHeight - 1)

  offsetX = Math.max(0, Math.min(offsetX, maxOffsetX))
  offsetY = Math.max(0, Math.min(offsetY, maxOffsetY))

  // Convert to background-position percentage
  // background-position: X% Y% means X% of overflow is hidden on left, Y% on top
  let bgPosX: number
  let bgPosY: number

  if (maxOffsetX > 0) {
    bgPosX = (offsetX / maxOffsetX) * 100
  } else {
    bgPosX = 50 // centered, no overflow
  }

  if (maxOffsetY > 0) {
    bgPosY = (offsetY / maxOffsetY) * 100
  } else {
    bgPosY = 50 // centered, no overflow
  }

  return {
    backgroundSize,
    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
  }
}

/**
 * Sort images by gallery sort_order setting
 */
function sortByGalleryOrder(images: PersonPhoto[], sortOrder: string): PersonPhoto[] {
  const sorted = [...images]
  switch (sortOrder) {
    case "filename":
      return sorted.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))
    case "created":
    case "added":
      return sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    default:
      return sorted.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""))
  }
}

export function PersonGalleryDialog({ personId, personName, open, onOpenChange }: PersonGalleryDialogProps) {
  const router = useRouter()
  const [photos, setPhotos] = useState<PersonPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [taggingImage, setTaggingImage] = useState<TaggingImageState | null>(null)
  const [avatarSelectorOpen, setAvatarSelectorOpen] = useState(false)
  const [selectedPhotoForAvatar, setSelectedPhotoForAvatar] = useState<string | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())
  const [showUnverifiedFirst, setShowUnverifiedFirst] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: "verify" | "delete" | null
    count: number
  }>({ open: false, action: null, count: 0 })
  const [singleDeleteDialog, setSingleDeleteDialog] = useState<{
    open: boolean
    photoId: string | null
    filename: string
    galleryName: string
  }>({ open: false, photoId: null, filename: "", galleryName: "" })

  useEffect(() => {
    if (open) {
      loadPhotos()
    }
  }, [open, personId])

  async function loadPhotos() {
    setLoading(true)
    const result = await getPersonPhotosWithDetailsAction(personId)
    console.log(
      "[PersonGallery] Loaded photos:",
      result.data?.map((p) => ({ id: p.id, boundingBox: p.boundingBox, width: p.width, height: p.height })),
    )
    if (result.success && result.data) {
      setPhotos(result.data)
    } else if (result.error) {
      console.error("[PersonGallery] Error loading photos:", result.error)
    }
    setLoading(false)
  }

  // Sort photos: by gallery date (newest first), then by gallery sort_order
  // If showUnverifiedFirst is enabled, unverified photos come first
  const sortedPhotos = useMemo(() => {
    // Group photos by gallery
    const galleryMap = new Map<string, PersonPhoto[]>()
    for (const photo of photos) {
      const galleryId = photo.gallery_id
      if (!galleryMap.has(galleryId)) {
        galleryMap.set(galleryId, [])
      }
      galleryMap.get(galleryId)!.push(photo)
    }

    // Sort galleries by shoot_date (newest first)
    const sortedGalleries = Array.from(galleryMap.entries()).sort((a, b) => {
      const dateA = new Date(a[1][0]?.shootDate || 0).getTime()
      const dateB = new Date(b[1][0]?.shootDate || 0).getTime()
      return dateB - dateA
    })

    // Sort images within each gallery according to gallery's sort_order
    let result: PersonPhoto[] = []
    for (const [galleryId, galleryPhotos] of sortedGalleries) {
      const sortOrder = galleryPhotos[0]?.sort_order || "filename"
      const sorted = sortByGalleryOrder(galleryPhotos, sortOrder)
      result.push(...sorted)
    }

    // If showUnverifiedFirst is enabled, move unverified photos to the beginning
    if (showUnverifiedFirst) {
      const unverified = result.filter((p) => !p.verified)
      const verified = result.filter((p) => p.verified)
      return [...unverified, ...verified]
    }

    return result
  }, [photos, showUnverifiedFirst])

  // Count unverified photos
  const unverifiedCount = useMemo(() => {
    return photos.filter((p) => !p.verified).length
  }, [photos])

  // Count selected unverified photos
  const selectedUnverifiedCount = useMemo(() => {
    return Array.from(selectedPhotos).filter((photoId) => {
      const photo = photos.find((p) => p.id === photoId)
      return photo && !photo.verified
    }).length
  }, [selectedPhotos, photos])

  // Helper to find neighbors in current sortedPhotos
  const findNeighbors = useCallback((photoId: string): { prevId: string | null; nextId: string | null } => {
    const index = sortedPhotos.findIndex((p) => p.id === photoId)
    return {
      prevId: index > 0 ? sortedPhotos[index - 1].id : null,
      nextId: index < sortedPhotos.length - 1 ? sortedPhotos[index + 1].id : null,
    }
  }, [sortedPhotos])

  // Navigate to previous image using saved prevId
  const handlePreviousImage = useCallback(() => {
    if (!taggingImage?.prevId) return
    
    const prevPhoto = photos.find((p) => p.id === taggingImage.prevId)
    if (!prevPhoto) return
    
    // Find neighbors for the new image
    const neighbors = findNeighbors(prevPhoto.id)
    
    setTaggingImage({
      id: prevPhoto.id,
      url: prevPhoto.image_url,
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [taggingImage, photos, findNeighbors])

  // Navigate to next image using saved nextId
  const handleNextImage = useCallback(() => {
    if (!taggingImage?.nextId) return
    
    const nextPhoto = photos.find((p) => p.id === taggingImage.nextId)
    if (!nextPhoto) return
    
    // Find neighbors for the new image
    const neighbors = findNeighbors(nextPhoto.id)
    
    setTaggingImage({
      id: nextPhoto.id,
      url: nextPhoto.image_url,
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [taggingImage, photos, findNeighbors])

  async function handleDeleteDescriptors(photoId: string) {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return

    setSingleDeleteDialog({
      open: true,
      photoId,
      filename: photo.filename,
      galleryName: photo.gallery_name || "Неизвестная галерея",
    })
  }

  async function handleVerify(photoId: string) {
    console.log("[PersonGallery] Verifying photo:", photoId, "person:", personId)
    const result = await verifyPersonOnPhotoAction(photoId, personId)
    console.log("[PersonGallery] Verify result:", result)
    if (result.success) {
      setPhotos((prev) =>
        prev.map((photo) => (photo.id === photoId ? { ...photo, verified: true, confidence: 1 } : photo)),
      )
    } else {
      console.error("[PersonGallery] Verify failed:", result.error)
    }
  }

  function handleOpenAvatarSelector(photoId: string) {
    setSelectedPhotoForAvatar(photoId)
    setAvatarSelectorOpen(true)
  }

  function handleTaggingDialogClose(open: boolean) {
    if (!open) {
      setTaggingImage(null)
    }
  }

  // Reload photos after tagging dialog saves
  // Parameters are optional - we just reload the full list here
  async function handleTaggingSave(_imageId?: string, _faces?: any[]) {
    console.log("[PersonGallery] Tagging dialog saved, reloading photos...")
    await loadPhotos()
  }

  // Open tagging dialog with neighbor IDs saved
  const handleOpenTaggingDialog = useCallback((photoId: string, imageUrl: string) => {
    // Find neighbors at the moment of opening
    const neighbors = findNeighbors(photoId)
    
    setTaggingImage({
      id: photoId,
      url: imageUrl,
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [findNeighbors])

  function togglePhotoSelection(photoId: string) {
    setSelectedPhotos((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(photoId)) {
        newSet.delete(photoId)
      } else {
        newSet.add(photoId)
      }
      return newSet
    })
  }

  // Get verify button state and text
  function getVerifyButtonState(): { disabled: boolean; text: string; count: number } {
    // No unverified photos at all
    if (unverifiedCount === 0) {
      return { disabled: true, text: "Все фото подтверждены", count: 0 }
    }
    
    // Some photos selected
    if (selectedPhotos.size > 0) {
      if (selectedUnverifiedCount > 0) {
        return { disabled: false, text: `Подтвердить ${selectedUnverifiedCount} фото`, count: selectedUnverifiedCount }
      } else {
        // All selected photos are already verified
        return { disabled: true, text: "Все фото подтверждены", count: 0 }
      }
    }
    
    // No photos selected, but have unverified
    return { disabled: false, text: `Подтвердить все фото (${unverifiedCount})`, count: unverifiedCount }
  }

  function handleBatchVerify() {
    const verifyState = getVerifyButtonState()
    if (verifyState.disabled) return
    
    // If photos selected - verify only selected unverified
    // If no photos selected - verify all unverified
    const photosToVerify = selectedPhotos.size > 0
      ? Array.from(selectedPhotos).filter((photoId) => {
          const photo = photos.find((p) => p.id === photoId)
          return photo && !photo.verified
        })
      : photos.filter((p) => !p.verified).map((p) => p.id)
    
    setConfirmDialog({ open: true, action: "verify", count: photosToVerify.length })
  }

  function handleBatchDelete() {
    setConfirmDialog({ open: true, action: "delete", count: selectedPhotos.size })
  }

  async function confirmBatchAction() {
    if (confirmDialog.action === "verify") {
      // If photos selected - verify only selected unverified
      // If no photos selected - verify all unverified
      const photosToVerify = selectedPhotos.size > 0
        ? Array.from(selectedPhotos).filter((photoId) => {
            const photo = photos.find((p) => p.id === photoId)
            return photo && !photo.verified
          })
        : photos.filter((p) => !p.verified).map((p) => p.id)
      
      for (const photoId of photosToVerify) {
        await verifyPersonOnPhotoAction(photoId, personId)
      }
    } else if (confirmDialog.action === "delete") {
      for (const photoId of selectedPhotos) {
        console.log("[PersonGallery] Batch unlink photo:", photoId, "person:", personId)
        const result = await unlinkPersonFromPhotoAction(photoId, personId)
        console.log("[PersonGallery] Batch unlink result:", result)
      }
    }
    setConfirmDialog({ open: false, action: null, count: 0 })
    setSelectedPhotos(new Set())
    await loadPhotos()
  }

  function handleCancelConfirmation(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDialog({ open: false, action: null, count: 0 })
  }

  async function handleConfirmAction(e: React.MouseEvent) {
    e.stopPropagation()
    await confirmBatchAction()
  }

  async function confirmSingleDelete() {
    if (!singleDeleteDialog.photoId) return

    console.log("[PersonGallery] Single unlink photo:", singleDeleteDialog.photoId, "person:", personId)
    const result = await unlinkPersonFromPhotoAction(singleDeleteDialog.photoId, personId)
    console.log("[PersonGallery] Single unlink result:", result)
    
    if (result.success) {
      router.refresh()
      await loadPhotos()
    } else {
      console.error("[PersonGallery] Unlink failed:", result.error)
      alert(`Ошибка удаления: ${result.error}`)
    }
    setSingleDeleteDialog({ open: false, photoId: null, filename: "", galleryName: "" })
  }

  function formatShortDate(dateString: string | null): string {
    if (!dateString) return ""
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${day}.${month}`
  }

  const verifyButtonState = getVerifyButtonState()

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if ((confirmDialog.open || singleDeleteDialog.open) && !next) return
          onOpenChange(next)
        }}
      >
        <DialogContent
          className="sm:max-w-[1400px] max-h-[90vh] flex flex-col"
          onInteractOutside={(e) => {
            if (confirmDialog.open || singleDeleteDialog.open) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (confirmDialog.open || singleDeleteDialog.open) e.preventDefault()
          }}
        >
          <div className="sticky top-0 z-10 pb-4 border-b">
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle>Галерея: {personName}</DialogTitle>
                  <DialogDescription>
                    Фотографии с подтвержденным распознаванием или высокой уверенностью
                  </DialogDescription>
                </div>
                {photos.length > 0 && (
                  <div className="flex gap-2 shrink-0 mr-12">
                    <Button
                      variant={showUnverifiedFirst ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowUnverifiedFirst(!showUnverifiedFirst)}
                      className={`w-[220px] justify-start ${showUnverifiedFirst ? "bg-blue-500 hover:bg-blue-600" : ""}`}
                      disabled={unverifiedCount === 0}
                    >
                      {showUnverifiedFirst ? (
                        <ArrowUp className="h-4 w-4 mr-2 flex-shrink-0" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                      )}
                      <span className="truncate">
                        {showUnverifiedFirst ? "Обычный порядок" : "Вначале неподтверждённые"}
                      </span>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={verifyButtonState.disabled}
                      onClick={handleBatchVerify}
                      className="w-[220px] justify-start bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
                    >
                      <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{verifyButtonState.text}</span>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selectedPhotos.size === 0}
                      onClick={handleBatchDelete}
                      className="min-w-[200px] justify-start"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {selectedPhotos.size > 0
                        ? `Удалить игрока с ${selectedPhotos.size} фото`
                        : "Удалить игрока с фото"}
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">Загрузка...</p>
              </div>
            ) : photos.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">Нет подтвержденных фотографий</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {sortedPhotos.map((photo) => {
                  const canVerify = !photo.verified

                  // Calculate face styles - returns null if bbox is invalid
                  const faceStyles = calculateFaceStyles(photo.boundingBox, photo.width, photo.height)

                  return (
                    <div key={photo.id} className="group relative overflow-hidden rounded-lg border">
                      <div
                        className="relative aspect-square cursor-pointer overflow-hidden"
                        onClick={() => handleOpenTaggingDialog(photo.id, photo.image_url)}
                      >
                        {faceStyles ? (
                          <div
                            className="w-full h-full"
                            style={{
                              backgroundImage: `url(${photo.image_url || "/placeholder.svg"})`,
                              backgroundSize: faceStyles.backgroundSize,
                              backgroundPosition: faceStyles.backgroundPosition,
                              backgroundRepeat: "no-repeat",
                            }}
                          />
                        ) : (
                          <Image
                            src={photo.image_url || "/placeholder.svg"}
                            alt="Photo"
                            fill
                            style={{ objectFit: "cover" }}
                            sizes="250px"
                          />
                        )}

                        <div
                          className="absolute left-2 top-2 z-20"
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePhotoSelection(photo.id)
                          }}
                        >
                          <Checkbox
                            checked={selectedPhotos.has(photo.id)}
                            className="bg-white border-2 border-gray-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                          />
                        </div>

                        {photo.verified ? (
                          <div className="absolute left-2 bottom-2 z-10 bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm shadow-lg">
                            ✓
                          </div>
                        ) : (
                          <div
                            className={`absolute left-2 bottom-2 z-10 bg-blue-500 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-lg transition-opacity ${canVerify ? "group-hover:opacity-0" : ""}`}
                          >
                            {Math.round((photo.confidence || 0) * 100)}%
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute right-2 top-2 pointer-events-auto"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteDescriptors(photo.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>

                          {canVerify && (
                            <Button
                              variant="secondary"
                              size="icon"
                              className="absolute left-2 bottom-2 pointer-events-auto bg-green-500 hover:bg-green-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleVerify(photo.id)
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}

                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute right-2 bottom-2 pointer-events-auto"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenAvatarSelector(photo.id)
                            }}
                          >
                            <User className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="p-2 space-y-0.5">
                        <p className="text-xs font-medium truncate" title={photo.filename}>
                          {photo.filename}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {photo.gallery_name || "Неизвестная галерея"}{" "}
                          {photo.shootDate ? formatShortDate(photo.shootDate) : ""}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t">
            {unverifiedCount > 0 && (
              <p className="text-sm text-blue-600 font-medium">
                Неподтверждённых: {unverifiedCount}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Всего фотографий: {photos.length}</p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={singleDeleteDialog.open}
        onOpenChange={(next) => setSingleDeleteDialog((s) => ({ ...s, open: next }))}
      >
        <AlertDialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить игрока <strong>{personName}</strong> с изображения <strong>{singleDeleteDialog.filename}</strong>{" "}
              из галереи <strong>{singleDeleteDialog.galleryName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setSingleDeleteDialog({ open: false, photoId: null, filename: "", galleryName: "" })}
            >
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSingleDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(next) => setConfirmDialog((s) => ({ ...s, open: next }))}>
        <AlertDialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите ваше действие</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "verify"
                ? `Подтвердить игрока ${personName} на ${confirmDialog.count} фото?`
                : `Удалить игрока ${personName} с ${confirmDialog.count} фото?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirmation}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Подтвердить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {taggingImage && (
        <FaceTaggingDialog
          imageId={taggingImage.id}
          imageUrl={taggingImage.url}
          open={!!taggingImage}
          onOpenChange={handleTaggingDialogClose}
          onSave={handleTaggingSave}
          onPrevious={handlePreviousImage}
          onNext={handleNextImage}
          hasPrevious={!!taggingImage.prevId}
          hasNext={!!taggingImage.nextId}
        />
      )}

      {avatarSelectorOpen && selectedPhotoForAvatar && (
        <AvatarSelector
          personId={personId}
          open={avatarSelectorOpen}
          onOpenChange={(open) => {
            setAvatarSelectorOpen(open)
            if (!open) {
              setSelectedPhotoForAvatar(null)
            }
          }}
          onAvatarSelected={async () => {
            setAvatarSelectorOpen(false)
            setSelectedPhotoForAvatar(null)
            router.refresh()
            onOpenChange(false)
          }}
          preselectedPhotoId={selectedPhotoForAvatar}
        />
      )}
    </>
  )
}
