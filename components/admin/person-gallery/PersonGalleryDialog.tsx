"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent } from "@/components/ui/dialog"

import { FaceTaggingDialog } from "../face-tagging-dialog"
import { AvatarSelector } from "../avatar-selector"

import type { PersonGalleryDialogProps, ConfirmDialogState, SingleDeleteDialogState } from "./types"
import { usePersonGallery, usePhotoSelection, usePhotoNavigation } from "./hooks"
import {
  PersonGalleryHeader,
  PersonGalleryPhotosList,
  PersonGalleryFooter,
  ConfirmBatchDialog,
  SingleDeleteDialog,
} from "./components"

export function PersonGalleryDialog({ personId, personName, open, onOpenChange, onPhotoCountChange, onPersonUpdate }: PersonGalleryDialogProps) {
  const router = useRouter()

  // Data and operations
  const {
    photos,
    sortedPhotos,
    loading,
    unverifiedCount,
    showUnverifiedFirst,
    setShowUnverifiedFirst,
    verifyPhoto,
    batchVerifyPhotos,
    deletePhoto,
    batchDeletePhotos,
    updatePhotoFromTagging,
  } = usePersonGallery({ personId, open })

  // Selection
  const {
    selectedPhotos,
    toggleSelection,
    clearSelection,
    getVerifyButtonState,
    getPhotosToVerify,
    getSelectedPhotosArray,
  } = usePhotoSelection({ photos, unverifiedCount })

  // Navigation
  const {
    taggingImage,
    openTaggingDialog,
    closeTaggingDialog,
    goToPrevious,
    goToNext,
  } = usePhotoNavigation({ sortedPhotos, photos })

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    action: null,
    count: 0,
  })
  const [singleDeleteDialog, setSingleDeleteDialog] = useState<SingleDeleteDialogState>({
    open: false,
    photoId: null,
    filename: "",
    galleryName: "",
  })
  const [avatarSelectorOpen, setAvatarSelectorOpen] = useState(false)
  const [selectedPhotoForAvatar, setSelectedPhotoForAvatar] = useState<string | null>(null)

  // Handlers
  const handleDeletePhoto = useCallback((photoId: string) => {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return
    setSingleDeleteDialog({
      open: true,
      photoId,
      filename: photo.filename,
      galleryName: photo.gallery_name || "Неизвестная галерея",
    })
  }, [photos])

  const handleBatchVerify = useCallback(() => {
    const verifyState = getVerifyButtonState()
    if (verifyState.disabled) return
    const photosToVerify = getPhotosToVerify()
    setConfirmDialog({ open: true, action: "verify", count: photosToVerify.length })
  }, [getVerifyButtonState, getPhotosToVerify])

  const handleBatchDelete = useCallback(() => {
    setConfirmDialog({ open: true, action: "delete", count: selectedPhotos.size })
  }, [selectedPhotos.size])

  const confirmBatchAction = useCallback(async () => {
    if (confirmDialog.action === "verify") {
      const photosToVerify = getPhotosToVerify()
      try {
        await batchVerifyPhotos(photosToVerify)
        // Уведомляем родителя об изменении количества verified
        onPersonUpdate?.({ verified_delta: photosToVerify.length })
      } catch (error) {
        alert(`Ошибка верификации: ${error}`)
      }
    } else if (confirmDialog.action === "delete") {
      const photosToDelete = getSelectedPhotosArray()
      await batchDeletePhotos(photosToDelete)
      // Уведомляем родителя об изменении количества фото
      onPhotoCountChange?.(-photosToDelete.length)
    }
    setConfirmDialog({ open: false, action: null, count: 0 })
    clearSelection()
  }, [confirmDialog.action, getPhotosToVerify, getSelectedPhotosArray, batchVerifyPhotos, batchDeletePhotos, clearSelection, onPhotoCountChange, onPersonUpdate])

  const confirmSingleDelete = useCallback(async () => {
    if (!singleDeleteDialog.photoId) return
    await deletePhoto(singleDeleteDialog.photoId)
    // Уведомляем родителя об удалении одного фото
    onPhotoCountChange?.(-1)
    setSingleDeleteDialog({ open: false, photoId: null, filename: "", galleryName: "" })
  }, [singleDeleteDialog.photoId, deletePhoto, onPhotoCountChange])

  const handleOpenAvatarSelector = useCallback((photoId: string) => {
    setSelectedPhotoForAvatar(photoId)
    setAvatarSelectorOpen(true)
  }, [])

  // Wrap verifyPhoto to also notify parent
  const handleVerifyPhoto = useCallback(async (photoId: string) => {
    const success = await verifyPhoto(photoId)
    console.log("[PersonGalleryDialog] verifyPhoto result:", success, "calling onPersonUpdate")
    if (success) {
      onPersonUpdate?.({ verified_delta: 1 })
    }
  }, [verifyPhoto, onPersonUpdate])

  const handleTaggingSave = useCallback((imageId?: string, faces?: any[]) => {
    if (!imageId || !faces) return
    updatePhotoFromTagging(imageId, faces)
  }, [updatePhotoFromTagging])

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
          <PersonGalleryHeader
            personName={personName}
            photosCount={photos.length}
            unverifiedCount={unverifiedCount}
            selectedCount={selectedPhotos.size}
            showUnverifiedFirst={showUnverifiedFirst}
            verifyButtonState={verifyButtonState}
            onToggleUnverifiedFirst={() => setShowUnverifiedFirst(!showUnverifiedFirst)}
            onBatchVerify={handleBatchVerify}
            onBatchDelete={handleBatchDelete}
          />

          <div className="flex-1 overflow-y-auto space-y-4">
            <PersonGalleryPhotosList
              photos={sortedPhotos}
              selectedPhotos={selectedPhotos}
              loading={loading}
              onSelectPhoto={toggleSelection}
              onOpenTagging={openTaggingDialog}
              onDeletePhoto={handleDeletePhoto}
              onVerifyPhoto={handleVerifyPhoto}
              onOpenAvatarSelector={handleOpenAvatarSelector}
            />
          </div>

          <PersonGalleryFooter
            photosCount={photos.length}
            unverifiedCount={unverifiedCount}
          />
        </DialogContent>
      </Dialog>

      <SingleDeleteDialog
        state={singleDeleteDialog}
        personName={personName}
        onOpenChange={(next) => setSingleDeleteDialog((s) => ({ ...s, open: next }))}
        onConfirm={confirmSingleDelete}
        onCancel={() => setSingleDeleteDialog({ open: false, photoId: null, filename: "", galleryName: "" })}
      />

      <ConfirmBatchDialog
        state={confirmDialog}
        personName={personName}
        onOpenChange={(next) => setConfirmDialog((s) => ({ ...s, open: next }))}
        onConfirm={confirmBatchAction}
        onCancel={() => setConfirmDialog({ open: false, action: null, count: 0 })}
      />

      {taggingImage && (
        <FaceTaggingDialog
          imageId={taggingImage.id}
          imageUrl={taggingImage.url}
          originalFilename={taggingImage.originalFilename}
          open={!!taggingImage}
          onOpenChange={(open) => !open && closeTaggingDialog()}
          onSave={handleTaggingSave}
          onPrevious={goToPrevious}
          onNext={goToNext}
          hasPrevious={!!taggingImage.prevId}
          hasNext={!!taggingImage.nextId}
        />
      )}

      {avatarSelectorOpen && selectedPhotoForAvatar && (
        <AvatarSelector
          personId={personId}
          personName={personName}
          open={avatarSelectorOpen}
          onOpenChange={(open) => {
            setAvatarSelectorOpen(open)
            if (!open) setSelectedPhotoForAvatar(null)
          }}
          onAvatarSelected={async (avatarUrl?: string) => {
            setAvatarSelectorOpen(false)
            setSelectedPhotoForAvatar(null)
            if (avatarUrl) {
              onPersonUpdate?.({ avatar_url: avatarUrl })
            }
          }}
          preselectedPhotoId={selectedPhotoForAvatar}
        />
      )}
    </>
  )
}
