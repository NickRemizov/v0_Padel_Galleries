"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { syncVerifiedAndConfidenceAction } from "@/app/admin/actions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FixedRecord {
  id: string
  gallery_title: string
  filename: string
  person_name?: string
}

interface SyncResult {
  success: boolean
  error?: string
  data?: {
    updatedVerified: number
    updatedConfidence: number
    updatedProcessed: number
    verifiedFixedList: FixedRecord[]
    confidenceFixedList: FixedRecord[]
    processedFixedList: FixedRecord[]
    totalVerified: number
    totalConfidence1: number
    totalProcessed: number
    totalImages: number
  }
}

export function SyncVerifiedButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await syncVerifiedAndConfidenceAction()

      if (response.error) {
        setResult({ success: false, error: response.error })
      } else {
        setResult({ success: true, data: response.data })
      }
    } catch (error) {
      setResult({ success: false, error: "Не удалось выполнить синхронизацию" })
    } finally {
      setIsLoading(false)
      setShowResult(true)
    }
  }

  const renderFixedList = (
    title: string,
    count: number,
    list: FixedRecord[],
    borderColor: string,
    bgColor: string,
    textColor: string
  ) => {
    if (count === 0) return null

    return (
      <div className={`rounded-lg border ${borderColor}`}>
        <ScrollArea className="max-h-48">
          <div className={`p-4 ${bgColor}`}>
            <h4 className="font-medium mb-2">
              {title} ({count}):
            </h4>
            <div className="space-y-1 text-sm">
              {list.map((item) => (
                <div key={item.id} className={textColor}>
                  <span className="font-medium">{item.gallery_title}</span>
                  <span className="opacity-80 ml-1">/ {item.filename}</span>
                  {item.person_name && (
                    <span className="opacity-60 ml-1">({item.person_name})</span>
                  )}
                </div>
              ))}
              {count > 100 && (
                <div className="opacity-70 italic">...и ещё {count - 100}</div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <>
      <Button onClick={handleSync} disabled={isLoading} variant="outline" size="sm">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Синхронизирую...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Синхронизация данных
          </>
        )}
      </Button>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Синхронизация данных
            </DialogTitle>
            <DialogDescription>{result?.success ? "Операция завершена успешно" : "Произошла ошибка"}</DialogDescription>
          </DialogHeader>

          {result?.success && result.data ? (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-4">
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-3">Обновлено записей:</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="rounded bg-muted p-3">
                      <div className="text-2xl font-bold text-center">{result.data.updatedVerified}</div>
                      <div className="text-xs text-muted-foreground text-center">verified → confidence=1</div>
                    </div>
                    <div className="rounded bg-muted p-3">
                      <div className="text-2xl font-bold text-center">{result.data.updatedConfidence}</div>
                      <div className="text-xs text-muted-foreground text-center">confidence=1 → verified</div>
                    </div>
                    <div className="rounded bg-muted p-3">
                      <div className="text-2xl font-bold text-center">{result.data.updatedProcessed}</div>
                      <div className="text-xs text-muted-foreground text-center">has_been_processed</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <h4 className="font-medium text-green-800 mb-2">Итого в базе:</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-green-700">Verified:</span>
                      <span className="ml-2 font-bold text-green-800">{result.data.totalVerified.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-green-700">Confidence=1:</span>
                      <span className="ml-2 font-bold text-green-800">
                        {result.data.totalConfidence1.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-green-700">Processed:</span>
                      <span className="ml-2 font-bold text-green-800">
                        {result.data.totalProcessed.toLocaleString()}/{result.data.totalImages.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Детальные списки исправлений */}
                {renderFixedList(
                  "Исправлено verified → confidence=1",
                  result.data.updatedVerified,
                  result.data.verifiedFixedList || [],
                  "border-blue-200",
                  "bg-blue-50",
                  "text-blue-700"
                )}

                {renderFixedList(
                  "Исправлено confidence=1 → verified",
                  result.data.updatedConfidence,
                  result.data.confidenceFixedList || [],
                  "border-purple-200",
                  "bg-purple-50",
                  "text-purple-700"
                )}

                {renderFixedList(
                  "Исправлено has_been_processed",
                  result.data.updatedProcessed,
                  result.data.processedFixedList || [],
                  "border-amber-200",
                  "bg-amber-50",
                  "text-amber-700"
                )}

                {result.data.updatedVerified === 0 &&
                  result.data.updatedConfidence === 0 &&
                  result.data.updatedProcessed === 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                      <p className="font-medium text-blue-800">Всё синхронизировано!</p>
                      <p className="text-sm text-blue-600">Все данные согласованы</p>
                    </div>
                  )}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{result?.error || "Неизвестная ошибка"}</p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResult(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
