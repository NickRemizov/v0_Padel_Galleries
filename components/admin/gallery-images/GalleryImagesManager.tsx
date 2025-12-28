"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Images } from "lucide-react"

import {
  deleteGalleryImageAction,
  deleteAllGalleryImagesAction,
  batchDeleteGalleryImagesAction,
  updateGallerySortOrderAction,
} from "@/app/admin/actions"

import { FaceTaggingDialog } from "../face-tagging-dialog"
import { AutoRecognitionDialog } from "../auto-recognition-dialog"
import { UnknownFacesReviewDialog } from "../unknown-faces-review-dialog"

import type {
  GalleryImagesManagerProps,
  SortOption,
  TaggingImageState,
  ConfirmDialogState,
  SingleDeleteDialogState,
} from "./types"
import { formatShortDate } from "./utils/image-helpers"
import { useGalleryData, useBulkSelection, useImageUpload, useImageNavigation } from "./hooks"
import {
  GalleryImageCard,
  GalleryToolbar,
  SingleDeleteDialog,
  BatchDeleteDialog,
  DragDropOverlay,
} from "./components"

export function GalleryImagesManager({
  galleryId,
  galleryTitle,
  shootDate,
  initialSortOrder,
  isFullyVerified,
  onImagesChange,
  ...props
}: GalleryImagesManagerProps & React.ComponentProps<typeof Button>) {
  // Dialog states
  const [open, setOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>((initialSortOrder as SortOption) || "filename")
  const [hideFullyVerified, setHideFullyVerified] = useState(false)
  const [taggingImage, setTaggingImage] = useState<TaggingImageState | null>(null)
  const [autoRecognitionMode, setAutoRecognitionMode] = useState<"all" | "remaining" | null>(null)
  const [showUnknownFaces, setShowUnknownFaces] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    action: null,
    count: 0,
  })
  const [singleDeleteDialog, setSingleDeleteDialog] = useState<SingleDeleteDialogState>({
    open: false,
    imageId: null,
    filename: null,
  })

  // Custom hooks
  const {
    images,
    photoFacesMap,
    photoFacesLoaded,
    recognitionStats,
    loading,
    loadAllData,
    loadImages,
    loadRecognitionStats,
    loadPhotoFaces,
    updatePhotoFacesCache,
    removeImages,
    hasVerifiedFaces,
  } = useGalleryData(galleryId)

  const {
    selectedPhotos,
    togglePhotoSelection,
    clearSelection,
    selectionCount,
  } = useBulkSelection()

  const handleUploadComplete = useCallback(async () => {
    await loadImages()
    await loadPhotoFaces()
    // Notify parent about images change
    onImagesChange?.()
  }, [loadImages, loadPhotoFaces, onImagesChange])

  const {
    uploading,
    uploadProgress,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
  } = useImageUpload({
    galleryId,
    onUploadComplete: handleUploadComplete,
  })

  const {
    sortedImages,
    hiddenCount,
    createTaggingState,
    navigateToPrevious,
    navigateToNext,
  } = useImageNavigation({
    images,
    sortBy,
    hideFullyVerified,
    photoFacesMap,
    photoFacesLoaded,
  })

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      loadAllData()
    }
  }, [open, loadAllData])

  // Computed values
  const allPhotosVerified = useMemo(() => {
    if (images.length === 0) return false
    return images.every((image) => {
      const stats = recognitionStats[image.id]
      return stats?.fullyRecognized || hasVerifiedFaces(image.id)
    })
  }, [images, recognitionStats, hasVerifiedFaces])

  const displayTitle = shootDate ? `${galleryTitle} ${formatShortDate(shootDate)}` : galleryTitle

  // Handlers
  const handleSortChange = async (value: string) => {
    setSortBy(value as SortOption)
    const result = await updateGallerySortOrderAction(galleryId, value as SortOption)
    if (result.error) {
      console.error("Failed to update gallery sort order:", result.error)
    }
  }

  const handleTagImage = useCallback(
    (imageId: string, imageUrl: string) => {
      const state = createTaggingState(imageId, imageUrl)
      if (state) {
        setTaggingImage(state)
      }
    },
    [createTaggingState]
  )

  const handleTaggingDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setTaggingImage(null)
    }
  }, [])

  const handlePreviousImage = useCallback(() => {
    const newState = navigateToPrevious(taggingImage)
    if (newState) {
      setTaggingImage(newState)
    }
  }, [taggingImage, navigateToPrevious])

  const handleNextImage = useCallback(() => {
    const newState = navigateToNext(taggingImage)
    if (newState) {
      setTaggingImage(newState)
    }
  }, [taggingImage, navigateToNext])

  const handleDelete = (imageId: string) => {
    const image = images.find((img) => img.id === imageId)
    if (!image) return
    setSingleDeleteDialog({
      open: true,
      imageId,
      filename: image.original_filename,
    })
  }

  const confirmSingleDelete = async () => {
    if (!singleDeleteDialog.imageId) return
    const imageId = singleDeleteDialog.imageId
    
    const result = await deleteGalleryImageAction(imageId, galleryId)
    if (result.success) {
      // Update local state instead of reloading from server
      removeImages([imageId])
      // Notify parent about images change
      onImagesChange?.()
    } else if (result.error) {
      console.error("Failed to delete photo:", result.error)
    }
    setSingleDeleteDialog({ open: false, imageId: null, filename: null })
  }

  const handleDeleteAll = () => {
    setConfirmDialog({
      open: true,
      action: "delete",
      count: selectionCount > 0 ? selectionCount : images.length,
    })
  }

  const confirmBatchDelete = async () => {
    setIsDeleting(true)
    try {
      if (selectionCount > 0) {
        // Delete selected photos
        const imageIds = Array.from(selectedPhotos)
        console.log(`[GalleryImagesManager] Batch deleting ${imageIds.length} photos`)
        const result = await batchDeleteGalleryImagesAction(imageIds, galleryId)
        if (result.error) {
          console.error("Failed to batch delete photos:", result.error)
          alert(`Ошибка удаления: ${result.error}`)
        } else {
          // Update local state instead of reloading from server
          removeImages(imageIds)
          // Notify parent about images change
          onImagesChange?.()
        }
        clearSelection()
      } else {
        // Delete all photos
        const allImageIds = images.map((img) => img.id)
        const result = await deleteAllGalleryImagesAction(galleryId)
        if (result.error) {
          console.error("Failed to delete all photos:", result.error)
          alert(`Ошибка удаления: ${result.error}`)
        } else {
          // Update local state instead of reloading from server
          removeImages(allImageIds)
          // Notify parent about images change
          onImagesChange?.()
        }
      }
    } finally {
      setIsDeleting(false)
      setConfirmDialog({ open: false, action: null, count: 0 })
    }
  }

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

            <GalleryToolbar
              hasImages={images.length > 0}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              hideFullyVerified={hideFullyVerified}
              onToggleHideVerified={() => setHideFullyVerified(!hideFullyVerified)}
              uploading={uploading}
              uploadProgress={uploadProgress}
              onUpload={handleFileInputChange}
              onAutoRecognition={() => setAutoRecognitionMode("remaining")}
              onShowUnknownFaces={() => setShowUnknownFaces(true)}
              onDeleteAll={handleDeleteAll}
              isDeleting={isDeleting}
              selectedCount={selectionCount}
              onClearSelection={clearSelection}
              allPhotosVerified={allPhotosVerified}
            />
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
                    <DragDropOverlay isEmptyState />
                  ) : (
                    <p className="text-muted-foreground">
                      Нет фотографий. Загрузите первые фото!
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="relative">
                {isDragging && <DragDropOverlay />}
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
              <p className="text-sm text-blue-600 font-medium">Скрыто: {hiddenCount}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Всего фотографий: {images.length}
              {hideFullyVerified && photoFacesLoaded && hiddenCount > 0 && ` (показано: ${sortedImages.length})`}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <SingleDeleteDialog
        state={singleDeleteDialog}
        galleryTitle={galleryTitle}
        onOpenChange={(open) => setSingleDeleteDialog((s) => ({ ...s, open }))}
        onConfirm={confirmSingleDelete}
      />

      <BatchDeleteDialog
        state={confirmDialog}
        galleryTitle={galleryTitle}
        selectedCount={selectionCount}
        isDeleting={isDeleting}
        onOpenChange={(open) => setConfirmDialog((s) => ({ ...s, open }))}
        onCancel={() => setConfirmDialog({ open: false, action: null, count: 0 })}
        onConfirm={confirmBatchDelete}
      />

      {taggingImage && (
        <FaceTaggingDialog
          imageId={taggingImage.id}
          imageUrl={taggingImage.url}
          hasBeenProcessed={taggingImage.hasBeenProcessed}
          open={!!taggingImage}
          onOpenChange={handleTaggingDialogClose}
          onSave={updatePhotoFacesCache}
          onPrevious={handlePreviousImage}
          onNext={handleNextImage}
          hasPrevious={!!taggingImage.prevId}
          hasNext={!!taggingImage.nextId}
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
              loadRecognitionStats()
              loadPhotoFaces()
            }
          }}
          galleryId={galleryId}
          onComplete={() => {}}
        />
      )}
    </>
  )
}
