"use client"

import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FaceRecognitionDetailsDialog, type DetailedFace } from "./face-recognition-details-dialog"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Save, X, Plus, Maximize2, Minimize2, Scan, Check } from 'lucide-react'
import { savePhotoFaceAction, getPhotoFacesAction, deletePhotoFaceAction } from "@/app/admin/actions"
import { createClient } from "@/lib/supabase/client"
import type { Person, DetectedFace } from "@/lib/types"
import { AddPersonDialog } from "./add-person-dialog"
import { debounce } from "@/lib/debounce"

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://23.88.61.20:8001"

interface FaceTaggingDialogProps {
  imageId: string
  imageUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: () => void
}

interface TaggedFace {
  id?: string
  face: DetectedFace
  personId: string | null
  personName: string | null
  recognitionConfidence: number | null
  verified: boolean
}

export function FaceTaggingDialog({ imageId, imageUrl, open, onOpenChange, onSave }: FaceTaggingDialogProps) {
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
    () => debounce((faces: TaggedFace[]) => {
      console.log("[v3.11] Debounced save triggered for", faces.length, "faces")
    }, 500),
    []
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

  useEffect(() => {
    loadFacesAndPeople()
  }, [imageId])

  async function loadPeople() {
    const supabase = createClient()
    const { data } = await supabase.from("people").select("*").order("real_name", { ascending: true })
    if (data) {
      setPeople(data)
    }
  }

  async function loadPeopleAndExistingFaces() {
    await loadPeople()

    const existingResult = await getPhotoFacesAction(imageId)
    const existingFaces = existingResult.success && existingResult.data ? existingResult.data : []

    if (existingFaces.length > 0) {
      const tagged: TaggedFace[] = existingFaces.map((existing) => ({
        id: existing.id,
        face: {
          boundingBox: existing.insightface_bbox,
          confidence: existing.recognition_confidence || 0,
          blur_score: existing.blur_score,
          embedding: [],
        },
        personId: existing.person_id,
        personName: existing.people?.real_name || null,
        recognitionConfidence: existing.recognition_confidence,
        verified: existing.verified,
      }))

      setTaggedFaces(tagged)
      drawFaces(tagged)
    } else {
      await detectAndRecognizeFaces()
    }
  }

  async function loadFacesAndPeople() {
    await loadPeople()

    const existingResult = await getPhotoFacesAction(imageId)
    const existingFaces = existingResult.success && existingResult.data ? existingResult.data : []

    console.log("[v3.22] Loading existing faces for image:", imageId)
    console.log("[v3.22] Existing faces from DB:", existingFaces)

    if (existingFaces.length > 0) {
      const tagged: TaggedFace[] = existingFaces.map((existing) => ({
        id: existing.id,
        face: {
          boundingBox: existing.insightface_bbox,
          confidence: existing.recognition_confidence || 0,
          blur_score: existing.blur_score,
          embedding: [],
        },
        personId: existing.person_id,
        personName: existing.people?.real_name || null,
        recognitionConfidence: existing.recognition_confidence,
        verified: existing.verified,
      }))

      console.log(
        "[v3.22] Tagged faces after mapping:",
        tagged.map((f) => ({
          personId: f.personId,
          personName: f.personName,
          recognitionConfidence: f.recognitionConfidence,
          verified: f.verified,
        })),
      )

      setTaggedFaces(tagged)
      drawFaces(tagged)
    } else {
      await detectAndRecognizeFaces()
    }
  }

  async function detectAndRecognizeFaces() {
    try {
      setDetecting(true)
      const faces = await detectFacesInsightFace(imageUrl)
      const tagged: TaggedFace[] = await Promise.all(
        faces.map(async (face) => {
          const recognition = await recognizeFaceInsightFace(face.embedding)
          console.log("[v4.0] FaceTaggingDialog: Recognition result for face:", {
            face_bbox: face.boundingBox,
            recognition_confidence: recognition?.confidence,
            person_name: recognition?.person_name,
          })
          return {
            face,
            personId: recognition?.person_id || null,
            personName: recognition?.person_name || null,
            recognitionConfidence: recognition?.confidence || null,
            verified: false,
          }
        }),
      )

      console.log(
        "[v4.0] FaceTaggingDialog: All faces after detection:",
        tagged.map((t) => ({
          personId: t.personId,
          personName: t.personName,
          recognitionConfidence: t.recognitionConfidence,
          verified: t.verified,
        })),
      )

      setTaggedFaces(tagged)
      drawFaces(tagged)
    } catch (error) {
      console.error("Error detecting faces:", error)
    } finally {
      setDetecting(false)
    }
  }

  async function detectFacesInsightFace(imageUrl: string): Promise<DetectedFace[]> {
    const apiUrl = `/api/face-detection/detect`
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, apply_quality_filters: true }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Detect faces error:", error)
      throw new Error("Failed to detect faces")
    }

    const data = await response.json()

    return data.faces.map((face: any) => ({
      boundingBox: face.insightface_bbox,
      confidence: face.confidence,
      blur_score: face.blur_score,
      embedding: face.embedding,
    }))
  }

  async function recognizeFaceInsightFace(embedding: number[]) {
    const apiUrl = `/api/face-detection/recognize`
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding: embedding,
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    console.log("[v4.0] FaceTaggingDialog: Recognition API response:", data)

    if (!data.person_id) {
      return null
    }

    const supabase = createClient()
    const { data: person } = await supabase.from("people").select("real_name").eq("id", data.person_id).single()

    return {
      person_id: data.person_id,
      person_name: person?.real_name || null,
      confidence: data.confidence,
    }
  }

  function calculateIoU(box1: any, box2: any): number {
    if (!box1 || !box2) {
      console.log("[v0] calculateIoU: one of the boxes is null", { box1, box2 })
      return 0
    }

    const x1 = Math.max(box1.x, box2.x)
    const y1 = Math.max(box1.y, box2.y)
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width)
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height)

    if (x2 < x1 || y2 < y1) return 0

    const intersection = (x2 - x1) * (y2 - y1)
    const area1 = box1.width * box1.height
    const area2 = box2.width * box2.height
    const union = area1 + area2 - intersection

    return intersection / union
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

  async function handleSaveWithoutClose() {
    if (saving) {
      console.log("[v3.11] Save already in progress, ignoring")
      return
    }
    
    setSaving(true)
    try {
      const existingResult = await getPhotoFacesAction(imageId)
      const existingFaces = existingResult.success && existingResult.data ? existingResult.data : []

      for (const face of existingFaces) {
        await deletePhotoFaceAction(face.id)
      }

      if (taggedFaces.length === 0) {
        const result = await savePhotoFaceAction(imageId, null, null, [], null, null, false)

        if (!result.success) {
          console.error("Save failed:", result.error)
          alert(`Ошибка сохранения: ${result.error}`)
          setSaving(false)
          return
        }
      } else {
        for (const taggedFace of taggedFaces) {
          if (!taggedFace.personId) continue

          const isVerified = true
          const recognitionConfidenceToSave = taggedFace.recognitionConfidence ?? 1.0
          const confidenceToSave = taggedFace.face.confidence ?? 1.0

          const result = await savePhotoFaceAction(
            imageId,
            taggedFace.personId,
            taggedFace.face.boundingBox,
            taggedFace.face.embedding,
            confidenceToSave,
            recognitionConfidenceToSave,
            isVerified,
          )

          if (!result.success) {
            console.error("Save failed:", result.error)
            if (result.errorDetail) {
              console.error("Error details:", result.errorDetail)
            }
            alert(`Ошибка сохранения: ${result.error}`)
            setSaving(false)
            return
          }
        }
      }

      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error("Error saving face tags:", error)
      alert("Ошибка при сохранении тегов")
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (saving) {
      console.log("[v3.11] Save already in progress, ignoring")
      return
    }
    
    setSaving(true)
    try {
      const existingResult = await getPhotoFacesAction(imageId)
      const existingFaces = existingResult.success && existingResult.data ? existingResult.data : []

      for (const face of existingFaces) {
        await deletePhotoFaceAction(face.id)
      }

      if (taggedFaces.length === 0) {
        const result = await savePhotoFaceAction(imageId, null, null, [], null, null, false)

        if (!result.success) {
          console.error("Save failed:", result.error)
          alert(`Ошибка сохранения: ${result.error}`)
          setSaving(false)
          return
        }
      } else {
        for (const taggedFace of taggedFaces) {
          if (!taggedFace.personId) continue

          const isVerified = true
          const recognitionConfidenceToSave = taggedFace.recognitionConfidence ?? 1.0
          const confidenceToSave = taggedFace.face.confidence ?? 1.0

          const result = await savePhotoFaceAction(
            imageId,
            taggedFace.personId,
            taggedFace.face.boundingBox,
            taggedFace.face.embedding,
            confidenceToSave,
            recognitionConfidenceToSave,
            isVerified,
          )

          if (!result.success) {
            console.error("Save failed:", result.error)
            if (result.errorDetail) {
              console.error("Error details:", result.errorDetail)
            }
            alert(`Ошибка сохранения: ${result.error}`)
            setSaving(false)
            return
          }
        }
      }

      onOpenChange(false)
      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error("Error saving face tags:", error)
      alert("Ошибка при сохранении тегов")
    } finally {
      setSaving(false)
    }
  }

  async function handleRedetect() {
    try {
      setRedetecting(true)
      const faces = await detectFacesInsightFace(imageUrl)
      const tagged: TaggedFace[] = await Promise.all(
        faces.map(async (face) => {
          const recognition = await recognizeFaceInsightFace(face.embedding)
          return {
            face,
            personId: recognition?.person_id || null,
            personName: recognition?.person_name || null,
            recognitionConfidence: recognition?.confidence || null,
            verified: false,
          }
        }),
      )
      setTaggedFaces(tagged)
      setSelectedFaceIndex(0)
      setHasRedetectedData(true)
    } catch (error) {
      console.error("Error redetecting faces:", error)
    } finally {
      setRedetecting(false)
    }
  }

  async function handleRedetectWithoutFilters() {
    try {
      setRedetecting(true)
      console.log("[v0] Redetecting faces WITHOUT quality filters")

      const apiUrl = `/api/face-detection/detect`
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          apply_quality_filters: false,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to detect faces")
      }

      const data = await response.json()
      console.log("[v0] Redetection result:", data)

      const faces: DetectedFace[] = data.faces.map((face: any) => ({
        boundingBox: face.insightface_bbox,
        confidence: face.confidence,
        blur_score: face.blur_score,
        embedding: face.embedding,
      }))

      const tagged: TaggedFace[] = await Promise.all(
        faces.map(async (face) => {
          const recognition = await recognizeFaceInsightFace(face.embedding)
          return {
            face,
            personId: recognition?.person_id || null,
            personName: recognition?.person_name || null,
            recognitionConfidence: recognition?.confidence || null,
            verified: false,
          }
        }),
      )

      setTaggedFaces(tagged)
      drawFaces(tagged)

      const detailed: DetailedFace[] = data.faces.map((face: any, index: number) => {
        const bbox = face.insightface_bbox
        const size = Math.min(bbox.width, bbox.height)

        return {
          boundingBox: bbox,
          size: size,
          blur_score: face.blur_score,
          detection_score: face.confidence,
          recognition_confidence: tagged[index].recognitionConfidence || undefined,
          embedding_quality: face.embedding
            ? Math.sqrt(face.embedding.reduce((sum: number, val: number) => sum + val * val, 0))
            : undefined,
          distance_to_nearest: face.distance_to_nearest,
          top_matches: face.top_matches || [],
          person_name: tagged[index].personName || undefined,
        }
      })

      console.log("[v0] Detailed faces:", detailed)
      setDetailedFaces(detailed)
      setHasRedetectedData(true)
    } catch (error) {
      console.error("[v0] Error redetecting faces:", error)
      alert("Ошибка при повторном распознавании")
    } finally {
      setRedetecting(false)
    }
  }

  useEffect(() => {
    if (taggedFaces.length > 0 && imageRef.current?.complete) {
      drawFaces(taggedFaces)
    }
  }, [imageFitMode])

  const hasUnassignedFaces = taggedFaces.some((face) => !face.personId)
  const canSave = !saving && !hasUnassignedFaces

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Тегирование лиц v3.10</DialogTitle>
          <DialogDescription title={fullFileName}>
            Файл: {displayFileName} | Обнаружено лиц: {taggedFaces.length}. Кликните на лицо, чтобы назначить человека.
          </DialogDescription>
          <div className="absolute top-4 right-12 flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    onClick={handleSaveWithoutClose}
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedetectWithoutFilters}
                disabled={redetecting || detecting}
              >
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
