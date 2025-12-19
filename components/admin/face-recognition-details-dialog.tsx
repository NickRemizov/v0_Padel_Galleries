"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface FaceRecognitionDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  faces: DetailedFace[]
  imageUrl?: string
  onAssignPerson?: (faceIndex: number, personId: string, personName: string) => void
}

export interface DetailedFace {
  boundingBox: { x: number; y: number; width: number; height: number }
  size: number
  blur_score?: number
  detection_score: number
  recognition_confidence?: number
  embedding_quality?: number
  distance_to_nearest?: number
  top_matches?: Array<{
    person_id: string
    name: string
    similarity: number
  }>
  person_name?: string
}

export function FaceRecognitionDetailsDialog({
  open,
  onOpenChange,
  faces,
  imageUrl,
  onAssignPerson,
}: FaceRecognitionDetailsDialogProps) {
  // Track which faces have been assigned in this session
  const [assignedFaces, setAssignedFaces] = useState<Set<number>>(new Set())

  // Reset assigned faces when dialog opens
  useEffect(() => {
    if (open) {
      setAssignedFaces(new Set())
    }
  }, [open])

  // Count unknown faces (faces without person_name that haven't been assigned)
  const unknownFacesCount = faces.filter(
    (face, index) => !face.person_name && !assignedFaces.has(index)
  ).length

  const handleAssign = (faceIndex: number, personId: string, personName: string) => {
    if (!onAssignPerson) return

    // Call the parent's assign handler
    onAssignPerson(faceIndex, personId, personName)

    // Mark this face as assigned
    const newAssigned = new Set(assignedFaces)
    newAssigned.add(faceIndex)
    setAssignedFaces(newAssigned)

    // Check if all unknown faces are now assigned
    const remainingUnknown = faces.filter(
      (face, index) => !face.person_name && !newAssigned.has(index)
    ).length

    // If only one unknown face total, or all unknown faces are now assigned, close dialog
    if (unknownFacesCount === 1 || remainingUnknown === 0) {
      onOpenChange(false)
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
            // Determine if this is a recognized face (exact match)
            const isExactMatch = face.recognition_confidence !== undefined && face.recognition_confidence >= 0.999
            const isRecognized = face.recognition_confidence !== undefined && face.recognition_confidence > 0 && face.person_name
            const isAssigned = assignedFaces.has(index)
            
            // Use distance_to_nearest if available, otherwise calculate from confidence
            const distance = face.distance_to_nearest !== undefined && face.distance_to_nearest !== null
              ? face.distance_to_nearest.toFixed(3)
              : face.recognition_confidence !== undefined 
                ? (1 - face.recognition_confidence).toFixed(3)
                : "N/A"

            return (
              <Card key={index} className={isAssigned ? "border-green-500 bg-green-50" : ""}>
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    {face.person_name || `Неизвестный ${index + 1}`}
                    {isAssigned && (
                      <span className="text-green-600 text-sm font-normal">(назначен)</span>
                    )}
                  </CardTitle>
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
                              {match.name} (similarity: {match.similarity.toFixed(2)})
                            </span>
                            {onAssignPerson && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => handleAssign(index, match.person_id, match.name)}
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
