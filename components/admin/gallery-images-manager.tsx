"use client"

import type React from "react"

import { useState, useEffect, useMemo, memo, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Images, Trash2, Upload, UserPlus, Scan, Download, EyeOff, Eye } from "lucide-react"

import {
  addGalleryImagesAction,
  deleteGalleryImageAction,
  deleteAllGalleryImagesAction,
  updateGallerySortOrderAction,
  getGalleryFaceRecognitionStatsAction,
  getBatchPhotoFacesAction,
  getGalleryImagesAction, // Added import for new action
} from "@/app/admin/actions"
import type { GalleryImage } from "@/lib/types"
// import { createClient } from "@/lib/supabase/client" // Removed Supabase client import - now using FastAPI
import { FaceTaggingDialog } from "./face-tagging-dialog"
import { AutoRecognitionDialog } from "./auto-recognition-dialog"
import { UnknownFacesReviewDialog } from "./unknown-faces-review-dialog"

interface GalleryImagesManagerProps {
  galleryId: string
  galleryTitle: string
  shootDate?: string | null
  initialSortOrder?: string
  isFullyVerified?: boolean
}

// Type for face data in photoFacesMap
interface FaceData {
  verified: boolean
  confidence: number
  person_id: string | null
  bbox: { x: number; y: number; width: number; height: number } | null
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "N/A"
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

/**
 * Calculate object-position for image preview based on face bounding boxes
 * Centers the preview on detected faces
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels
 * @param bboxes - Array of face bounding boxes in [x1, y1, x2, y2] format
 * @returns CSS object-position value (e.g., "50% 30%" or "center")
 */
function calculateFacePosition(
  imageWidth: number | null,
  imageHeight: number | null,
  bboxes: number[][] | null
): string {
  if (!imageWidth || !imageHeight || !bboxes || bboxes.length === 0) return "center"

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const bbox of bboxes) {
    if (bbox.length >= 4) {
      minX = Math.min(minX, bbox[0])
      minY = Math.min(minY, bbox[1])
      maxX = Math.max(maxX, bbox[2])
      maxY = Math.max(maxY, bbox[3])
    }
  }
  if (minX === Infinity) return "center"

  const faceCenterX = (minX + maxX) / 2
  const faceCenterY = (minY + maxY) / 2
  const isHorizontal = imageWidth > imageHeight
  const shortSide = Math.min(imageWidth, imageHeight)

  if (isHorizontal) {
    const maxOffset = imageWidth - shortSide
    if (maxOffset <= 0) return "center"
    const offset = Math.max(0, Math.min(faceCenterX - shortSide / 2, maxOffset))
    return `${(offset / maxOffset * 100).toFixed(1)}% 50%`
  } else {
    const maxOffset = imageHeight - shortSide
    if (maxOffset <= 0) return "center"
    const offset = Math.max(0, Math.min(faceCenterY - shortSide / 2, maxOffset))
    return `50% ${(offset / maxOffset * 100).toFixed(1)}%`
  }
}

