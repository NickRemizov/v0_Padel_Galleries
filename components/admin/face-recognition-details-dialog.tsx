"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, Trash2, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { DetailedFace } from "./face-tagging/types"

// Re-export for backward compatibility
export type { DetailedFace }

interface FaceRecognitionDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  faces: DetailedFace[]
  imageUrl?: string
  onAssignPerson?: (faceIndex: number, personId: string, personName: string) => void
  onDeleteFace?: (faceIndex: number) => Promise<void>
}

export function FaceRecognitionDetailsDialog({
  open,
  onOpenChange,
  faces,
  imageUrl,
  onAssignPerson,
  onDeleteFace,
}: FaceRecognitionDetailsDialogProps) {
  // Track by face.id (stable) instead of index (changes on deletion)
  const [assignedFaceIds, setAssignedFaceIds] = useState<Set<string>>(new Set())
  const [deletingFaceIds, setDeletingFaceIds] = useState<Set<string>>(new Set())

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAssignedFaceIds(new Set())
      setDeletingFaceIds(new Set())
    }
  }, [open])

  // Count unknown faces (faces without person_name that haven't been assigned)
  const unknownFacesCount = faces.filter(
    face => !face.person_name && !assignedFaceIds.has(face.id)
  ).length

  const handleAssign = (faceIndex: number, faceId: string, personId: string, personName: string) => {
    if (!onAssignPerson) return

    // Call the parent's assign handler
    onAssignPerson(faceIndex, personId, personName)

    // Mark this face as assigned by ID
    setAssignedFaceIds(prev => new Set(prev).add(faceId))

    // Check if all unknown faces are now assigned
    const newAssigned = new Set(assignedFaceIds).add(faceId)
    const remainingUnknown = faces.filter(
      face => !face.person_name && !newAssigned.has(face.id)
    ).length

    // If only one unknown face total, or all unknown faces are now assigned, close dialog
    if (unknownFacesCount === 1 || remainingUnknown === 0) {
      onOpenChange(false)
    }
  }

  const handleExclude = async (faceIndex: number, faceId: string) => {
    if (!onDeleteFace) return
    // Prevent double-click using face ID (stable across re-renders)
    if (deletingFaceIds.has(faceId)) return

    // Mark as deleting by ID
    setDeletingFaceIds(prev => new Set(prev).add(faceId))

    try {
      // Call the parent's delete handler (API call + removes from arrays)
      await onDeleteFace(faceIndex)
      // Face is removed from parent's array, component will re-render with new faces
      // deletingFaceIds will have the old faceId but it won't match any face anymore
    } catch {
      // Error is already shown by parent, remove from deleting set
      setDeletingFaceIds(prev => {
        const next = new Set(prev)
        next.delete(faceId)
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Детальная информация о распознавании</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {faces.map((face, index) => {
            // Determine if this is a recognized face (exact match = verified)
            const isExactMatch = face.recognition_confidence === 1.0
            const isRecognized = face.recognition_confidence !== undefined && face.recognition_confidence > 0 && face.person_name
            const isAssigned = assignedFaceIds.has(face.id)
            const isDeleting = deletingFaceIds.has(face.id)

            // Use distance_to_nearest if available, otherwise calculate from confidence
            const distance = face.distance_to_nearest !== undefined && face.distance_to_nearest !== null
              ? face.distance_to_nearest.toFixed(3)
              : face.recognition_confidence !== undefined
                ? (1 - face.recognition_confidence).toFixed(3)
                : "N/A"

            // Card style: green for assigned
            const cardClass = isAssigned ? "border-green-500 bg-green-50" : ""

            return (
              <Card key={face.id} className={cardClass}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl flex items-center gap-2">
                      {face.person_name || `Неизвестный ${index + 1}`}
                      {isAssigned && (
                        <span className="text-green-600 text-sm font-normal">(назначен)</span>
                      )}
                    </CardTitle>
                    {onDeleteFace && !face.person_name && !isAssigned && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 w-7 p-0"
                              onClick={() => handleExclude(index, face.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Удалить эмбеддинг</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      {imageUrl && <FacePreview imageUrl={imageUrl} boundingBox={face.boundingBox} />}
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Face size</p>
                        <p className="text-lg font-semibold">{face.size.toFixed(2)} px</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Blur score</p>
                        <p className="text-lg font-semibold">
                          {face.blur_score !== undefined && face.blur_score !== null
                            ? face.blur_score.toFixed(1)
                            : "N/A"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Detection score</p>
                        <p className="text-lg font-semibold">{face.detection_score.toFixed(2)}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          {isRecognized ? "Recognition confidence" : "Distance to closest"}
                        </p>
                        <p className={`text-lg font-semibold ${isExactMatch ? "text-green-600" : ""}`}>
                          {isExactMatch
                            ? "Exact Match"
                            : isRecognized
                              ? face.recognition_confidence!.toFixed(3)
                              : distance}
                        </p>
                      </div>
                    </div>
                  </div>

                  {face.top_matches && face.top_matches.length > 0 && !face.person_name && !isAssigned && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-2">Топ-3 похожих лиц:</p>
                      <ol className="list-decimal list-inside space-y-2">
                        {face.top_matches.map((match, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="flex-1">
                              {match.name} (similarity: {match.similarity.toFixed(2)}, from: {
                                match.source_verified
                                  ? <span className="text-green-600">Verified</span>
                                  : <span className="text-amber-600">{Math.round((match.source_confidence || 0) * 100)}%</span>
                              })
                            </span>
                            {onAssignPerson && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => handleAssign(index, face.id, match.person_id, match.name)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Назначить этого игрока</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FacePreview({
  imageUrl,
  boundingBox,
}: { imageUrl: string; boundingBox: { x: number; y: number; width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const padding = 0.2
      const paddedWidth = boundingBox.width * (1 + padding * 2)
      const paddedHeight = boundingBox.height * (1 + padding * 2)
      const paddedX = Math.max(0, boundingBox.x - boundingBox.width * padding)
      const paddedY = Math.max(0, boundingBox.y - boundingBox.height * padding)

      const cropX = Math.max(0, paddedX)
      const cropY = Math.max(0, paddedY)
      const cropWidth = Math.min(paddedWidth, img.width - cropX)
      const cropHeight = Math.min(paddedHeight, img.height - cropY)

      const previewSize = 150
      canvas.width = previewSize
      canvas.height = previewSize

      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, previewSize, previewSize)

      const scale = Math.min(previewSize / cropWidth, previewSize / cropHeight)
      const scaledWidth = cropWidth * scale
      const scaledHeight = cropHeight * scale

      const offsetX = (previewSize - scaledWidth) / 2
      const offsetY = (previewSize - scaledHeight) / 2

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, offsetX, offsetY, scaledWidth, scaledHeight)
    }

    img.src = imageUrl
  }, [imageUrl, boundingBox])

  return <canvas ref={canvasRef} className="border rounded-lg" style={{ width: 150, height: 150 }} />
}
