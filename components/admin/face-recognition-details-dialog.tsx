"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useRef } from "react"

interface FaceRecognitionDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  faces: DetailedFace[]
  imageUrl?: string
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
}: FaceRecognitionDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Детальная информация о распознавании</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {faces.map((face, index) => {
            // Determine if this is a recognized face (exact match)
            const isExactMatch = face.recognition_confidence !== undefined && face.recognition_confidence >= 0.999
            const isRecognized = face.recognition_confidence !== undefined && face.recognition_confidence > 0 && face.person_name
            
            // Use distance_to_nearest if available, otherwise calculate from confidence
            const distance = face.distance_to_nearest !== undefined && face.distance_to_nearest !== null
              ? face.distance_to_nearest.toFixed(3)
              : face.recognition_confidence !== undefined 
                ? (1 - face.recognition_confidence).toFixed(3)
                : "N/A"

            return (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-2xl">{face.person_name || `Неизвестный ${index + 1}`}</CardTitle>
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

                  {face.top_matches && face.top_matches.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-2">Топ-3 похожих лиц:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        {face.top_matches.map((match, i) => (
                          <li key={i}>
                            {match.name} (similarity: {match.similarity.toFixed(2)})
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
