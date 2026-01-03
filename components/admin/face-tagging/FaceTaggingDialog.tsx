"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import type { TaggedFace, Person } from "@/lib/types"
import { generateAvatarBlob, uploadAvatarBlob, type BoundingBox } from "@/lib/avatar-utils"
import { APP_VERSION } from "@/lib/version"
import { updatePersonAvatarAction } from "@/app/admin/actions"

import { AddPersonDialog } from "../add-person-dialog"
import { FaceRecognitionDetailsDialog, type DetailedFace } from "../face-recognition-details-dialog"

import type { FaceTaggingDialogProps, ImageFitMode } from "./types"
import { getDisplayFileName, getFullFileName } from "./utils"
import { useFaceCanvas, useFaceAPI, useKeyboardShortcuts } from "./hooks"
import {
  FaceTaggingToolbar,
  FaceCanvas,
  FaceBadgesStrip,
  PersonSelector,
  FaceTaggingFooter,
} from "./components"

export function FaceTaggingDialog({
  imageId,
  imageUrl,
  open,
  onOpenChange,
  onSave,
  hasBeenProcessed = false,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: FaceTaggingDialogProps) {
  // UI state
  const [taggedFaces, setTaggedFaces] = useState<TaggedFace[]>([])
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [imageFitMode, setImageFitMode] = useState<ImageFitMode>("contain")
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailedFaces, setDetailedFaces] = useState<DetailedFace[]>([])
  const [hasRedetectedData, setHasRedetectedData] = useState(false)
  const [personSelectOpen, setPersonSelectOpen] = useState(false)
  const [autoAvatarEnabled, setAutoAvatarEnabled] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedForImageIdRef = useRef<string | null>(null)
  const currentImageIdRef = useRef<string>(imageId)
  const taggedFacesRef = useRef<TaggedFace[]>([])
  const justSavedRef = useRef<boolean>(false)

  // Custom hooks
  const { canvasRef, imageRef, clearCanvas, drawFaces } = useFaceCanvas()
  const {
    people,
    setPeople,
    saving,
    redetecting,
    loadingFaces,
    loadPeople,
    loadFacesForImage,
    redetectFaces,
    saveFaces,
  } = useFaceAPI({ imageId, onSave })

  // Sync refs
  useEffect(() => {
    currentImageIdRef.current = imageId
    justSavedRef.current = false
  }, [imageId])

  useEffect(() => {
    taggedFacesRef.current = taggedFaces
  }, [taggedFaces])

  // Load config on open
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/admin/training/config")
        if (response.ok) {
          const result = await response.json()
          console.log("[FaceTaggingDialog] Config response:", result)
          if (result.success && result.data) {
            const value = result.data.auto_avatar_on_create === true
            console.log("[FaceTaggingDialog] auto_avatar_on_create:", result.data.auto_avatar_on_create, "-> setting:", value)
            setAutoAvatarEnabled(value)
          }
        }
      } catch (error) {
        console.error("[FaceTaggingDialog] Error loading config:", error)
      }
    }
    if (open) loadConfig()
  }, [open])

  // Computed values
  const displayFileName = useMemo(() => getDisplayFileName(imageUrl), [imageUrl])
  const fullFileName = useMemo(() => getFullFileName(imageUrl), [imageUrl])
  const isLoading = loadingFaces || !imageLoaded
  const canSave = !saving
  const selectedFace = selectedFaceIndex !== null ? taggedFaces[selectedFaceIndex] : null

  const getSelectedFaceBbox = useCallback((): BoundingBox | undefined => {
    // If face is explicitly selected, use it
    if (selectedFaceIndex !== null) {
      const face = taggedFaces[selectedFaceIndex]
      if (face?.face?.boundingBox) {
        return face.face.boundingBox as BoundingBox
      }
    }
    // Fallback: if no face selected, use first unassigned face (for avatar generation)
    const unassignedFace = taggedFaces.find(f => !f.personId)
    if (unassignedFace?.face?.boundingBox) {
      return unassignedFace.face.boundingBox as BoundingBox
    }
    // Last fallback: use first face if exists
    const firstFace = taggedFaces[0]
    if (firstFace?.face?.boundingBox) {
      return firstFace.face.boundingBox as BoundingBox
    }
    return undefined
  }, [selectedFaceIndex, taggedFaces])

  // Handlers
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && loadedForImageIdRef.current === currentImageIdRef.current) {
      if (!justSavedRef.current) {
        console.log(`[${APP_VERSION}] Dialog closing without save, updating badges`)
        onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
      }
    }
    if (!newOpen) justSavedRef.current = false
    onOpenChange(newOpen)
  }, [onOpenChange, onSave])

  const handlePrevious = useCallback(() => {
    if (!onPrevious) return
    if (loadedForImageIdRef.current === currentImageIdRef.current) {
      onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
    }
    onPrevious()
  }, [onPrevious, onSave])

  const handleNext = useCallback(() => {
    if (!onNext) return
    if (loadedForImageIdRef.current === currentImageIdRef.current) {
      onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
    }
    onNext()
  }, [onNext, onSave])

  const handleFaceClick = useCallback((index: number) => {
    setSelectedFaceIndex(index === selectedFaceIndex ? null : index)
  }, [selectedFaceIndex])

  // v1.1.13: Auto-generate avatar when assigning person without avatar and without photos
  const handlePersonSelect = useCallback(async (personId: string) => {
    if (selectedFaceIndex === null) return
    const person = people.find((p) => p.id === personId)
    if (!person) return

    // Update UI immediately
    const updated = [...taggedFaces]
    updated[selectedFaceIndex] = {
      ...updated[selectedFaceIndex],
      personId: person.id,
      personName: person.real_name,
      verified: true,
    }
    setTaggedFaces(updated)
    drawFaces(updated, selectedFaceIndex)
    setPersonSelectOpen(false)

    // v1.1.13: Auto-generate avatar for new person without avatar and without linked faces
    // descriptor_count comes from backend with_stats=true (see useFaceAPI.loadPeople)
    const personWithStats = person as Person & { descriptor_count?: number }
    const shouldGenerateAvatar = 
      autoAvatarEnabled && 
      !person.avatar_url && 
      (personWithStats.descriptor_count === 0 || personWithStats.descriptor_count === undefined)
    
    console.log("[FaceTaggingDialog] Avatar generation check:", {
      autoAvatarEnabled,
      hasAvatarUrl: !!person.avatar_url,
      descriptorCount: personWithStats.descriptor_count,
      shouldGenerateAvatar
    })
    
    if (shouldGenerateAvatar) {
      const bbox = taggedFaces[selectedFaceIndex]?.face?.boundingBox as BoundingBox | undefined
      if (bbox) {
        try {
          console.log("[FaceTaggingDialog] Auto-generating avatar for existing person:", person.real_name)
          const avatarBlob = await generateAvatarBlob(imageUrl, bbox)
          const avatarUrl = await uploadAvatarBlob(avatarBlob, person.id, person.real_name)
          await updatePersonAvatarAction(person.id, avatarUrl)
          console.log("[FaceTaggingDialog] Avatar generated and assigned:", avatarUrl)
          // Reload people to update avatar_url in UI
          loadPeople()
        } catch (error) {
          console.error("[FaceTaggingDialog] Error generating avatar:", error)
          // Don't fail the assignment - just log the error
        }
      }
    }
  }, [selectedFaceIndex, people, taggedFaces, drawFaces, autoAvatarEnabled, imageUrl, loadPeople])

  const handleRemoveFace = useCallback((index: number) => {
    const updated = taggedFaces.filter((_, i) => i !== index)
    setTaggedFaces(updated)
    setSelectedFaceIndex(null)
    drawFaces(updated, null)
  }, [taggedFaces, drawFaces])

  const handlePersonCreated = useCallback((personId: string, personName: string) => {
    setShowAddPerson(false)
    loadPeople()

    let targetIndex = selectedFaceIndex
    if (targetIndex === null) {
      targetIndex = taggedFaces.findIndex((face) => !face.personId)
    }

    if (targetIndex !== null && targetIndex >= 0 && targetIndex < taggedFaces.length) {
      const updated = [...taggedFaces]
      updated[targetIndex] = {
        ...updated[targetIndex],
        personId,
        personName,
        verified: true,
      }
      setTaggedFaces(updated)
      setSelectedFaceIndex(targetIndex)
      drawFaces(updated, targetIndex)
    }
  }, [selectedFaceIndex, taggedFaces, loadPeople, drawFaces])

  const handleRedetect = useCallback(async () => {
    try {
      const { tagged, detailed } = await redetectFaces(imageId)
      setTaggedFaces(tagged)
      setDetailedFaces(detailed)
      loadedForImageIdRef.current = imageId
      drawFaces(tagged, null)
      setHasRedetectedData(true)
    } catch (error) {
      alert(`Error: ${error}`)
    }
  }, [imageId, redetectFaces, drawFaces])

  const handleAssignFromDetails = useCallback((faceIndex: number, personId: string, personName: string) => {
    const updated = [...taggedFaces]
    if (faceIndex >= 0 && faceIndex < updated.length) {
      updated[faceIndex] = {
        ...updated[faceIndex],
        personId,
        personName,
        verified: true,
      }
      setTaggedFaces(updated)
      drawFaces(updated, selectedFaceIndex)

      const updatedDetailed = [...detailedFaces]
      if (faceIndex < updatedDetailed.length) {
        updatedDetailed[faceIndex] = { ...updatedDetailed[faceIndex], person_name: personName }
        setDetailedFaces(updatedDetailed)
      }
    }
  }, [taggedFaces, detailedFaces, selectedFaceIndex, drawFaces])

  const handleSaveWithoutClosing = useCallback(async () => {
    const updatedFaces = await saveFaces(imageId, taggedFaces, false)
    if (updatedFaces) {
      setTaggedFaces(updatedFaces)
      drawFaces(updatedFaces, selectedFaceIndex)
    }
  }, [imageId, taggedFaces, selectedFaceIndex, saveFaces, drawFaces])

  const handleSave = useCallback(async () => {
    await saveFaces(imageId, taggedFaces, true, onOpenChange, justSavedRef)
  }, [imageId, taggedFaces, saveFaces, onOpenChange])

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current
    if (img) setIsLandscape(img.naturalWidth > img.naturalHeight)
    setImageLoaded(true)
  }, [imageRef])

  // Load faces when image changes
  useEffect(() => {
    if (!open) return

    setTaggedFaces([])
    setDetailedFaces([])
    setSelectedFaceIndex(null)
    setHasRedetectedData(false)
    setImageLoaded(false)
    loadedForImageIdRef.current = null
    justSavedRef.current = false
    clearCanvas()

    loadFacesForImage(imageId, currentImageIdRef).then((faces) => {
      if (currentImageIdRef.current === imageId) {
        setTaggedFaces(faces)
        loadedForImageIdRef.current = imageId
      }
    })
  }, [imageId, open, clearCanvas, loadFacesForImage])

  // Load people on open
  useEffect(() => {
    if (open) loadPeople()
  }, [open, loadPeople])

  // Draw faces when ready
  useEffect(() => {
    const isDataReady = loadedForImageIdRef.current === imageId && !loadingFaces
    const isImageReady = imageLoaded && imageRef.current?.complete
    if (isDataReady && isImageReady) {
      drawFaces(taggedFaces, selectedFaceIndex)
    }
  }, [imageLoaded, taggedFaces, loadingFaces, imageId, selectedFaceIndex, drawFaces, imageRef])

  // Redraw on mode/selection change
  useEffect(() => {
    if (loadedForImageIdRef.current === imageId && taggedFaces.length > 0 && imageRef.current?.complete) {
      drawFaces(taggedFaces, selectedFaceIndex)
    }
  }, [imageFitMode, selectedFaceIndex, imageId, taggedFaces, drawFaces, imageRef])

  // Keyboard shortcuts
  useKeyboardShortcuts({
    open,
    selectedFaceIndex,
    onRemoveFace: handleRemoveFace,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Тегирование лиц {APP_VERSION}</DialogTitle>
          <DialogDescription title={fullFileName}>
            Файл: {displayFileName} | Обнаружено лиц: {taggedFaces.length}. Кликните на лицо, чтобы назначить человека.
          </DialogDescription>
          <FaceTaggingToolbar
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            saving={saving}
            imageFitMode={imageFitMode}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSaveWithoutClosing={handleSaveWithoutClosing}
            onSetFitMode={setImageFitMode}
          />
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {detecting ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Обнаружение лиц...</span>
            </div>
          ) : (
            <>
              <FaceCanvas
                imageUrl={imageUrl}
                isLoading={isLoading}
                isLandscape={isLandscape}
                imageFitMode={imageFitMode}
                taggedFaces={taggedFaces}
                canvasRef={canvasRef}
                imageRef={imageRef}
                containerRef={containerRef}
                onImageLoad={handleImageLoad}
                onFaceClick={handleFaceClick}
              />

              <div className="flex items-center gap-3 px-1 min-h-[52px]">
                <FaceBadgesStrip
                  taggedFaces={taggedFaces}
                  selectedFaceIndex={selectedFaceIndex}
                  onFaceClick={handleFaceClick}
                />

                {selectedFaceIndex !== null && selectedFace && (
                  <PersonSelector
                    selectedFace={selectedFace}
                    people={people}
                    open={personSelectOpen}
                    onOpenChange={setPersonSelectOpen}
                    onPersonSelect={handlePersonSelect}
                    onRemoveFace={() => handleRemoveFace(selectedFaceIndex)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <FaceTaggingFooter
          canSave={canSave}
          saving={saving}
          redetecting={redetecting}
          detecting={detecting}
          hasRedetectedData={hasRedetectedData}
          onAddPerson={() => setShowAddPerson(true)}
          onRedetect={handleRedetect}
          onShowMetrics={() => setShowDetailsDialog(true)}
          onCancel={() => handleOpenChange(false)}
          onSave={handleSave}
        />
      </DialogContent>

      <AddPersonDialog
        open={showAddPerson}
        onOpenChange={setShowAddPerson}
        onPersonCreated={handlePersonCreated}
        faceImageUrl={imageUrl}
        faceBbox={getSelectedFaceBbox()}
        autoAvatarEnabled={autoAvatarEnabled}
      />

      <FaceRecognitionDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        faces={detailedFaces}
        imageUrl={imageUrl}
        onAssignPerson={handleAssignFromDetails}
      />
    </Dialog>
  )
}
