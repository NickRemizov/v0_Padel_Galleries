"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, CheckCircle, Loader2, Users } from "lucide-react"
import {
  runConsistencyAuditAction,
  type ConsistencyAuditResult,
} from "@/app/admin/actions/people"

interface ConsistencyAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConsistencyAuditDialog({
  open,
  onOpenChange,
}: ConsistencyAuditDialogProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ConsistencyAuditResult[]>([])
  const [displayedResults, setDisplayedResults] = useState<ConsistencyAuditResult[]>([])
  const [summary, setSummary] = useState<{
    total_people: number
    people_with_problems: number
    total_outliers: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      runAudit()
    } else {
      // Reset state when closing
      setResults([])
      setDisplayedResults([])
      setSummary(null)
      setCurrentIndex(0)
    }
  }, [open])

  // Animate results appearing one by one
  useEffect(() => {
    if (results.length === 0 || currentIndex >= results.length) return

    const timer = setTimeout(() => {
      setDisplayedResults((prev) => [...prev, results[currentIndex]])
      setCurrentIndex((prev) => prev + 1)
      
      // Auto-scroll to bottom
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 50) // 50ms between each row

    return () => clearTimeout(timer)
  }, [results, currentIndex])

  async function runAudit() {
    setLoading(true)
    setError(null)
    setResults([])
    setDisplayedResults([])
    setCurrentIndex(0)
    
    try {
      const result = await runConsistencyAuditAction(0.5, 2)
      
      if (result.success && result.data) {
        setResults(result.data.results)
        setSummary({
          total_people: result.data.total_people,
          people_with_problems: result.data.people_with_problems,
          total_outliers: result.data.total_outliers,
        })
      } else {
        setError(result.error || "Ошибка аудита")
      }
    } catch (e: any) {
      setError(e.message || "Ошибка соединения с сервером")
      console.error("[ConsistencyAudit] Error:", e)
    } finally {
      setLoading(false)
    }
  }

  function getConsistencyColor(value: number): string {
    if (value >= 0.8) return "text-green-600"
    if (value >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  function getRowStyle(result: ConsistencyAuditResult): string {
    if (result.has_problems) return "bg-red-50 border-red-200"
    if (result.overall_consistency < 0.7) return "bg-yellow-50 border-yellow-200"
    return "border-gray-100"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Аудит консистентности эмбеддингов
          </DialogTitle>
          <DialogDescription>
            Проверка всех игроков на наличие проблемных дескрипторов (outliers)
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        {summary && (
          <div className="flex items-center gap-6 py-3 px-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Проверено:</span>
              <span className="font-bold">{summary.total_people}</span>
            </div>
            {summary.people_with_problems > 0 ? (
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">
                  С проблемами: {summary.people_with_problems}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Проблем не найдено</span>
              </div>
            )}
            {summary.total_outliers > 0 && (
              <div className="text-sm text-muted-foreground">
                Всего outliers: {summary.total_outliers}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Анализируем игроков...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center justify-center py-12 text-red-500">
            {error}
          </div>
        )}

        {/* Results table */}
        {!loading && displayedResults.length > 0 && (
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto border rounded-lg"
          >
            {/* Header */}
            <div className="sticky top-0 bg-muted/90 backdrop-blur grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
              <div>Игрок</div>
              <div className="text-center">Фото</div>
              <div className="text-center">Дескрипторы</div>
              <div className="text-center">Outliers</div>
              <div className="text-center">Консистентность</div>
            </div>
            
            {/* Rows */}
            <div className="divide-y">
              {displayedResults.map((result) => (
                <div
                  key={result.person_id}
                  className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-sm border-l-4 ${getRowStyle(result)}`}
                >
                  <div className="font-medium truncate" title={result.person_name}>
                    {result.person_name}
                  </div>
                  <div className="text-center text-muted-foreground">
                    {result.photo_count}
                  </div>
                  <div className="text-center text-muted-foreground">
                    {result.descriptor_count}
                  </div>
                  <div className="text-center">
                    {result.outlier_count > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {result.outlier_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </div>
                  <div className={`text-center font-medium ${getConsistencyColor(result.overall_consistency)}`}>
                    {Math.round(result.overall_consistency * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {!loading && results.length > 0 && currentIndex < results.length && (
          <div className="text-center text-sm text-muted-foreground py-2">
            Загружено {currentIndex} из {results.length}...
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {displayedResults.length > 0 && `Показано: ${displayedResults.length} игроков`}
          </div>
          <div className="flex gap-2">
            {!loading && results.length > 0 && (
              <Button variant="outline" onClick={runAudit}>
                Обновить
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
