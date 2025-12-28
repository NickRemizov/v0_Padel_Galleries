"use client"

import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FaceRecognitionDetailsDialog, type DetailedFace } from "./face-recognition-details-dialog"
import type { TaggedFace } from "@/lib/types"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Loader2, Save, X, Plus, Maximize2, Minimize2, Scan, Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"
import type { Person } from "@/lib/types"
import { AddPersonDialog } from "./add-person-dialog"
import { processPhotoAction, batchVerifyFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { APP_VERSION } from "@/lib/version"
import { formatPersonDisplayName, getPersonSearchString } from "@/lib/utils/person-display"
import type { BoundingBox } from "@/lib/avatar-utils"

interface FaceTaggingDialogProps {
  imageId: string
  imageUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (imageId: string, faces: TaggedFace[], indexRebuilt?: boolean) => void
  hasBeenProcessed?: boolean
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

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
  const [people, setPeople] = useState<Person[]>([])
  const [taggedFaces, setTaggedFaces] = useState<TaggedFace[]>([])
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [loadingFaces, setLoadingFaces] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [imageFitMode, setImageFitMode] = useState<"contain" | "cover">("contain")
  const [redetecting, setRedetecting] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailedFaces, setDetailedFaces] = useState<DetailedFace[]>([])
  const [hasRedetectedData, setHasRedetectedData] = useState(false)
  const [personSelectOpen, setPersonSelectOpen] = useState(false)
  const [autoAvatarEnabled, setAutoAvatarEnabled] = useState(true)
  const [isLandscape, setIsLandscape] = useState(false)
  const [isAutoRecognizing, setIsAutoRecognizing] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const loadedForImageIdRef = useRef<string | null>(null)
  const currentImageIdRef = useRef<string>(imageId)
  const taggedFacesRef = useRef<TaggedFace[]>([])
  const justSavedRef = useRef<boolean>(false)

  useEffect(() => {
    currentImageIdRef.current = imageId
    justSavedRef.current = false
  }, [imageId])
  
  useEffect(() => {
    taggedFacesRef.current = taggedFaces
  }, [taggedFaces])

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/admin/training/config")
        if (response.ok) {
          const result = await response.json()
          // Unified format: {success, data, error, code}
          if (result.success && result.data) {
            setAutoAvatarEnabled(result.data.auto_avatar_on_create ?? true)
          }
        }
      } catch (error) {
        console.error("[FaceTaggingDialog] Error loading config:", error)
      }
    }
    if (open) {
      loadConfig()
    }
  }, [open])

  const getDisplayFileName = useCallback(() => {
    try {
      const rawFileName = imageUrl.split("/").pop()?.split("?")[0] || "unknown"
      const decodedFileName = decodeURIComponent(rawFileName)
      const cleanedFileName = decodedFileName.replace(/-[a-zA-Z0-9]{20,}(\.[^.]+)$/, "$1")
      const maxLength = 50
      if (cleanedFileName.length > maxLength) {
        return cleanedFileName.substring(0, maxLength) + "..."
      }
      return cleanedFileName
    } catch (error) {
      return imageUrl.split("/").pop()?.split("?")[0] || "unknown"
    }
  }, [imageUrl])

  const displayFileName = getDisplayFileName()
  const fullFileName = useMemo(() => {
    try {
      const rawFileName = imageUrl.split("/").pop()?.split("?")[0] || "unknown"
      const decodedFileName = decodeURIComponent(rawFileName)
      return decodedFileName.replace(/-[a-zA-Z0-9]{20,}(\.[^.]+)$/, "$1")
    } catch {
      return imageUrl.split("/").pop()?.split("?")[0] || "unknown"
    }
  }, [imageUrl])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && loadedForImageIdRef.current === currentImageIdRef.current) {
      if (!justSavedRef.current) {
        console.log(`[${APP_VERSION}] Dialog closing without save, updating badges with ${taggedFacesRef.current.length} faces`)
        onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
      } else {
        console.log(`[${APP_VERSION}] Dialog closing after save, skipping onSave (already called)`)
      }
    }
    if (!newOpen) {
      justSavedRef.current = false
    }
    onOpenChange(newOpen)
  }, [onOpenChange, onSave])

  const handlePrevious = useCallback(() => {
    if (!onPrevious) return
    if (loadedForImageIdRef.current === currentImageIdRef.current) {
      console.log(`[${APP_VERSION}] Navigating to previous, updating badge for ${currentImageIdRef.current}`)
      onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
    }
    onPrevious()
  }, [onPrevious, onSave])

  const handleNext = useCallback(() => {
    if (!onNext) return
    if (loadedForImageIdRef.current === currentImageIdRef.current) {
      console.log(`[${APP_VERSION}] Navigating to next, updating badge for ${currentImageIdRef.current}`)
      onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
    }
    onNext()
  }, [onNext, onSave])

  // Auto-recognize unverified faces using HNSWLIB index
  async function autoRecognizeFaces(targetImageId: string): Promise<boolean> {
    try {
      console.log(`[${APP_VERSION}] Auto-recognizing faces for ${targetImageId}`)
      const response = await fetch(`/api/images/${targetImageId}/auto-recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) {
        console.error(`[${APP_VERSION}] Auto-recognize failed: ${response.status}`)
        return false
      }
      const result = await response.json()
      console.log(`[${APP_VERSION}] Auto-recognize result:`, result)
      return result.success && result.data?.recognized_count > 0
    } catch (error) {
      console.error(`[${APP_VERSION}] Auto-recognize error:`, error)
      return false
    }
  }

  useEffect(() => {
    if (!open) return
    console.log(`[${APP_VERSION}] imageId changed to ${imageId}`)
    setTaggedFaces([])
    setDetailedFaces([])
    setSelectedFaceIndex(null)
    setHasRedetectedData(false)
    setImageLoaded(false)
    setLoadingFaces(true)
    setIsAutoRecognizing(false)
    loadedForImageIdRef.current = null
    justSavedRef.current = false
    clearCanvas()
    loadFacesForImage(imageId, hasBeenProcessed)
  }, [imageId, open])

  useEffect(() => {
    if (open) {
      loadPeople()
    }
  }, [open])

  useEffect(() => {
    const isDataReady = loadedForImageIdRef.current === imageId && taggedFaces.length >= 0 && !loadingFaces
    const isImageReady = imageLoaded && imageRef.current?.complete
    if (isDataReady && isImageReady) {
      console.log(`[${APP_VERSION}] Both ready for ${imageId}, drawing ${taggedFaces.length} faces`)
      drawFaces(taggedFaces)
    }
  }, [imageLoaded, taggedFaces, loadingFaces, imageId])

  async function loadPeople() {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }

  async function loadFacesForImage(targetImageId: string, isProcessed: boolean) {
    console.log(`[${APP_VERSION}] Loading faces for ${targetImageId}, processed=${isProcessed}`)
    try {
      const result = await processPhotoAction(targetImageId)
      if (currentImageIdRef.current !== targetImageId) {
        console.log(`[${APP_VERSION}] Image changed during load (${targetImageId} -> ${currentImageIdRef.current}), ignoring`)
        return
      }
      if (!result.success || !result.faces) {
        console.log(`[${APP_VERSION}] No faces for ${targetImageId}`)
        setTaggedFaces([])
        loadedForImageIdRef.current = targetImageId
        setLoadingFaces(false)
        return
      }
      
      // Check if there are unverified faces that need auto-recognition
      const hasUnverified = result.faces.some((f: any) => !f.verified && !f.person_id)
      
      // For processed photos with unverified faces, run auto-recognize (index search only)
      if (isProcessed && hasUnverified) {
        console.log(`[${APP_VERSION}] Running auto-recognize for processed photo with unverified faces`)
        setIsAutoRecognizing(true)
        const recognized = await autoRecognizeFaces(targetImageId)
        setIsAutoRecognizing(false)
        
        if (recognized && currentImageIdRef.current === targetImageId) {
          // Reload faces after recognition
          console.log(`[${APP_VERSION}] Reloading faces after auto-recognition`)
          const updatedResult = await processPhotoAction(targetImageId)
          if (updatedResult.success && updatedResult.faces) {
            result.faces = updatedResult.faces
          }
        }
      }
      
      const tagged: TaggedFace[] = result.faces.map((f: any) => ({
        id: f.id,
        face: {
          boundingBox: f.insightface_bbox,
          confidence: f.insightface_det_score,
          blur_score: 0,
          embedding: null,
        },
        personId: f.person_id,
        personName: f.people?.real_name || f.people?.telegram_name || null,
        recognitionConfidence: f.recognition_confidence,
        verified: f.verified,
      }))
      console.log(`[${APP_VERSION}] Loaded ${tagged.length} faces for ${targetImageId}`)
      setTaggedFaces(tagged)
      loadedForImageIdRef.current = targetImageId
      setLoadingFaces(false)
    } catch (error) {
      console.error(`[${APP_VERSION}] Error loading faces:`, error)
      if (currentImageIdRef.current === targetImageId) {
        setTaggedFaces([])
        loadedForImageIdRef.current = targetImageId
        setLoadingFaces(false)
      }
    }
  }

  async function handleRedetect() {
    if (redetecting) return
    setRedetecting(true)
    try {
      const result = await processPhotoAction(imageId, true, false)
      if (!result.success || !result.faces) {
        throw new Error(result.error || "Failed to redetect faces")
      }
      const tagged: TaggedFace[] = result.faces.map((f: any) => {
        if (f.person_id && f.people) {
          return {
            id: f.id,
            face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
            personId: f.person_id,
            personName: f.people.real_name || f.people.telegram_name || null,
            recognitionConfidence: f.recognition_confidence,
            verified: f.verified,
          }
        }
        const topMatch = f.top_matches?.[0]
        const similarity = topMatch?.similarity || 0
        if (similarity > 0.3 && topMatch) {
          return {
            id: f.id,
            face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
            personId: topMatch.person_id || null,
            personName: topMatch.name || null,
            recognitionConfidence: similarity,
            verified: false,
          }
        }
        return {
          id: f.id,
          face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
          personId: null,
          personName: null,
          recognitionConfidence: similarity,
          verified: false,
        }
      })
      const detailed: DetailedFace[] = result.faces.map((f: any) => {
        const topMatch = f.top_matches?.[0]
        const similarity = topMatch?.similarity || 0
        let personName = f.people?.real_name || f.people?.telegram_name || null
        if (!personName && similarity > 0.3 && topMatch) {
          personName = topMatch.name || null
        }
        return {
          boundingBox: f.insightface_bbox,
          size: Math.max(f.insightface_bbox.width, f.insightface_bbox.height),
          blur_score: f.blur_score,
          detection_score: f.insightface_det_score,
          recognition_confidence: f.recognition_confidence,
          embedding_quality: f.embedding_quality,
          distance_to_nearest: f.distance_to_nearest,
          top_matches: f.top_matches,
          person_name: personName,
        }
      })
      setTaggedFaces(tagged)
      setDetailedFaces(detailed)
      loadedForImageIdRef.current = imageId
      drawFaces(tagged)
      setHasRedetectedData(true)
    } catch (error) {
      console.error(`[${APP_VERSION}] Error redetecting:`, error)
      alert(`Error: ${error}`)
    } finally {
      setRedetecting(false)
    }
  }

  function getFaceColor(index: number): string {
    const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]
    return colors[index % colors.length]
  }

  function getConfidenceDisplay(face: TaggedFace): string {
    if (face.verified) return " ✓"
    if (face.recognitionConfidence) return ` (${Math.round(face.recognitionConfidence * 100)}%)`
    return ""
  }

  function drawFaces(faces: TaggedFace[]) {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    faces.forEach((taggedFace, index) => {
      const { boundingBox } = taggedFace.face
      if (!boundingBox) return
      const isSelected = index === selectedFaceIndex
      const faceColor = getFaceColor(index)
      const borderColor = taggedFace.verified ? "#22c55e" : faceColor
      ctx.strokeStyle = isSelected ? "#3b82f6" : borderColor
      ctx.lineWidth = isSelected ? 8 : 4
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)
      if (taggedFace.personName) {
        const confidenceText = getConfidenceDisplay(taggedFace)
        const label = `${taggedFace.personName}${confidenceText}`
        ctx.font = "bold 20px sans-serif"
        const textWidth = ctx.measureText(label).width
        const padding = 10
        const labelHeight = 32
        const labelX = boundingBox.x
        const labelY = boundingBox.y - labelHeight - 5
        const bgColor = taggedFace.verified ? "#22c55e" : (isSelected ? "#3b82f6" : faceColor)
        ctx.fillStyle = bgColor
        ctx.fillRect(labelX, labelY, textWidth + padding * 2, labelHeight)
        ctx.fillStyle = "#ffffff"
        ctx.fillText(label, labelX + padding, labelY + labelHeight - 8)
      }
    })
  }

  function handleFaceClick(index: number) {
    setSelectedFaceIndex(index === selectedFaceIndex ? null : index)
  }

  function handlePersonSelect(personId: string) {
    if (selectedFaceIndex === null) return
    const person = people.find((p) => p.id === personId)
    if (!person) return
    const updated = [...taggedFaces]
    updated[selectedFaceIndex] = { ...updated[selectedFaceIndex], personId: person.id, personName: person.real_name, verified: true }
    setTaggedFaces(updated)
    drawFaces(updated)
    setPersonSelectOpen(false)
  }

  const getSelectedFaceBbox = useCallback((): BoundingBox | undefined => {
    if (selectedFaceIndex === null) return undefined
    const face = taggedFaces[selectedFaceIndex]
    if (!face?.face?.boundingBox) return undefined
    return face.face.boundingBox as BoundingBox
  }, [selectedFaceIndex, taggedFaces])

  function handlePersonCreated(personId: string, personName: string) {
    setShowAddPerson(false)
    loadPeople()
    let targetIndex = selectedFaceIndex
    if (targetIndex === null) {
      targetIndex = taggedFaces.findIndex(face => !face.personId)
    }
    if (targetIndex !== null && targetIndex >= 0 && targetIndex < taggedFaces.length) {
      console.log(`[${APP_VERSION}] Auto-assigning new person "${personName}" to face index ${targetIndex}`)
      const updated = [...taggedFaces]
      updated[targetIndex] = { ...updated[targetIndex], personId: personId, personName: personName, verified: true }
      setTaggedFaces(updated)
      setSelectedFaceIndex(targetIndex)
      drawFaces(updated)
    } else {
      console.log(`[${APP_VERSION}] No face to assign new person to`)
    }
  }

  function handleAssignFromDetails(faceIndex: number, personId: string, personName: string) {
    const updated = [...taggedFaces]
    if (faceIndex >= 0 && faceIndex < updated.length) {
      updated[faceIndex] = { ...updated[faceIndex], personId: personId, personName: personName, verified: true }
      setTaggedFaces(updated)
      drawFaces(updated)
      const updatedDetailed = [...detailedFaces]
      if (faceIndex < updatedDetailed.length) {
        updatedDetailed[faceIndex] = { ...updatedDetailed[faceIndex], person_name: personName }
        setDetailedFaces(updatedDetailed)
      }
    }
  }

  function handleRemoveFace(index: number) {
    const updated = taggedFaces.filter((_, i) => i !== index)
    setTaggedFaces(updated)
    setSelectedFaceIndex(null)
    drawFaces(updated)
  }

  async function handleSaveWithoutClosing() {
    if (saving) return
    setSaving(true)
    try {
      const keptFaces = taggedFaces.map((face) => ({ id: face.id, person_id: face.personId }))
      const result = await batchVerifyFacesAction(imageId, keptFaces)
      if (!result.success) {
        alert(`Ошибка сохранения: ${result.error}`)
        setSaving(false)
        return
      }
      await markPhotoAsProcessedAction(imageId)
      const updatedFaces = taggedFaces.map(face => ({ ...face, verified: face.personId ? true : face.verified }))
      setTaggedFaces(updatedFaces)
      drawFaces(updatedFaces)
      const indexRebuilt = result.verified === true || (result as any).index_rebuilt === true
      onSave?.(imageId, updatedFaces, indexRebuilt)
      setSaving(false)
    } catch (error) {
      console.error(`[${APP_VERSION}] Error saving:`, error)
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
    }
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const keptFaces = taggedFaces.map((face) => ({ id: face.id, person_id: face.personId }))
      const result = await batchVerifyFacesAction(imageId, keptFaces)
      if (!result.success) {
        alert(`Ошибка сохранения: ${result.error}`)
        setSaving(false)
        return
      }
      await markPhotoAsProcessedAction(imageId)
      const updatedFaces = taggedFaces.map(face => ({ ...face, verified: face.personId ? true : face.verified }))
      const indexRebuilt = result.verified === true || (result as any).index_rebuilt === true
      onSave?.(imageId, updatedFaces, indexRebuilt)
      justSavedRef.current = true
      setSaving(false)
      onOpenChange(false)
    } catch (error) {
      console.error(`[${APP_VERSION}] Error saving:`, error)
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
    }
  }

  useEffect(() => {
    if (loadedForImageIdRef.current === imageId && taggedFaces.length > 0 && imageRef.current?.complete) {
      drawFaces(taggedFaces)
    }
  }, [imageFitMode, selectedFaceIndex])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Delete" && selectedFaceIndex !== null) {
        const activeElement = document.activeElement
        if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT" || activeElement.tagName === "TEXTAREA")) {
          return
        }
        e.preventDefault()
        handleRemoveFace(selectedFaceIndex)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, selectedFaceIndex])

  const canSave = !saving
  const isLoading = loadingFaces || !imageLoaded || isAutoRecognizing
  const selectedFace = selectedFaceIndex !== null ? taggedFaces[selectedFaceIndex] : null
  const selectedFaceBbox = getSelectedFaceBbox()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Тегирование лиц {APP_VERSION}</DialogTitle>
          <DialogDescription title={fullFileName}>
            Файл: {displayFileName} | Обнаружено лиц: {taggedFaces.length}. Кликните на лицо, чтобы назначить человека.
          </DialogDescription>
          <div className="absolute top-4 right-12 flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="outline" onClick={handlePrevious} disabled={!hasPrevious || saving} className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>Предыдущее фото</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" onClick={handleSaveWithoutClosing} disabled={!canSave} className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white">
                      <Check className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>Сохранить без закрытия окна</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="outline" onClick={handleNext} disabled={!hasNext || saving} className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>Следующее фото</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={imageFitMode === "contain" ? "default" : "outline"} size="sm" onClick={() => setImageFitMode("contain")} className="h-8 w-8 p-0">
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Вписать в окно</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={imageFitMode === "cover" ? "default" : "outline"} size="sm" onClick={() => setImageFitMode("cover")} className="h-8 w-8 p-0">
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Масштаб по длинной стороне</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DialogHeader>
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {detecting ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Обнаружение лиц...</span>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="relative w-full border rounded-lg bg-black flex-1 min-h-0 overflow-auto">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                    {isAutoRecognizing && <span className="ml-2 text-white">Распознаю лица...</span>}
                  </div>
                )}
                <img ref={imageRef} src={imageUrl || "/placeholder.svg"} alt="Фото для тегирования" className="hidden" crossOrigin="anonymous"
                  onLoad={() => {
                    console.log(`[${APP_VERSION}] Image loaded for ${imageId}`)
                    const img = imageRef.current
                    if (img) { setIsLandscape(img.naturalWidth > img.naturalHeight) }
                    setImageLoaded(true)
                  }}
                />
                <canvas ref={canvasRef}
                  className={`cursor-pointer ${imageFitMode === "contain" ? "w-full h-full object-contain" : isLandscape ? "h-full w-auto" : "w-full h-auto"}`}
                  onClick={(e) => {
                    const canvas = canvasRef.current
                    if (!canvas) return
                    const rect = canvas.getBoundingClientRect()
                    const { renderedWidth, renderedHeight, offsetX, offsetY } = getRenderedImageDimensions(canvas, imageFitMode)
                    const clickX = e.clientX - rect.left
                    const clickY = e.clientY - rect.top
                    if (clickX < offsetX || clickX > offsetX + renderedWidth || clickY < offsetY || clickY > offsetY + renderedHeight) return
                    const imageX = ((clickX - offsetX) / renderedWidth) * canvas.width
                    const imageY = ((clickY - offsetY) / renderedHeight) * canvas.height
                    const clickedIndex = taggedFaces.findIndex((taggedFace) => {
                      const { boundingBox } = taggedFace.face
                      if (!boundingBox) return false
                      return imageX >= boundingBox.x && imageX <= boundingBox.x + boundingBox.width && imageY >= boundingBox.y && imageY <= boundingBox.y + boundingBox.height
                    })
                    if (clickedIndex !== -1) handleFaceClick(clickedIndex)
                  }}
                />
              </div>
              <div className="flex items-center gap-3 px-1 min-h-[52px]">
                {taggedFaces.some((face) => face.personName) && (
                  <div className="flex flex-wrap gap-2">
                    {taggedFaces.map((taggedFace, index) => {
                      if (!taggedFace.personName) return null
                      const faceColor = getFaceColor(index)
                      const isSelected = index === selectedFaceIndex
                      const confidenceText = getConfidenceDisplay(taggedFace)
                      const bgColor = taggedFace.verified ? "#22c55e" : faceColor
                      return (
                        <Badge key={index} style={{ backgroundColor: bgColor, color: "#ffffff" }}
                          className={`text-sm px-3 py-1.5 cursor-pointer transition-all ${isSelected ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : "hover:scale-105"}`}
                          onClick={() => handleFaceClick(index)}>
                          {taggedFace.personName}{confidenceText}
                        </Badge>
                      )
                    })}
                  </div>
                )}
                {selectedFaceIndex !== null && selectedFace && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Popover open={personSelectOpen} onOpenChange={setPersonSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={personSelectOpen} className="w-[250px] justify-between">
                          {selectedFace.personId ? people.find((p) => p.id === selectedFace.personId)?.real_name || selectedFace.personName : "Выберите человека..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Поиск игрока..." />
                          <CommandList>
                            <CommandEmpty>Игрок не найден</CommandEmpty>
                            <CommandGroup className="max-h-[300px] overflow-y-auto">
                              {people.map((person) => (
                                <CommandItem key={person.id} value={getPersonSearchString(person)} onSelect={() => handlePersonSelect(person.id)}>
                                  <Check className={`mr-2 h-4 w-4 ${selectedFace.personId === person.id ? "opacity-100" : "opacity-0"}`} />
                                  {formatPersonDisplayName(person)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedFace.personId && selectedFace.verified && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-9 w-9 rounded-md bg-white border-2 border-green-500 flex items-center justify-center">
                              <Check className="h-4 w-4 text-green-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent><p>Подтверждено</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {selectedFace.personId && !selectedFace.verified && (
                      <Badge variant="secondary" className="whitespace-nowrap">{Math.round((selectedFace.recognitionConfidence || 0) * 100)}%</Badge>
                    )}
                    <Button variant="destructive" size="icon" onClick={() => handleRemoveFace(selectedFaceIndex)}><X className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddPerson(true)}><Plus className="mr-2 h-4 w-4" />Добавить человека</Button>
              <Button variant="outline" size="sm" onClick={handleRedetect} disabled={redetecting || detecting}>
                {redetecting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Повторное распознавание...</>) : (<><Scan className="mr-2 h-4 w-4" />Распознать без фильтров</>)}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDetailsDialog(true)} disabled={!hasRedetectedData}>Показать метрики</Button>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Отмена</Button>
              <Button onClick={handleSave} disabled={!canSave}>
                {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Сохранение...</>) : (<><Save className="mr-2 h-4 w-4" />Сохранить</>)}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      <AddPersonDialog open={showAddPerson} onOpenChange={setShowAddPerson} onPersonCreated={handlePersonCreated} faceImageUrl={imageUrl} faceBbox={selectedFaceBbox} autoAvatarEnabled={autoAvatarEnabled} />
      <FaceRecognitionDetailsDialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog} faces={detailedFaces} imageUrl={imageUrl} onAssignPerson={handleAssignFromDetails} />
    </Dialog>
  )
}

function getRenderedImageDimensions(canvas: HTMLCanvasElement, mode: "contain" | "cover") {
  const rect = canvas.getBoundingClientRect()
  const canvasAspect = canvas.width / canvas.height
  const displayAspect = rect.width / rect.height
  let renderedWidth: number, renderedHeight: number, offsetX: number, offsetY: number
  if (mode === "contain") {
    if (canvasAspect > displayAspect) {
      renderedWidth = rect.width; renderedHeight = rect.width / canvasAspect; offsetX = 0; offsetY = (rect.height - renderedHeight) / 2
    } else {
      renderedHeight = rect.height; renderedWidth = rect.height * canvasAspect; offsetX = (rect.width - renderedWidth) / 2; offsetY = 0
    }
  } else {
    if (canvasAspect > displayAspect) {
      renderedHeight = rect.height; renderedWidth = rect.height * canvasAspect; offsetX = (rect.width - renderedWidth) / 2; offsetY = 0
    } else {
      renderedWidth = rect.width; renderedHeight = rect.width / canvasAspect; offsetX = 0; offsetY = (rect.height - renderedHeight) / 2
    }
  }
  return { renderedWidth, renderedHeight, offsetX, offsetY }
}
