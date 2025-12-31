"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Scan, Images, Search, Users, Loader2 } from "lucide-react"
import { BatchRecognitionDialog } from "@/components/admin/batch-recognition"
import { GlobalUnknownFacesDialog } from "@/components/admin/global-unknown-faces-dialog"
import { recognizeUnknownFacesAction } from "@/app/admin/actions/faces"
import { RecognizeResultDialog } from "./RecognizeResultDialog"

interface RecognizeResult {
  total_unknown: number
  recognized_count: number
  by_person: Array<{ person_id: string; name: string; count: number }>
  index_rebuilt: boolean
}

export function BatchProcessingCard() {
  const [showBatchRecognition, setShowBatchRecognition] = useState(false)
  const [showGlobalUnknownFaces, setShowGlobalUnknownFaces] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [showRecognizeResult, setShowRecognizeResult] = useState(false)

  const handleRecognizeUnknown = async () => {
    setRecognizing(true)
    try {
      const result = await recognizeUnknownFacesAction()
      if (result.success) {
        setRecognizeResult({
          total_unknown: result.total_unknown ?? 0,
          recognized_count: result.recognized_count ?? 0,
          by_person: result.by_person ?? [],
          index_rebuilt: result.index_rebuilt ?? false,
        })
        setShowRecognizeResult(true)
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (error) {
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <CardTitle>Пакетное распознавание</CardTitle>
          </div>
          <CardDescription>
            Массовое распознавание лиц и кластеризация неизвестных лиц по всей базе
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Распознать галереи</div>
                <div className="text-sm text-muted-foreground">
                  Выбрать галереи с необработанными фото и запустить распознавание
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowBatchRecognition(true)}>
                <Images className="mr-2 h-4 w-4" />
                Распознать
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Найти известные лица</div>
                <div className="text-sm text-muted-foreground">
                  Прогнать все неизвестные лица через алгоритм распознавания
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRecognizeUnknown}
                disabled={recognizing}
              >
                {recognizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Поиск...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Найти
                  </>
                )}
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Неизвестные лица</div>
                <div className="text-sm text-muted-foreground">
                  Кластеризация всех нераспознанных лиц для группового назначения
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowGlobalUnknownFaces(true)}>
                <Users className="mr-2 h-4 w-4" />
                Кластеризация
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <BatchRecognitionDialog
        open={showBatchRecognition}
        onOpenChange={setShowBatchRecognition}
      />

      <GlobalUnknownFacesDialog
        open={showGlobalUnknownFaces}
        onOpenChange={setShowGlobalUnknownFaces}
      />

      <RecognizeResultDialog
        open={showRecognizeResult}
        onOpenChange={setShowRecognizeResult}
        result={recognizeResult}
      />
    </>
  )
}