const GalleryImageCard = memo(function GalleryImageCard({
  image,
  photoFacesMap,
  photoFacesLoaded,
  recognitionStats,
  onTag,
  onDelete,
  isSelected,
  onToggleSelect,
}: {
  image: GalleryImage
  photoFacesMap: Record<string, FaceData[]>
  photoFacesLoaded: boolean
  recognitionStats: Record<string, { total: number; recognized: number; fullyRecognized: boolean }>
  onTag: (id: string, url: string) => void
  onDelete: (id: string) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
  const faces = photoFacesMap[image.id]
  const hasDetected = faces && faces.length > 0
  const hasVerified = faces && faces.length > 0 && faces.every((face) => face.verified === true)
  const hasUnknown = faces?.some((face) => face.person_id === null) || false
  const isFullyRecognized = recognitionStats[image.id]?.fullyRecognized || false
  const hasBeenProcessed = image.has_been_processed || false

  const nonVerifiedFaces = faces?.filter((face) => !face.verified && face.person_id !== null) || []
  const confidence =
    nonVerifiedFaces.length > 0
      ? Math.round(
          (nonVerifiedFaces.reduce((sum, face) => sum + (face.confidence || 0), 0) / nonVerifiedFaces.length) * 100,
        )
      : null

  const unknownCount = faces?.filter((f) => f.person_id === null).length || 0
  const recognizedCount = faces?.filter((f) => f.person_id !== null).length || 0
  const totalCount = faces?.length || 0

  // Calculate object-position for centering on faces
  const bboxes = faces?.map((f) => {
    if (!f.bbox) return null
    // Convert {x, y, width, height} to [x1, y1, x2, y2]
    return [f.bbox.x, f.bbox.y, f.bbox.x + f.bbox.width, f.bbox.y + f.bbox.height]
  }).filter((b): b is number[] => b !== null) || []

  const objectPosition = calculateFacePosition(image.width, image.height, bboxes)

  return (
    <div
      className="group relative overflow-hidden rounded-lg border cursor-pointer"
      onClick={() => onTag(image.id, image.image_url)}
    >
      <div className="relative aspect-square">
        <Image
          src={image.image_url || "/placeholder.svg"}
          alt={image.original_filename}
          fill
          className="object-cover"
          sizes="250px"
          style={{ objectPosition }}
        />
        <div
          className="absolute left-2 top-2 z-20"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(image.id)
          }}
        >
          <Checkbox
            checked={isSelected}
            className="bg-white border-2 border-gray-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
          />
        </div>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 bottom-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onTag(image.id, image.image_url)
            }}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="absolute right-2 top-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(image.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {image.download_count > 0 && (
          <div className="absolute left-2 top-10 bg-black/70 text-white rounded px-2 py-1 text-xs flex items-center gap-1 shadow-lg z-10">
            <Download className="h-3 w-3" />
            {image.download_count}
          </div>
        )}
        {photoFacesLoaded && hasBeenProcessed && !hasDetected && (
          <div className="absolute left-2 bottom-2 bg-gray-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            NFD
          </div>
        )}
        {hasDetected && hasUnknown && !isFullyRecognized && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-orange-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {unknownCount}/{recognizedCount}/{totalCount}
          </div>
        )}
        {confidence !== null && !hasUnknown && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-blue-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {confidence}%
          </div>
        )}
        {hasVerified && (
          <div className="absolute left-2 bottom-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow-lg z-10">
            ✓
          </div>
        )}
      </div>
      <div className="bg-background p-2 border-t">
        <p className="text-xs font-medium truncate" title={image.original_filename}>
          {image.original_filename}
        </p>
        <p className="text-xs text-muted-foreground">{formatFileSize(image.file_size)}</p>
      </div>
    </div>
  )
})

