"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { Images, Trash2, Upload, UserPlus, Scan } from "lucide-react"
import {
  deleteGalleryImageAction,
  deleteAllGalleryImagesAction,
  updateGallerySortOrderAction,
} from "@/app/admin/actions"
import { FaceTaggingDialog } from "../face-tagging-dialog"
import { AutoRecognitionDialog } from "../auto-recognition-dialog"
import { GalleryImageCard } from "./GalleryImageCard"
import { useGalleryImages, type SortOption } from "./useGalleryImages"
import { GalleryImageUploader } from "./GalleryImageUploader"

interface GalleryImagesManagerProps {
  galleryId: string
  galleryTitle: string
  initialSortOrder?: string
  isFullyVerified?: boolean
}

export function GalleryImagesManager({
  galleryId,
  galleryTitle,
  initialSortOrder,
  isFullyVerified,
  ...props
}: GalleryImagesManagerProps & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false)
  const [taggingImage, setTaggingImage] = useState<{ id: string; url: string; hasBeenProcessed: boolean } | null>(null)
  const [autoRecognitionMode, setAutoRecognitionMode] = useState<"all" | "remaining" | null>(null)
  const [showUnknownFaces, setShowUnknownFaces] = useState(false)
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

  const {
    images,
    sortedImages,
    loading,
    sortBy,
    setSortBy,
    recognitionStats,
    photoFacesMap,
    allPhotosVerified,
    loadImages,
    loadRecognitionStats,
    loadPhotoFaces,
  } = useGalleryImages(galleryId, open)

  const uploader = GalleryImageUploader({
    galleryId,
    onUploadComplete: async () => {
      await loadImages()
      await loadPhotoFaces()
    },
  })

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
          onDragEnter={uploader.handleDragEnter}
          onDragLeave={uploader.handleDragLeave}
          onDragOver={uploader.handleDragOver}
          onDrop={uploader.handleDrop}
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
              <DialogDescription>{galleryTitle}</DialogDescription>
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
                  onChange={uploader.handleImageUpload}
                  disabled={uploader.uploading}
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
                  variant="secondary"
                  onClick={() => setAutoRecognitionMode("remaining")}
                  disabled={uploader.uploading || allPhotosVerified}
                >
                  <Scan className="h-4 w-4 mr-2" />
                  Распознать фото
                </Button>
              )}
              {images.length > 0 && (
                <Button variant="secondary" onClick={() => setShowUnknownFaces(true)} disabled={uploader.uploading}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Неизвестные лица
                </Button>
              )}
              {images.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteAll}
                  disabled={uploader.uploading}
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
              {uploader.uploading && <span className="text-sm text-muted-foreground">{uploader.uploadProgress}</span>}
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
                  {uploader.isDragging ? (
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
                {uploader.isDragging && (
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

          <div className="flex items-center justify-end">
            <p className="text-sm text-muted-foreground">Всего фотографий: {images.length}</p>
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
            <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, action: null, count: 0 })}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmBatchDelete}>Подтвердить</AlertDialogAction>
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
              console.log("[v4.7] GalleryImagesManager: FaceTaggingDialog closed, keeping gallery open without reload")
              setTaggingImage(null)
            }
          }}
          onSave={async () => {
            console.log("[v4.7] GalleryImagesManager: FaceTaggingDialog onSave called")
            await loadRecognitionStats()
            await loadPhotoFaces()
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
    </>
  )
}
