"use client"

import type React from "react"

import { useState, useEffect } from "react"
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
import { Check, Trash2, User } from "lucide-react"
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

interface PersonPhoto {
  id: string
  image_url: string
  gallery_id: string
  width: number
  height: number
  faceId: string
  confidence: number | null
  verified: boolean
  boundingBox: number[] | null
  faceCount: number
  filename: string
  gallery_name?: string
  shootDate?: string
}

/**
 * ============================================================================
 * CRITICAL: DO NOT MODIFY THIS FUNCTION WITHOUT TESTING
 * ============================================================================
 * 
 * Calculate face position for centered crop using CSS transform.
 * 
 * @param bbox - Bounding box from InsightFace as array [x1, y1, x2, y2] or null
 * @param imgWidth - Original image width in pixels  
 * @param imgHeight - Original image height in pixels
 * @returns Object with transform string and scale, or null if bbox is invalid
 * 
 * IMPORTANT: bbox can be null/undefined from the API. This function MUST
 * handle that case gracefully by returning null (which triggers fallback
 * to standard object-fit: cover in the render code).
 */
function calculateFacePosition(
  bbox: number[] | null | undefined,
  imgWidth: number,
  imgHeight: number,
): { transform: string; scale: number } | null {
  // CRITICAL: Validate bbox before destructuring to prevent "e is not iterable" crash
  if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
    return null
  }
  
  // Validate image dimensions
  if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
    return null
  }

  const x1 = Number(bbox[0])
  const y1 = Number(bbox[1])
  const x2 = Number(bbox[2])
  const y2 = Number(bbox[3])
  
  // Validate parsed values
  if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
    return null
  }

  // Face dimensions in pixels
  const faceWidth = x2 - x1
  const faceHeight = y2 - y1
  
  if (faceWidth <= 0 || faceHeight <= 0) {
    return null
  }
  
  const faceCenterX = x1 + faceWidth / 2
  const faceCenterY = y1 + faceHeight / 2

  // Container is square, calculate scale to fit image
  const containerAspect = 1 // square
  const imageAspect = imgWidth / imgHeight

  // Base scale to fill container (like object-cover)
  let baseScale = 1
  if (imageAspect > containerAspect) {
    // Landscape: scale based on height
    baseScale = 1
  } else {
    // Portrait: scale based on width
    baseScale = containerAspect / imageAspect
  }

  // Calculate additional scale to make face prominent (at least 40% of container)
  const faceScale = Math.max(faceWidth, faceHeight) / Math.min(imgWidth, imgHeight)
  const targetFaceScale = 0.4 // Face should occupy ~40% of container
  const additionalScale = Math.max(1, targetFaceScale / faceScale)

  const totalScale = baseScale * additionalScale

  // Calculate transform to center the face
  const faceCenterXPercent = (faceCenterX / imgWidth) * 100
  const faceCenterYPercent = (faceCenterY / imgHeight) * 100

  // Offset to move face center to container center (50%, 50%)
  const offsetX = 50 - faceCenterXPercent
  const offsetY = 50 - faceCenterYPercent

  return {
    transform: `translate(${offsetX}%, ${offsetY}%) scale(${totalScale})`,
    scale: totalScale,
  }
}

export function PersonGalleryDialog({ personId, personName, open, onOpenChange }: PersonGalleryDialogProps) {
  const router = useRouter()
  const [photos, setPhotos] = useState<PersonPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [taggingImage, setTaggingImage] = useState<{ id: string; url: string } | null>(null)
  const [avatarSelectorOpen, setAvatarSelectorOpen] = useState(false)
  const [selectedPhotoForAvatar, setSelectedPhotoForAvatar] = useState<string | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())
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
    if (result.success && result.data) {
      setPhotos(result.data)
    } else if (result.error) {
      console.error("Error loading photos:", result.error)
    }
    setLoading(false)
  }

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
    const result = await verifyPersonOnPhotoAction(photoId, personId)
    if (result.success) {
      await loadPhotos()
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

  function handleOpenTaggingDialog(imageId: string, imageUrl: string) {
    setTaggingImage({ id: imageId, url: imageUrl })
  }

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

  function canVerifySelected(): boolean {
    if (selectedPhotos.size === 0) return false
    return Array.from(selectedPhotos).some((photoId) => {
      const photo = photos.find((p) => p.id === photoId)
      return photo && photo.faceCount === 1 && !photo.verified
    })
  }

  function handleBatchVerify() {
    const verifiablePhotos = Array.from(selectedPhotos).filter((photoId) => {
      const photo = photos.find((p) => p.id === photoId)
      return photo && photo.faceCount === 1 && !photo.verified
    })
    setConfirmDialog({ open: true, action: "verify", count: verifiablePhotos.length })
  }

  function handleBatchDelete() {
    setConfirmDialog({ open: true, action: "delete", count: selectedPhotos.size })
  }

  async function confirmBatchAction() {
    if (confirmDialog.action === "verify") {
      const verifiablePhotos = Array.from(selectedPhotos).filter((photoId) => {
        const photo = photos.find((p) => p.id === photoId)
        return photo && photo.faceCount === 1 && !photo.verified
      })
      for (const photoId of verifiablePhotos) {
        await verifyPersonOnPhotoAction(photoId, personId)
      }
    } else if (confirmDialog.action === "delete") {
      for (const photoId of selectedPhotos) {
        await unlinkPersonFromPhotoAction(photoId, personId)
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

    const result = await unlinkPersonFromPhotoAction(singleDeleteDialog.photoId, personId)
    if (result.success) {
      router.refresh()
      await loadPhotos()
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
                      variant="default"
                      size="sm"
                      disabled={!canVerifySelected()}
                      onClick={handleBatchVerify}
                      className="bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Подтвердить фото
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
                {photos.map((photo) => {
                  const canVerify = photo.faceCount === 1 && !photo.verified

                  // Calculate face position - returns null if bbox is invalid
                  const facePosition = calculateFacePosition(photo.boundingBox, photo.width, photo.height)

                  return (
                    <div key={photo.id} className="group relative overflow-hidden rounded-lg border">
                      <div
                        className="relative aspect-square cursor-pointer overflow-hidden"
                        onClick={() => handleOpenTaggingDialog(photo.id, photo.image_url)}
                      >
                        <Image
                          src={photo.image_url || "/placeholder.svg"}
                          alt="Photo"
                          width={photo.width || 250}
                          height={photo.height || 250}
                          style={
                            facePosition
                              ? {
                                  position: "absolute",
                                  top: "50%",
                                  left: "50%",
                                  transform: facePosition.transform,
                                  transformOrigin: "center",
                                  maxWidth: "none",
                                  maxHeight: "none",
                                }
                              : {
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }
                          }
                          sizes="250px"
                        />

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
