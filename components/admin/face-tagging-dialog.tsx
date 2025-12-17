"use client"

import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FaceRecognitionDetailsDialog, type DetailedFace } from "./face-recognition-details-dialog"
import type { TaggedFace } from "@/lib/types"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Save, X, Plus, Maximize2, Minimize2, Scan, Check, ChevronLeft, ChevronRight } from "lucide-react"
import type { Person } from "@/lib/types"
import { AddPersonDialog } from "./add-person-dialog"
import { processPhotoAction, batchVerifyFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"

const VERSION = "v6.7" // Update badges on dialog close

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
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Track which imageId data was loaded for
  const loadedForImageIdRef = useRef<string | null>(null)
  const currentImageIdRef = useRef<string>(imageId)
  // Track faces for the current image (to update badges on close)
  const taggedFacesRef = useRef<TaggedFace[]>([])

  // Update refs when state changes
  useEffect(() => {
    currentImageIdRef.current = imageId
  }, [imageId])
  
  useEffect(() => {
    taggedFacesRef.current = taggedFaces
  }, [taggedFaces])

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

  // Clear canvas immediately
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // Handle dialog close - update badges with loaded faces
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && loadedForImageIdRef.current === currentImageIdRef.current) {
      // Dialog closing and we have loaded faces for this image - update badges
      console.log(`[${VERSION}] Dialog closing, updating badges with ${taggedFacesRef.current.length} faces`)
      onSave?.(currentImageIdRef.current, taggedFacesRef.current, false)
    }
    onOpenChange(newOpen)
  }, [onOpenChange, onSave])

  // INSTANT reset when imageId changes
  useEffect(() => {
    if (!open) return
    
    console.log(`[${VERSION}] imageId changed to ${imageId}`)
    
    // Instant state reset
    setTaggedFaces([])
    setDetailedFaces([])
    setSelectedFaceIndex(null)
    setHasRedetectedData(false)
    setImageLoaded(false)
    setLoadingFaces(true)
    loadedForImageIdRef.current = null
    clearCanvas()
    
    // Start loading faces for this image
    loadFacesForImage(imageId)
  }, [imageId, open])

  // Load people once when dialog opens
  useEffect(() => {
    if (open) {
      loadPeople()
    }
  }, [open])

  // Reload people after adding new person
  useEffect(() => {
    if (!showAddPerson && open) {
      loadPeople()
    }
  }, [showAddPerson, open])

  // Draw faces ONLY when both image AND data are ready for CURRENT imageId
  useEffect(() => {
    const isDataReady = loadedForImageIdRef.current === imageId && taggedFaces.length >= 0 && !loadingFaces
    const isImageReady = imageLoaded && imageRef.current?.complete
    
    if (isDataReady && isImageReady) {
      console.log(`[${VERSION}] Both ready for ${imageId}, drawing ${taggedFaces.length} faces`)
      drawFaces(taggedFaces)
    }
  }, [imageLoaded, taggedFaces, loadingFaces, imageId])

  async function loadPeople() {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }

  async function loadFacesForImage(targetImageId: string) {
    console.log(`[${VERSION}] Loading faces for ${targetImageId}`)
    
    try {
      const result = await processPhotoAction(targetImageId)

      // Check if this is still the current image (user might have navigated away)
      if (currentImageIdRef.current !== targetImageId) {
        console.log(`[${VERSION}] Image changed during load (${targetImageId} -> ${currentImageIdRef.current}), ignoring`)
        return
      }

      if (!result.success || !result.faces) {
        console.log(`[${VERSION}] No faces for ${targetImageId}`)
        setTaggedFaces([])
        loadedForImageIdRef.current = targetImageId
        setLoadingFaces(false)
        return
      }

      const tagged: TaggedFace[] = result.faces.map((f: any) => ({
        id: f.id,
        face: {
          boundingBox: f.insightface_bbox,
          confidence: f.insightface_confidence,
          blur_score: 0,
          embedding: null,
        },
        personId: f.person_id,
        personName: f.people?.real_name || f.people?.telegram_name || null,
        recognitionConfidence: f.recognition_confidence,
        verified: f.verified,
      }))

      console.log(`[${VERSION}] Loaded ${tagged.length} faces for ${targetImageId}`)
      
      setTaggedFaces(tagged)
      loadedForImageIdRef.current = targetImageId
      setLoadingFaces(false)
    } catch (error) {
      console.error(`[${VERSION}] Error loading faces:`, error)
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

      const tagged: TaggedFace[] = result.faces.map((f: any) => ({
        id: f.id,
        face: {
          boundingBox: f.insightface_bbox,
          confidence: f.insightface_confidence,
          blur_score: 0,
          embedding: null,
        },
        personId: f.person_id,
        personName: f.people?.real_name || f.people?.telegram_name || null,
        recognitionConfidence: f.recognition_confidence,
        verified: f.verified,
      }))

      const detailed: DetailedFace[] = result.faces.map((f: any) => ({
        boundingBox: f.insightface_bbox,
        size: Math.max(f.insightface_bbox.width, f.insightface_bbox.height),
        blur_score: f.blur_score,
        detection_score: f.insightface_confidence,
        recognition_confidence: f.recognition_confidence,
        embedding_quality: f.embedding_quality,
        distance_to_nearest: f.distance_to_nearest,
        top_matches: f.top_matches,
        person_name: f.people?.real_name || f.people?.telegram_name || null,
      }))

      setTaggedFaces(tagged)
      setDetailedFaces(detailed)
      loadedForImageIdRef.current = imageId
      drawFaces(tagged)
      setHasRedetectedData(true)
    } catch (error) {
      console.error(`[${VERSION}] Error redetecting:`, error)
      alert(`Error: ${error}`)
    } finally {
      setRedetecting(false)
    }
  }

  function getFaceColor(index: number): string {
    const colors = [
      "#ef4444", "#3b82f6", "#22c55e", "#f59e0b",
      "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    ]
    return colors[index % colors.length]
  }

  function getConfidenceDisplay(face: TaggedFace): string {
    if (face.verified) {
      return " ✓"
    }
    if (face.recognitionConfidence) {
      return ` (${Math.round(face.recognitionConfidence * 100)}%)`
    }
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
    updated[selectedFaceIndex] = {
      ...updated[selectedFaceIndex],
      personId: person.id,
      personName: person.real_name,
      verified: true,
    }
    setTaggedFaces(updated)
    drawFaces(updated)
  }

  function handleAssignFromDetails(faceIndex: number, personId: string, personName: string) {
    const updated = [...taggedFaces]
    if (faceIndex >= 0 && faceIndex < updated.length) {
      updated[faceIndex] = {
        ...updated[faceIndex],
        personId: personId,
        personName: personName,
        verified: true,
      }
      setTaggedFaces(updated)
      drawFaces(updated)
      
      const updatedDetailed = [...detailedFaces]
      if (faceIndex < updatedDetailed.length) {
        updatedDetailed[faceIndex] = {
          ...updatedDetailed[faceIndex],
          person_name: personName,
        }
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
      const keptFaces = taggedFaces.map((face) => ({
        id: face.id,
        person_id: face.personId,
      }))

      const result = await batchVerifyFacesAction(imageId, keptFaces)

      if (!result.success) {
        alert(`Ошибка сохранения: ${result.error}`)
        setSaving(false)
        return
      }

      await markPhotoAsProcessedAction(imageId)

      // Update local state to reflect verification
      const updatedFaces = taggedFaces.map(face => ({
        ...face,
        verified: face.personId ? true : face.verified
      }))
      setTaggedFaces(updatedFaces)
      drawFaces(updatedFaces)
      
      // Notify parent with indexRebuilt flag from backend response
      const indexRebuilt = result.verified === true || (result as any).index_rebuilt === true
      onSave?.(imageId, updatedFaces, indexRebuilt)
      
      setSaving(false)
    } catch (error) {
      console.error(`[${VERSION}] Error saving:`, error)
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
    }
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)

    try {
      const keptFaces = taggedFaces.map((face) => ({
        id: face.id,
        person_id: face.personId,
      }))

      const result = await batchVerifyFacesAction(imageId, keptFaces)

      if (!result.success) {
        alert(`Ошибка сохранения: ${result.error}`)
        setSaving(false)
        return
      }

      await markPhotoAsProcessedAction(imageId)

      // Update local state
      const updatedFaces = taggedFaces.map(face => ({
        ...face,
        verified: face.personId ? true : face.verified
      }))
      
      // Notify parent with indexRebuilt flag
      const indexRebuilt = result.verified === true || (result as any).index_rebuilt === true
      onSave?.(imageId, updatedFaces, indexRebuilt)
      
      setSaving(false)
      onOpenChange(false)
    } catch (error) {
      console.error(`[${VERSION}] Error saving:`, error)
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
    }
  }

  // Redraw when selection or fit mode changes
  useEffect(() => {
    if (loadedForImageIdRef.current === imageId && taggedFaces.length > 0 && imageRef.current?.complete) {
      drawFaces(taggedFaces)
    }
  }, [imageFitMode, selectedFaceIndex])

  const hasUnassignedFaces = taggedFaces.some((face) => !face.personId)
  const canSave = !saving
  const isLoading = loadingFaces || !imageLoaded

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Тегирование лиц {VERSION}</DialogTitle>
          <DialogDescription title={fullFileName}>
            Файл: {displayFileName} | Обнаружено лиц: {taggedFaces.length}. Кликните на лицо, чтобы назначить человека.
          </DialogDescription>
          <div className="absolute top-4 right-12 flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onPrevious}
                      disabled={!hasPrevious || saving}
                      className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Предыдущее фото</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      onClick={handleSaveWithoutClosing}
                      disabled={!canSave}
                      className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {hasUnassignedFaces ? (
                    <p>Назначьте всех людей или удалите неизвестные лица перед сохранением</p>
                  ) : (
                    <p>Сохранить без закрытия окна</p>
                  )}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onNext}
                      disabled={!hasNext || saving}
                      className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Следующее фото</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageFitMode === "contain" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setImageFitMode("contain")}
                    className="h-8 w-8 p-0"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Вписать в окно</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageFitMode === "cover" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setImageFitMode("cover")}
                    className="h-8 w-8 p-0"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Масштаб по длинной стороне</p>
                </TooltipContent>
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
              <div
                ref={containerRef}
                className={`relative w-full border rounded-lg bg-black flex-1 min-h-0 overflow-auto`}
              >
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
                <img
                  ref={imageRef}
                  src={imageUrl || "/placeholder.svg"}
                  alt="Фото для тегирования"
                  className="hidden"
                  crossOrigin="anonymous"
                  onLoad={() => {
                    console.log(`[${VERSION}] Image loaded for ${imageId}`)
                    setImageLoaded(true)
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className={`w-full cursor-pointer ${
                    imageFitMode === "contain" ? "object-contain h-full" : "object-cover"
                  }`}
                  onClick={(e) => {
                    const canvas = canvasRef.current
                    if (!canvas) return

                    const rect = canvas.getBoundingClientRect()
                    const { renderedWidth, renderedHeight, offsetX, offsetY } = getRenderedImageDimensions(
                      canvas,
                      imageFitMode,
                    )

                    const clickX = e.clientX - rect.left
                    const clickY = e.clientY - rect.top

                    if (
                      clickX < offsetX ||
                      clickX > offsetX + renderedWidth ||
                      clickY < offsetY ||
                      clickY > offsetY + renderedHeight
                    ) {
                      return
                    }

                    const imageX = ((clickX - offsetX) / renderedWidth) * canvas.width
                    const imageY = ((clickY - offsetY) / renderedHeight) * canvas.height

                    const clickedIndex = taggedFaces.findIndex((taggedFace) => {
                      const { boundingBox } = taggedFace.face
                      if (!boundingBox) return false
                      return (
                        imageX >= boundingBox.x &&
                        imageX <= boundingBox.x + boundingBox.width &&
                        imageY >= boundingBox.y &&
                        imageY <= boundingBox.y + boundingBox.height
                      )
                    })

                    if (clickedIndex !== -1) {
                      handleFaceClick(clickedIndex)
                    }
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
                        <Badge
                          key={index}
                          style={{ backgroundColor: bgColor, color: "#ffffff" }}
                          className={`text-sm px-3 py-1.5 cursor-pointer transition-all ${
                            isSelected ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : "hover:scale-105"
                          }`}
                          onClick={() => handleFaceClick(index)}
                        >
                          {taggedFace.personName}
                          {confidenceText}
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {selectedFaceIndex !== null && taggedFaces[selectedFaceIndex] && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Select value={taggedFaces[selectedFaceIndex].personId || ""} onValueChange={handlePersonSelect}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Выберите человека" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.real_name}
                            {person.telegram_name && ` (${person.telegram_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {taggedFaces[selectedFaceIndex].personId && (
                      <Badge 
                        variant="secondary" 
                        className={`whitespace-nowrap ${taggedFaces[selectedFaceIndex].verified ? "bg-green-500 text-white" : ""}`}
                      >
                        {taggedFaces[selectedFaceIndex].verified 
                          ? "✓ Подтверждено" 
                          : `${Math.round((taggedFaces[selectedFaceIndex].recognitionConfidence || 0) * 100)}%`
                        }
                      </Badge>
                    )}
                    <Button variant="destructive" size="icon" onClick={() => handleRemoveFace(selectedFaceIndex)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddPerson(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить человека
              </Button>
              <Button variant="outline" size="sm" onClick={handleRedetect} disabled={redetecting || detecting}>
                {redetecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Повторное распознавание...
                  </>
                ) : (
                  <>
                    <Scan className="mr-2 h-4 w-4" />
                    Распознать без фильтров
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetailsDialog(true)}
                disabled={!hasRedetectedData}
              >
                Показать метрики
              </Button>
            </div>

            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Отмена
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button onClick={handleSave} disabled={!canSave}>
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Сохранение...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Сохранить
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {hasUnassignedFaces && (
                    <TooltipContent>
                      <p>Назначьте всех людей или удалите неизвестные лица перед сохранением</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </DialogContent>
      <AddPersonDialog open={showAddPerson} onOpenChange={setShowAddPerson} />
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

function getRenderedImageDimensions(canvas: HTMLCanvasElement, mode: "contain" | "cover") {
  const rect = canvas.getBoundingClientRect()
  const canvasAspect = canvas.width / canvas.height
  const displayAspect = rect.width / rect.height

  let renderedWidth: number
  let renderedHeight: number
  let offsetX: number
  let offsetY: number

  if (mode === "contain") {
    if (canvasAspect > displayAspect) {
      renderedWidth = rect.width
      renderedHeight = rect.width / canvasAspect
      offsetX = 0
      offsetY = (rect.height - renderedHeight) / 2
    } else {
      renderedHeight = rect.height
      renderedWidth = rect.height * canvasAspect
      offsetX = (rect.width - renderedWidth) / 2
      offsetY = 0
    }
  } else {
    if (canvasAspect > displayAspect) {
      renderedHeight = rect.height
      renderedWidth = rect.height * canvasAspect
      offsetX = (rect.width - renderedWidth) / 2
      offsetY = 0
    } else {
      renderedWidth = rect.width
      renderedHeight = rect.width / canvasAspect
      offsetX = 0
      offsetY = (rect.height - renderedHeight) / 2
    }
  }

  return { renderedWidth, renderedHeight, offsetX, offsetY }
}
