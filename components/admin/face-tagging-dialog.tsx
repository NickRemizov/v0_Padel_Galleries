"use client"

import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FaceRecognitionDetailsDialog, type DetailedFace } from "./face-recognition-details-dialog"
import type { TaggedFace } from "@/lib/types"
import { useState, useEffect, useRef, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Save, X, Plus, Maximize2, Minimize2, Scan, Check } from "lucide-react"
// import { createClient } from "@/lib/supabase/client"
import type { Person } from "@/lib/types"
import { AddPersonDialog } from "./add-person-dialog"
import { debounce } from "@/lib/debounce"
import { processPhotoAction, batchVerifyFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities" // Add import for people action

const VERSION = "v6.1" // Fixed: add markPhotoAsProcessedAction on save

interface FaceTaggingDialogProps {
  imageId: string
  imageUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: () => void
  hasBeenProcessed?: boolean
}

export function FaceTaggingDialog({
  imageId,
  imageUrl,
  open,
  onOpenChange,
  onSave,
  hasBeenProcessed = false,
}: FaceTaggingDialogProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [taggedFaces, setTaggedFaces] = useState<TaggedFace[]>([])
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [imageFitMode, setImageFitMode] = useState<"contain" | "cover">("contain")
  const [redetecting, setRedetecting] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailedFaces, setDetailedFaces] = useState<DetailedFace[]>([])
  const [hasRedetectedData, setHasRedetectedData] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedSave = useMemo(
    () =>
      debounce((faces: TaggedFace[]) => {
        console.log(`[${VERSION}] Debounced save triggered for`, faces.length, "faces")
      }, 500),
    [],
  )

  const getDisplayFileName = () => {
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
  }

  const displayFileName = getDisplayFileName()
  const fullFileName = (() => {
    try {
      const rawFileName = imageUrl.split("/").pop()?.split("?")[0] || "unknown"
      const decodedFileName = decodeURIComponent(rawFileName)
      return decodedFileName.replace(/-[a-zA-Z0-9]{20,}(\.[^.]+)$/, "$1")
    } catch {
      return imageUrl.split("/").pop()?.split("?")[0] || "unknown"
    }
  })()

  useEffect(() => {
    if (open) {
      loadPeopleAndExistingFaces()
    }
  }, [open])

  useEffect(() => {
    if (!showAddPerson && open) {
      loadPeople()
    }
  }, [showAddPerson, open])

  async function loadPeople() {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }

  async function loadPeopleAndExistingFaces() {
    console.log(`[${VERSION}] loadPeopleAndExistingFaces called`)

    await loadPeople()

    try {
      const result = await processPhotoAction(imageId)

      if (!result.success || !result.faces) {
        console.log(`[${VERSION}] No faces returned from process-photo`)
        setTaggedFaces([])
        return
      }

      console.log(`[${VERSION}] Process photo returned ${result.faces.length} faces`)

      const tagged: TaggedFace[] = result.faces.map((f: any) => ({
        id: f.id,
        face: {
          boundingBox: f.insightface_bbox,
          confidence: f.insightface_confidence,
          blur_score: 0,
          embedding: null, // Backend manages embeddings
        },
        personId: f.person_id,
        personName: f.people?.real_name || f.people?.telegram_name || null,
        recognitionConfidence: f.recognition_confidence,
        verified: f.verified,
      }))

      console.log(`[${VERSION}] Tagged faces:`, tagged)

      setTaggedFaces(tagged)
      drawFaces(tagged)
    } catch (error) {
      console.error(`[${VERSION}] Error loading faces:`, error)
    }
  }

  async function handleRedetect() {
    if (redetecting) return

    setRedetecting(true)
    try {
      console.log(`[${VERSION}] Starting FORCE redetect for image ${imageId}`)

      const result = await processPhotoAction(imageId, true, false)

      if (!result.success || !result.faces) {
        throw new Error(result.error || "Failed to redetect faces")
      }

      console.log(`[${VERSION}] Redetect successful, found ${result.faces.length} faces`)

      // Map to TaggedFace format
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
      setDetailedFaces(detailed) // Set detailed faces for metrics dialog
      drawFaces(tagged)
      setHasRedetectedData(true)
    } catch (error) {
      console.error(`[${VERSION}] Error redetecting faces:`, error)
      alert(`Error redetecting faces: ${error}`)
    } finally {
      setRedetecting(false)
    }
  }

  function getFaceColor(index: number): string {
    const colors = [
      "#ef4444", // red
      "#3b82f6", // blue
      "#22c55e", // green
      "#f59e0b", // orange
      "#8b5cf6", // purple
      "#ec4899", // pink
      "#14b8a6", // teal
      "#f97316", // orange-red
    ]
    return colors[index % colors.length]
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
      ctx.strokeStyle = isSelected ? "#3b82f6" : faceColor
      ctx.lineWidth = isSelected ? 8 : 4
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)

      if (taggedFace.personName) {
        const confidenceText = taggedFace.recognitionConfidence
          ? ` (${Math.round(taggedFace.recognitionConfidence * 100)}%)`
          : ""
        const label = `${taggedFace.personName}${confidenceText}`

        ctx.font = "bold 20px sans-serif"
        const textWidth = ctx.measureText(label).width
        const padding = 10
        const labelHeight = 32

        const labelX = boundingBox.x
        const labelY = boundingBox.y - labelHeight - 5

        ctx.fillStyle = isSelected ? "#3b82f6" : faceColor
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

    debouncedSave(updated)
  }

  function handleRemoveFace(index: number) {
    const updated = taggedFaces.filter((_, i) => i !== index)
    setTaggedFaces(updated)
    setSelectedFaceIndex(null)
    drawFaces(updated)

    debouncedSave(updated)
  }

  async function handleSave() {
    if (saving) {
      console.log(`[${VERSION}] Save already in progress`)
      return
    }

    setSaving(true)

    try {
      const keptFaces = taggedFaces.map((face) => ({
        id: face.id,
        person_id: face.personId,
      }))

      console.log(`[${VERSION}] Saving ${keptFaces.length} faces`)

      const result = await batchVerifyFacesAction(imageId, keptFaces)

      if (!result.success) {
        console.error(`[${VERSION}] Failed to save faces:`, result.error)
        alert(`Ошибка сохранения: ${result.error}`)
        setSaving(false)
        return
      }

      // Mark photo as processed after successful save
      await markPhotoAsProcessedAction(imageId)
      console.log(`[${VERSION}] ✓ Photo marked as processed`)

      console.log(`[${VERSION}] ✓ All faces saved successfully! Verified: ${result.verified}`)
      setSaving(false)
      onSave?.()
      onOpenChange(false)
    } catch (error) {
      console.error(`[${VERSION}] Error saving faces:`, error)
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
    }
  }

  useEffect(() => {
    if (taggedFaces.length > 0 && imageRef.current?.complete) {
      drawFaces(taggedFaces)
    }
  }, [imageFitMode])

  const hasUnassignedFaces = taggedFaces.some((face) => !face.personId)
  const canSave = !saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Тегирование лиц {VERSION}</DialogTitle>
          <DialogDescription title={fullFileName}>
            Файл: {displayFileName} | Обнаружено лиц: {taggedFaces.length}. Кликните на лицо, чтобы назначить человека.
          </DialogDescription>
          <div className="absolute top-4 right-12 flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!canSave}
                    className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              {hasUnassignedFaces ? (
                <TooltipContent>
                  <p>Назначьте всех людей или удалите неизвестные лица перед сохранением</p>
                </TooltipContent>
              ) : (
                <TooltipContent>
                  <p>Сохранить без закрытия окна</p>
                </TooltipContent>
              )}
            </Tooltip>
            <Button
              variant={imageFitMode === "contain" ? "default" : "outline"}
              size="sm"
              onClick={() => setImageFitMode("contain")}
              title="Вписать в окно"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant={imageFitMode === "cover" ? "default" : "outline"}
              size="sm"
              onClick={() => setImageFitMode("cover")}
              title="Масштаб по длинной стороне"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {detecting ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Обнаружение лиц с помощью InsightFace...</span>
            </div>
          ) : (
            <>
              <div
                ref={containerRef}
                className={`relative w-full border rounded-lg bg-black flex-1 min-h-0 overflow-auto`}
              >
                <img
                  ref={imageRef}
                  src={imageUrl || "/placeholder.svg"}
                  alt="Фото для тегирования"
                  className="hidden"
                  crossOrigin="anonymous"
                  onLoad={() => {
                    drawFaces(taggedFaces)
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
                      const confidenceText = taggedFace.recognitionConfidence
                        ? ` (${Math.round(taggedFace.recognitionConfidence * 100)}%)`
                        : ""
                      return (
                        <Badge
                          key={index}
                          style={{ backgroundColor: faceColor, color: "#ffffff" }}
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

                {selectedFaceIndex !== null && (
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
                    {taggedFaces[selectedFaceIndex].personId &&
                      taggedFaces[selectedFaceIndex].recognitionConfidence !== null &&
                      !isNaN(taggedFaces[selectedFaceIndex].recognitionConfidence!) &&
                      taggedFaces[selectedFaceIndex].recognitionConfidence! > 0 && (
                        <Badge variant="secondary" className="whitespace-nowrap">
                          {Math.round(taggedFaces[selectedFaceIndex].recognitionConfidence! * 100)}%
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
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
