"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { getMissingDescriptorsListAction, regenerateSingleDescriptorAction } from "@/app/admin/actions/recognition"

interface RegenerateDescriptorsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

interface FaceToProcess {
  face_id: string
  photo_id: string
  person_id: string
  person_name: string
  filename: string
  gallery_name: string
  image_url: string
  bbox: any
  status: "pending" | "processing" | "success" | "error"
  error?: string
  iou?: number
}

export function RegenerateDescriptorsDialog({ open, onOpenChange, onComplete }: RegenerateDescriptorsDialogProps) {
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [faces, setFaces] = useState<FaceToProcess[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Load list when dialog opens
  useEffect(() => {
    if (open) {
      loadFacesList()
    } else {
      // Reset state when dialog closes
      setFaces([])
      setProcessing(false)
      setCurrentIndex(0)
    }
  }, [open])

  async function loadFacesList() {
    setLoading(true)
    const response = await getMissingDescriptorsListAction()
    if (response.success) {
      setFaces(response.faces.map((f) => ({ ...f, status: "pending" as const })))
    }
    setLoading(false)
  }

  async function startRegeneration() {
    setProcessing(true)
    setCurrentIndex(0)

    for (let i = 0; i < faces.length; i++) {
      setCurrentIndex(i)

      // Update status to processing
      setFaces((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "processing" as const } : f)))

      const face = faces[i]
      const result = await regenerateSingleDescriptorAction(face.face_id)

      // Update status based on result
      setFaces((prev) =>
        prev.map((f, idx) =>
          idx === i
            ? {
                ...f,
                status: result.success ? ("success" as const) : ("error" as const),
                error: result.error,
                iou: result.iou,
              }
            : f,
        ),
      )
    }

    setProcessing(false)
    onComplete?.()
  }

  const totalFaces = faces.length
  const processedFaces = faces.filter((f) => f.status === "success" || f.status === "error").length
  const successCount = faces.filter((f) => f.status === "success").length
  const errorCount = faces.filter((f) => f.status === "error").length
  const progress = totalFaces > 0 ? (processedFaces / totalFaces) * 100 : 0

  const failedFaces = faces.filter((f) => f.status === "error")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Восстановление дескрипторов
          </DialogTitle>
          <DialogDescription>
            Регенерация insightface_descriptor для лиц, назначенных вручную без детекции.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : totalFaces === 0 && !processing ? (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Все дескрипторы в порядке!</p>
                <p className="text-sm text-green-600">Нет записей с привязанными игроками без дескрипторов.</p>
              </div>
            </div>
          ) : !processing && processedFaces === 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Найдено {totalFaces} лиц без дескрипторов</p>
                  <p className="text-sm text-amber-600">
                    Эти игроки не могут быть автоматически распознаны на новых фото.
                  </p>
                </div>
              </div>

              <Button onClick={startRegeneration} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Начать восстановление
              </Button>
            </div>
          ) : (
            <>
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Прогресс</span>
                  <span>
                    {processedFaces} / {totalFaces}
                  </span>
                </div>
                <Progress value={progress} />
              </div>

              {processing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Обработка фотографий...</span>
                </div>
              )}

              {/* Results summary */}
              {!processing && processedFaces > 0 && (
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">Результаты</h3>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Всего:</span>
                      <span className="ml-2 font-medium">{totalFaces}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Успешно:</span>
                      <span className="ml-2 font-medium text-green-600">{successCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ошибок:</span>
                      <span className="ml-2 font-medium text-red-600">{errorCount}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Faces list */}
              <div className="max-h-[350px] space-y-2 overflow-y-auto">
                {faces.map((face, index) => (
                  <div key={face.face_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{face.person_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {face.gallery_name ? `${face.gallery_name} / ` : ""}
                        {face.filename}
                      </p>
                      {face.status === "success" && face.iou && (
                        <p className="text-xs text-green-600">IoU: {Math.round(face.iou * 100)}%</p>
                      )}
                      {face.status === "error" && face.error && (
                        <p className="text-xs text-destructive">{face.error}</p>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      {face.status === "pending" && <Badge variant="secondary">Ожидание</Badge>}
                      {face.status === "processing" && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Обработка
                        </Badge>
                      )}
                      {face.status === "success" && (
                        <Badge variant="default">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Готово
                        </Badge>
                      )}
                      {face.status === "error" && (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Ошибка
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Failed faces summary */}
              {!processing && failedFaces.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h4 className="font-medium text-red-800 mb-2">Не удалось восстановить ({failedFaces.length}):</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {failedFaces.map((face) => (
                      <li key={face.face_id}>
                        <strong>{face.person_name}</strong> — {face.filename}: {face.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!processing && (
                <Button onClick={() => onOpenChange(false)} className="w-full">
                  Закрыть
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