export function GalleryImagesManager({
  galleryId,
  galleryTitle,
  shootDate,
  initialSortOrder,
  isFullyVerified,
  ...props
}: GalleryImagesManagerProps & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>((initialSortOrder as SortOption) || "filename")
  const [hideFullyVerified, setHideFullyVerified] = useState(false)
  const [taggingImage, setTaggingImage] = useState<{ id: string; url: string; hasBeenProcessed: boolean } | null>(null)
  const [autoRecognitionMode, setAutoRecognitionMode] = useState<"all" | "remaining" | null>(null)
  const [showUnknownFaces, setShowUnknownFaces] = useState(false)
  const [recognitionStats, setRecognitionStats] = useState<
    Record<string, { total: number; recognized: number; fullyRecognized: boolean }>
  >({})
  const [photoFacesMap, setPhotoFacesMap] = useState<Record<string, FaceData[]>>({})
  const [photoFacesLoaded, setPhotoFacesLoaded] = useState(false) // Add photoFacesLoaded state to track when data is ready
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: "delete" | null
    count: number
  }>({ open: false, action: null, count: 0 })
  const [singleDeleteDialog, setSingleDeleteDialog] = useState<{
    open: boolean
    imageId: string | null
    filename: string | null
  }>({ open: false, imageId: null, filename: null })

  useEffect(() => {
    if (open) {
      setPhotoFacesLoaded(false)
      loadImages()
      loadRecognitionStats()
    }
  }, [open])

  useEffect(() => {
    if (images.length > 0) {
      loadPhotoFaces()
    }
  }, [images])

  async function loadImages() {
    setLoading(true)
    const result = await getGalleryImagesAction(galleryId)
    if (result.success && result.data) {
      setImages(result.data)
    } else if (result.error) {
      console.error("[v0] Error loading images:", result.error)
    }
    setLoading(false)
  }

  async function loadRecognitionStats() {
    const result = await getGalleryFaceRecognitionStatsAction(galleryId)
    if (result.success && result.data) {
      setRecognitionStats(result.data)
    }
  }

  async function loadPhotoFaces() {
    console.log("[v0] [GalleryImagesManager] loadPhotoFaces START")
    console.log("[v0] [GalleryImagesManager] images count:", images.length)

    const photoIds = images.map((img) => img.id)

    console.log("[v0] [GalleryImagesManager] Calling getBatchPhotoFacesAction with photoIds:", photoIds)

    const result = await getBatchPhotoFacesAction(photoIds)

    console.log("[v0] [GalleryImagesManager] getBatchPhotoFacesAction result:", {
      success: result.success,
      successType: typeof result.success,
      dataLength: result.data?.length,
      error: result.error,
      fullResult: result,
    })

    if (result.success && result.data) {
      const facesMap: Record<string, FaceData[]> = {}

      for (const face of result.data) {
        console.log("[v0] [GalleryImagesManager] Face from DB:", {
          photo_id: face.photo_id,
          person_id: face.person_id,
          recognition_confidence: face.recognition_confidence,
          verified: face.verified,
          insightface_bbox: face.insightface_bbox,
        })

        if (!facesMap[face.photo_id]) {
          facesMap[face.photo_id] = []
        }
        facesMap[face.photo_id].push({
          verified: face.verified,
          confidence: face.recognition_confidence || 0,
          person_id: face.person_id || null,
          bbox: face.insightface_bbox || null,
        })
      }

      console.log("[v0] [GalleryImagesManager] Loaded photo faces map:", {
        photosCount: Object.keys(facesMap).length,
        photoIds: Object.keys(facesMap),
      })

      setPhotoFacesMap(facesMap)
      setPhotoFacesLoaded(true) // Set photoFacesLoaded to true when data is ready
    } else {
      console.log("[v0] [GalleryImagesManager] No faces data or error:", {
        success: result.success,
        error: result.error,
        hasData: !!result.data,
      })
      setPhotoFacesLoaded(true) // Set photoFacesLoaded to true even on error/empty
    }
  }

  function getPhotoConfidence(imageId: string): number | null {
    const faces = photoFacesMap[imageId]

    if (!faces || faces.length === 0) return null

    const nonVerifiedFaces = faces.filter((face) => !face.verified && face.person_id !== null)

    if (nonVerifiedFaces.length === 0) return null

    const avgConfidence =
      nonVerifiedFaces.reduce((sum, face) => sum + (face.confidence || 0), 0) / nonVerifiedFaces.length
    return Math.round(avgConfidence * 100)
  }

  function hasVerifiedFaces(imageId: string): boolean {
    const faces = photoFacesMap[imageId]
    if (!faces || faces.length === 0) return false

    const hasVerified = faces.every((face) => face.verified === true)
    return hasVerified
  }

  function hasDetectedFaces(imageId: string): boolean {
    const faces = photoFacesMap[imageId]
    return faces && faces.length > 0
  }

  function hasUnknownFaces(imageId: string): boolean {
    const faces = photoFacesMap[imageId]
    if (!faces || faces.length === 0) return false

    return faces.some((face) => face.person_id === null)
  }

  /**
   * Check if photo is fully verified (all faces have verified=true)
   */
  function isPhotoFullyVerified(imageId: string): boolean {
    const faces = photoFacesMap[imageId]
    // No faces = not verified
    if (!faces || faces.length === 0) return false
    // All faces must be verified
    return faces.every((face) => face.verified === true)
  }

  /**
   * Check if photo should be shown when hideFullyVerified is enabled
   * Show if:
   * - Has at least one face with confidence < 1 (not verified)
   * - Has unrecognized faces (person_id === null)
   * - Is NFD (processed but no faces)
   * - Not processed yet
   */
  function shouldShowPhoto(image: GalleryImage): boolean {
    if (!hideFullyVerified) return true

    const faces = photoFacesMap[image.id]
    const hasBeenProcessed = image.has_been_processed || false

    // Not processed yet - show
    if (!hasBeenProcessed) return true

    // NFD - show
    if (hasBeenProcessed && (!faces || faces.length === 0)) return true

    // Has unknown faces - show
    if (faces?.some((face) => face.person_id === null)) return true

    // Has at least one non-verified face - show
    if (faces?.some((face) => !face.verified)) return true

    // All faces verified - hide
    return false
  }

  const sortedImages = useMemo(() => {
    const imagesCopy = [...images]

    let sorted: GalleryImage[]
    switch (sortBy) {
      case "filename":
        sorted = imagesCopy.sort((a, b) => (a.original_filename || "").localeCompare(b.original_filename || ""))
        break
      case "created":
      case "added":
        sorted = imagesCopy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      default:
        sorted = imagesCopy
    }

    // Apply hide verified filter only when data is loaded
    if (hideFullyVerified && photoFacesLoaded) {
      return sorted.filter(shouldShowPhoto)
    }

    return sorted
  }, [images, sortBy, hideFullyVerified, photoFacesMap, photoFacesLoaded])

  // Count how many photos are hidden
  const hiddenCount = useMemo(() => {
    if (!hideFullyVerified || !photoFacesLoaded) return 0
    return images.filter((img) => !shouldShowPhoto(img)).length
  }, [images, hideFullyVerified, photoFacesMap, photoFacesLoaded])

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"))

    if (files.length === 0) return

    await processFiles(files)
  }

  async function processFiles(files: File[]) {
    setUploading(true)
    setUploadProgress(`Загрузка 0 из ${files.length}...`)

    const uploadResults = {
      success: [] as File[],
      failed: [] as { file: File; error: string }[],
    }

    try {
      const uploadedImages: {
        imageUrl: string
        originalUrl: string
        originalFilename: string
        fileSize: number
        width: number
        height: number
      }[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`Загрузка ${i + 1} из ${files.length}...`)

        try {
          const dimensions = await getImageDimensions(file)

          const formData = new FormData()
          formData.append("file", file)

          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))

            if (errorData.code === "QUOTA_EXCEEDED") {
              throw new Error(errorData.error || "Квота хранилища исчерпана")
            }

            throw new Error(errorData.error || `Ошибка загрузки ${file.name}`)
          }

          const data = await response.json()
          uploadedImages.push({
            imageUrl: data.url,
            originalUrl: data.url,
            originalFilename: file.name,
            fileSize: file.size,
            width: dimensions.width,
            height: dimensions.height,
          })

          uploadResults.success.push(file)
        } catch (uploadError) {
          const errorMessage = uploadError instanceof Error ? uploadError.message : "Неизвестная ошибка"
          console.error(`[v0.9.0] Failed to upload ${file.name}:`, errorMessage)
          uploadResults.failed.push({ file, error: errorMessage })
        }
      }

      if (uploadResults.failed.length > 0) {
        const failedNames = uploadResults.failed.map((f) => f.file.name).join(", ")
        alert(
          `Загружено: ${uploadResults.success.length} из ${files.length}\nОшибки: ${failedNames.substring(0, 200)}${failedNames.length > 200 ? "..." : ""}`,
        )
      }

      if (uploadedImages.length > 0) {
        const result = await addGalleryImagesAction(galleryId, uploadedImages)

        if (result.success) {
          await loadImages()
          await loadPhotoFaces()
          setUploadProgress("")
        } else {
          alert("Ошибка при сохранении изображений")
        }
      } else if (uploadResults.failed.length === files.length) {
        alert("Не удалось загрузить ни одного файла")
      }
    } catch (error) {
      console.error("[v0.9.0] Error uploading images:", error)
      const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки изображений"
      alert(errorMessage)
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    await processFiles(Array.from(files))
    e.target.value = ""
  }

  async function handleDelete(imageId: string) {
    const image = images.find((img) => img.id === imageId)
    if (!image) return

    setSingleDeleteDialog({
      open: true,
      imageId,
      filename: image.original_filename,
    })
  }

  async function handleDeleteAll() {
    setConfirmDialog({
      open: true,
      action: "delete",
      count: images.length,
    })
  }

  async function handleDeleteSelected() {
    if (selectedPhotos.size > 0) {
      for (const photoId of selectedPhotos) {
        await deleteGalleryImageAction(photoId, galleryId)
      }
      setSelectedPhotos(new Set())
    }
    await loadImages()
    await loadPhotoFaces()
  }

  async function confirmBatchDelete() {
    if (selectedPhotos.size > 0) {
      for (const photoId of selectedPhotos) {
        const result = await deleteGalleryImageAction(photoId, galleryId)
        if (result.error) {
          console.error("Failed to delete photo:", result.error)
        }
      }
      setSelectedPhotos(new Set())
    } else {
      const result = await deleteAllGalleryImagesAction(galleryId)
      if (result.error) {
        console.error("Failed to delete all photos:", result.error)
      }
    }
    setConfirmDialog({ open: false, action: null, count: 0 })
    await loadImages()
    await loadPhotoFaces()
  }

  async function handleSortChange(value: string) {
    setSortBy(value as SortOption)
    const result = await updateGallerySortOrderAction(galleryId, value as SortOption)
    if (result.error) {
      console.error("Failed to update gallery sort order:", result.error)
    }
  }

  function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
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

  function handleClearSelection() {
    setSelectedPhotos(new Set())
  }

  function handleCancelConfirmation() {
    setConfirmDialog({ open: false, action: null, count: 0 })
  }

  function handleConfirmAction() {
    confirmBatchDelete()
  }

  const allPhotosVerified = useMemo(() => {
    if (images.length === 0) return false

    return images.every((image) => {
      const stats = recognitionStats[image.id]
      const hasVerified = hasVerifiedFaces(image.id)
      return stats?.fullyRecognized || hasVerified
    })
  }, [images, recognitionStats, photoFacesMap])

  async function confirmSingleDelete() {
    if (!singleDeleteDialog.imageId) return

    const result = await deleteGalleryImageAction(singleDeleteDialog.imageId, galleryId)
    if (result.success) {
      await loadImages()
      await loadPhotoFaces()
    } else if (result.error) {
      console.error("Failed to delete photo:", result.error)
    }

    setSingleDeleteDialog({ open: false, imageId: null, filename: null })
  }

  const handleTagImage = (imageId: string, imageUrl: string) => {
    const image = images.find((img) => img.id === imageId)
    const hasBeenProcessed = image?.has_been_processed || false
    console.log("[v4.7] Opening FaceTaggingDialog for image:", imageId, "hasBeenProcessed:", hasBeenProcessed)

    setTaggingImage({ id: imageId, url: imageUrl, hasBeenProcessed })
  }

  // Format gallery title with date
  const displayTitle = shootDate ? `${galleryTitle} ${formatShortDate(shootDate)}` : galleryTitle

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if ((confirmDialog.open || singleDeleteDialog.open) && !next) return
          setOpen(next)
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant={isFullyVerified ? "default" : "outline"}
            size="sm"
            className={isFullyVerified ? "bg-green-600 hover:bg-green-700 text-white" : ""}
            {...props}
          >
            <Images className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-[1400px] max-h-[90vh] flex flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onInteractOutside={(e) => {
            if (confirmDialog.open || singleDeleteDialog.open) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (confirmDialog.open || singleDeleteDialog.open) e.preventDefault()
          }}
        >
          <div className="sticky top-0 z-10 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Управление фотографиями</DialogTitle>
              <DialogDescription>{displayTitle}</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-4 flex-wrap mt-4">
              <label htmlFor="image-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground">
                  <Upload className="h-4 w-4" />
                  <span>Загрузить фото</span>
                </div>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {images.length > 0 && (
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Сортировка" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filename">По названию файла</SelectItem>
                    <SelectItem value="created">По времени создания</SelectItem>
                    <SelectItem value="added">По времени добавления</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {images.length > 0 && (
                <Button
                  variant={hideFullyVerified ? "default" : "outline"}
                  onClick={() => setHideFullyVerified(!hideFullyVerified)}
                  disabled={uploading}
                  className={`w-[240px] justify-start ${hideFullyVerified ? "bg-blue-500 hover:bg-blue-600" : ""}`}
                >
                  {hideFullyVerified ? (
                    <Eye className="h-4 w-4 mr-2 flex-shrink-0" />
                  ) : (
                    <EyeOff className="h-4 w-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="truncate">
                    {hideFullyVerified ? "Верифицированные скрыты" : "Скрыть верифицированные"}
                  </span>
                </Button>
              )}
              {images.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => setAutoRecognitionMode("remaining")}
                  disabled={uploading || allPhotosVerified}
                >
                  <Scan className="h-4 w-4 mr-2" />
                  Распознать фото
                </Button>
              )}
              {images.length > 0 && (
                <Button variant="secondary" onClick={() => setShowUnknownFaces(true)} disabled={uploading}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Неизвестные лица
                </Button>
              )}
              {images.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteAll}
                  disabled={uploading}
                  className="min-w-[180px] justify-start"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {selectedPhotos.size > 0 ? `Удалить ${selectedPhotos.size} фото` : "Удалить все фото"}
                </Button>
              )}
              {selectedPhotos.size > 0 && (
                <Button variant="outline" onClick={handleClearSelection}>
                  Снять выделение
                </Button>
              )}
              {uploading && <span className="text-sm text-muted-foreground">{uploadProgress}</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">Загрузка...</p>
              </div>
            ) : images.length === 0 ? (
              <Card className="relative">
                <CardContent className="flex min-h-[200px] items-center justify-center">
                  {isDragging ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm border-4 border-dashed border-primary rounded-lg bg-white/95 dark:bg-black/95">
                      <div className="text-center">
                        <Upload className="h-16 w-16 mx-auto mb-4 text-primary" />
                        <p className="text-xl font-semibold">Перетащите фото сюда</p>
                        <p className="text-sm text-muted-foreground mt-2">Отпустите, чтобы загрузить</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Нет фотографий. Загрузите первые фото!</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="relative">
                {isDragging && (
                  <div className="absolute inset-0 bg-background/75 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg z-50 pointer-events-none">
                    <div className="sticky top-[calc(50vh-100px)] flex flex-col items-center justify-center py-12">
                      <Upload className="h-16 w-16 text-primary mb-4" />
                      <p className="text-lg font-semibold text-primary">Перетащите фото сюда</p>
                      <p className="text-sm text-muted-foreground mt-2">Отпустите, чтобы загрузить</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {sortedImages.map((image) => (
                    <GalleryImageCard
                      key={image.id}
                      image={image}
                      photoFacesMap={photoFacesMap}
                      photoFacesLoaded={photoFacesLoaded}
                      recognitionStats={recognitionStats}
                      onTag={handleTagImage}
                      onDelete={handleDelete}
                      isSelected={selectedPhotos.has(image.id)}
                      onToggleSelect={togglePhotoSelection}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-4">
            {hideFullyVerified && photoFacesLoaded && hiddenCount > 0 && (
              <p className="text-sm text-blue-600 font-medium">
                Скрыто: {hiddenCount}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Всего фотографий: {images.length}
              {hideFullyVerified && photoFacesLoaded && hiddenCount > 0 && ` (показано: ${sortedImages.length})`}
            </p>
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
            <AlertDialogTitle>Подтверждение удаления</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить <span className="font-semibold">{singleDeleteDialog.filename}</span> из
              галереи <span className="font-semibold">{galleryTitle}</span>? Это действие невозможно отменить!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSingleDelete} className="bg-destructive hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(next) => setConfirmDialog((s) => ({ ...s, open: next }))}>
        <AlertDialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPhotos.size > 0 ? (
                <>
                  Вы действительно хотите удалить выбранные фотографии из галереи{" "}
                  <span className="font-semibold">{galleryTitle}</span>? Это действие невозможно отменить!
                </>
              ) : (
                <>
                  Вы действительно хотите удалить все фотографии (
                  <span className="font-semibold">{confirmDialog.count} шт.</span>) из галереи{" "}
                  <span className="font-semibold">{galleryTitle}</span>? Это действие невозможно отменить!
                </>
              )}
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
          hasBeenProcessed={taggingImage.hasBeenProcessed}
          open={!!taggingImage}
          onOpenChange={async (open) => {
            if (!open) {
              console.log("[v4.8] GalleryImagesManager: FaceTaggingDialog closed")
              setTaggingImage(null)
              // Всегда обновляем бейджи при закрытии
              await loadRecognitionStats()
              await loadPhotoFaces()
            }
          }}
          onSave={async () => {
            console.log("[v4.8] GalleryImagesManager: FaceTaggingDialog onSave called")
            // onSave теперь только для промежуточных сохранений
            // Основное обновление в onOpenChange
          }}
        />
      )}

      {autoRecognitionMode && (
        <AutoRecognitionDialog
          images={sortedImages}
          open={!!autoRecognitionMode}
          mode={autoRecognitionMode}
          onOpenChange={(open) => {
            if (!open) {
              setAutoRecognitionMode(null)
              loadRecognitionStats()
              loadPhotoFaces()
            }
          }}
        />
      )}

      {showUnknownFaces && (
        <UnknownFacesReviewDialog
          open={showUnknownFaces}
          onOpenChange={(open) => {
            setShowUnknownFaces(open)
            if (!open) {
              // Всегда обновляем при закрытии (в т.ч. досрочном)
              loadRecognitionStats()
              loadPhotoFaces()
            }
          }}
          galleryId={galleryId}
          onComplete={() => {
            // onComplete вызывается когда все кластеры обработаны
            // Дополнительное обновление уже не нужно - сделано в onOpenChange
          }}
        />
      )}
    </>
  )
}

type SortOption = "filename" | "created" | "added"
