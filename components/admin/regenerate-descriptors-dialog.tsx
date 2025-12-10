"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, CheckCircle, XCircle } from "lucide-react"
import { getMissingDescriptorsCountAction, regenerateMissingDescriptorsAction } from "@/app/admin/actions/recognition"

interface RegenerateDescriptorsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegenerateDescriptorsDialog({ open, onOpenChange }: RegenerateDescriptorsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [missingCount, setMissingCount] = useState<number | null>(null)
  const [result, setResult] = useState<{
    total_faces: number
    regenerated: number
    failed: number
    details: Array<{
      face_id: string
      person_name: string
      status: "success" | "error"
      error?: string
      iou?: number
    }>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadMissingCount()
    }
  }, [open])

  const loadMissingCount = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getMissingDescriptorsCountAction()
      if (response.success) {
        setMissingCount(response.count)
      } else {
        setError(response.error || "Не удалось загрузить количество")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await regenerateMissingDescriptorsAction()
      if (response.success) {
        setResult({
          total_faces: response.total_faces,
          regenerated: response.regenerated,
          failed: response.failed,
          details: response.details,
        })
        setMissingCount(0)
      } else {
        setError(response.error || "Не удалось восстановить дескрипторы")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Восстановление дескрипторов</DialogTitle>
          <DialogDescription>
            Регенерация insightface_descriptor для лиц, назначенных вручную без детекции
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {missingCount !== null && !result && (
            <Alert>
              <AlertDescription>
                Найдено <strong>{missingCount}</strong> лиц без дескрипторов (person_id есть, но insightface_descriptor
                = null)
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Обработано: <strong>{result.total_faces}</strong> лиц
                  <br />
                  Успешно: <strong className="text-green-600">{result.regenerated}</strong>
                  <br />
                  Ошибки: <strong className="text-red-600">{result.failed}</strong>
                </AlertDescription>
              </Alert>

              {result.details.length > 0 && (
                <div className="border rounded-md p-3 max-h-64 overflow-y-auto">
                  <div className="text-sm font-medium mb-2">Детали обработки (первые 50):</div>
                  <div className="space-y-2">
                    {result.details.slice(0, 50).map((detail, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        {detail.status === "success" ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{detail.person_name}</div>
                          <div className="text-xs text-muted-foreground">
                            ID: {detail.face_id}
                            {detail.iou && ` • IoU: ${detail.iou}`}
                            {detail.error && ` • ${detail.error}`}
                          </div>
                        </div>
                        <Badge variant={detail.status === "success" ? "default" : "destructive"}>
                          {detail.status === "success" ? "OK" : "Ошибка"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {!result && (
            <Button onClick={handleRegenerate} disabled={loading || missingCount === 0}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Восстановить дескрипторы
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
