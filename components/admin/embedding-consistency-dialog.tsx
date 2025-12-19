"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Trash2, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"
import {
  getEmbeddingConsistencyAction,
  clearFaceDescriptorAction,
  type ConsistencyData,
  type EmbeddingResult,
} from "@/app/admin/actions/people"

interface EmbeddingConsistencyDialogProps {
  personId: string
  personName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDescriptorCleared?: () => void
}

/**
 * Parse bbox from various formats to [x1, y1, x2, y2] array.
 * Handles both array format and object format {x, y, width, height}.
 */
function parseBbox(bbox: unknown): number[] | null {
  if (!bbox) return null
  
  // Already an array [x1, y1, x2, y2]
  if (Array.isArray(bbox) && bbox.length === 4) {
    const nums = bbox.map(Number)
    if (nums.every(n => !isNaN(n))) {
      return nums
    }
    return null
  }
  
  // Object format {x, y, width, height}
  if (typeof bbox === "object" && bbox !== null) {
    const obj = bbox as Record<string, unknown>
    const x = Number(obj.x)
    const y = Number(obj.y)
    const width = Number(obj.width)
    const height = Number(obj.height)
    
    if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
      return [x, y, x + width, y + height]
    }
  }
  
  return null
}

export function EmbeddingConsistencyDialog({
  personId,
  personName,
  open,
  onOpenChange,
  onDescriptorCleared,
}: EmbeddingConsistencyDialogProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ConsistencyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearingFaceId, setClearingFaceId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    faceId: string | null
    filename: string | null
  }>({ open: false, faceId: null, filename: null })

  useEffect(() => {
    if (open) {
      loadConsistency()
    }
  }, [open, personId])

  async function loadConsistency() {
    setLoading(true)
    setError(null)
    try {
      const result = await getEmbeddingConsistencyAction(personId, 0.5)
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || "Ошибка загрузки")
      }
    } catch (e: any) {
      setError(e.message || "Ошибка соединения с сервером")
      console.error("[ConsistencyDialog] Error:", e)
    } finally {
      setLoading(false)
    }
  }

  async function handleClearDescriptor(faceId: string) {
    setClearingFaceId(faceId)
    try {
      const result = await clearFaceDescriptorAction(faceId)
      
      if (result.success && result.data?.cleared) {
        // Remove from list
        setData((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            total_embeddings: prev.total_embeddings - 1,
            outlier_count: prev.outlier_count - 1,
            embeddings: prev.embeddings.filter((e) => e.face_id !== faceId),
          }
        })
        onDescriptorCleared?.()
      } else {
        console.error("[ConsistencyDialog] Clear failed:", result.error)
      }
    } catch (e) {
      console.error("[ConsistencyDialog] Clear error:", e)
    } finally {
      setClearingFaceId(null)
      setConfirmDialog({ open: false, faceId: null, filename: null })
    }
  }

  function getConsistencyColor(value: number): string {
    if (value >= 0.8) return "text-green-600"
    if (value >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  function getSimilarityColor(value: number, isOutlier: boolean): string {
    if (isOutlier) return "bg-red-100 text-red-800"
    if (value >= 0.8) return "bg-green-100 text-green-800"
    if (value >= 0.6) return "bg-yellow-100 text-yellow-800"
    return "bg-orange-100 text-orange-800"
  }

  // Render face thumbnail with bbox crop
  function FaceThumbnail({ emb }: { emb: EmbeddingResult }) {
    const containerSize = 80
    
    if (!emb.image_url) {
      return (
        <div 
          className="flex items-center justify-center bg-gray-100 rounded text-muted-foreground text-xs"
          style={{ width: containerSize, height: containerSize }}
        >
          No img
        </div>
      )
    }

    // Parse bbox safely
    const bboxArray = parseBbox(emb.bbox)

    // If we have valid bbox and image dimensions, show cropped face
    if (bboxArray && emb.image_width && emb.image_height) {
      const [x1, y1, x2, y2] = bboxArray
      const faceWidth = x2 - x1
      const faceHeight = y2 - y1
      const faceCenterX = x1 + faceWidth / 2
      const faceCenterY = y1 + faceHeight / 2
      
      // Add 100% padding
      const padding = 1.0
      const paddedSize = Math.max(faceWidth, faceHeight) * (1 + padding * 2)
      
      // Calculate crop region
      const cropX = Math.max(0, faceCenterX - paddedSize / 2)
      const cropY = Math.max(0, faceCenterY - paddedSize / 2)
      const cropRight = Math.min(emb.image_width, faceCenterX + paddedSize / 2)
      const cropBottom = Math.min(emb.image_height, faceCenterY + paddedSize / 2)
      const actualCropWidth = cropRight - cropX
      const actualCropHeight = cropBottom - cropY
      
      // Scale factor
      const scale = containerSize / Math.max(actualCropWidth, actualCropHeight)
      const scaledWidth = emb.image_width * scale
      const scaledHeight = emb.image_height * scale
      
      // Position to center the crop region
      const offsetX = -(cropX * scale) + (containerSize - actualCropWidth * scale) / 2
      const offsetY = -(cropY * scale) + (containerSize - actualCropHeight * scale) / 2

      return (
        <div 
          className="relative rounded overflow-hidden bg-gray-100 flex-shrink-0"
          style={{ width: containerSize, height: containerSize }}
        >
          <Image
            src={emb.image_url}
            alt="Face"
            width={scaledWidth}
            height={scaledHeight}
            style={{
              position: 'absolute',
              left: offsetX,
              top: offsetY,
              width: scaledWidth,
              height: scaledHeight,
              maxWidth: 'none'
            }}
            unoptimized
          />
        </div>
      )
    }

    // Fallback: show full image with cover
    return (
      <div 
        className="relative rounded overflow-hidden bg-gray-100 flex-shrink-0"
        style={{ width: containerSize, height: containerSize }}
      >
        <Image
          src={emb.image_url}
          alt="Face"
          fill
          style={{ objectFit: "cover" }}
          sizes="80px"
        />
      </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Проверка эмбеддингов: {personName}
            </DialogTitle>
            <DialogDescription>
              Анализ консистентности дескрипторов лица. Outliers — эмбеддинги, которые сильно отличаются от остальных.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Summary */}
              <div className="flex items-center gap-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Общая консистентность:</span>
                  <span className={`text-lg font-bold ${getConsistencyColor(data.overall_consistency)}`}>
                    {Math.round(data.overall_consistency * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Эмбеддингов:</span>
                  <span className="font-medium">{data.total_embeddings}</span>
                </div>
                {data.outlier_count > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Outliers: {data.outlier_count}</span>
                  </div>
                )}
                {data.outlier_count === 0 && data.total_embeddings > 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Все в норме</span>
                  </div>
                )}
              </div>

              {/* Embeddings list */}
              {data.message ? (
                <div className="py-8 text-center text-muted-foreground">
                  {data.message}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 py-2">
                    {data.embeddings.map((emb) => (
                      <div
                        key={emb.face_id}
                        className={`flex items-center gap-4 p-3 rounded-lg border ${
                          emb.is_outlier ? "border-red-300 bg-red-50" : "border-gray-200"
                        }`}
                      >
                        {/* Face Thumbnail with bbox crop */}
                        <FaceThumbnail emb={emb} />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {emb.filename || emb.photo_id.slice(0, 8)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${getSimilarityColor(
                                emb.similarity_to_centroid,
                                emb.is_outlier
                              )}`}
                            >
                              {Math.round(emb.similarity_to_centroid * 100)}% к центру
                            </span>
                            {emb.verified && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Verified
                              </span>
                            )}
                            {emb.is_outlier && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                OUTLIER
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0">
                          <Button
                            variant={emb.is_outlier ? "destructive" : "outline"}
                            size="sm"
                            disabled={clearingFaceId === emb.face_id}
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                faceId: emb.face_id,
                                filename: emb.filename,
                              })
                            }
                          >
                            {clearingFaceId === emb.face_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span className="ml-1">Очистить</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(next) => setConfirmDialog((s) => ({ ...s, open: next }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить дескриптор?</AlertDialogTitle>
            <AlertDialogDescription>
              Дескриптор будет удалён из индекса распознавания. Фото останется привязанным к игроку,
              но не будет использоваться для поиска похожих лиц.
              {confirmDialog.filename && (
                <span className="block mt-2 font-medium">
                  Файл: {confirmDialog.filename}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog.faceId && handleClearDescriptor(confirmDialog.faceId)}
            >
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
