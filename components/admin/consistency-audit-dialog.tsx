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
import { AlertTriangle, CheckCircle, Loader2, Users, Eye, Trash2 } from "lucide-react"
import {
  runConsistencyAuditAction,
  clearPersonOutliersAction,
  type ConsistencyAuditResult,
} from "@/app/admin/actions/people"
import { EmbeddingConsistencyDialog } from "./embedding-consistency-dialog"

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
  
  // Detail dialog state
  const [detailPerson, setDetailPerson] = useState<{
    id: string
    name: string
  } | null>(null)
  
  // Clear outliers state
  const [clearingPersonId, setClearingPersonId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState<{
    open: boolean
    personId: string | null
    personName: string
    outlierCount: number
  }>({ open: false, personId: null, personName: "", outlierCount: 0 })

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

  async function handleClearOutliers(personId: string) {
    setClearingPersonId(personId)
    try {
      const result = await clearPersonOutliersAction(personId, 0.5)
      
      if (result.success && result.data) {
        // Update local state - remove outliers from count or remove from list if no problems left
        setDisplayedResults((prev) =>
          prev.map((r) => {
            if (r.person_id !== personId) return r
            const newOutlierCount = Math.max(0, r.outlier_count - (result.data?.cleared_count || 0))
            return {
              ...r,
              outlier_count: newOutlierCount,
              has_problems: newOutlierCount > 0,
            }
          })
        )
        setResults((prev) =>
          prev.map((r) => {
            if (r.person_id !== personId) return r
            const newOutlierCount = Math.max(0, r.outlier_count - (result.data?.cleared_count || 0))
            return {
              ...r,
              outlier_count: newOutlierCount,
              has_problems: newOutlierCount > 0,
            }
          })
        )
        
        // Update summary
        if (summary && result.data.cleared_count > 0) {
          const clearedCount = result.data.cleared_count
          setSummary((prev) => {
            if (!prev) return prev
            const newTotalOutliers = Math.max(0, prev.total_outliers - clearedCount)
            // Check if this person still has problems
            const personResult = displayedResults.find(r => r.person_id === personId)
            const hadProblems = personResult?.has_problems
            const stillHasProblems = (personResult?.outlier_count || 0) - clearedCount > 0
            const problemsDelta = hadProblems && !stillHasProblems ? -1 : 0
            
            return {
              ...prev,
              total_outliers: newTotalOutliers,
              people_with_problems: Math.max(0, prev.people_with_problems + problemsDelta),
            }
          })
        }
      } else {
        console.error("[ClearOutliers] Failed:", result.error)
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      console.error("[ClearOutliers] Error:", e)
      alert(`Ошибка: ${e.message}`)
    } finally {
      setClearingPersonId(null)
      setConfirmClear({ open: false, personId: null, personName: "", outlierCount: 0 })
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[1100px] max-h-[85vh] flex flex-col">
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
              <div className="sticky top-0 bg-muted/90 backdrop-blur grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                <div>Игрок</div>
                <div className="text-center">Фото</div>
                <div className="text-center">Дескр.</div>
                <div className="text-center">Outliers</div>
                <div className="text-center">Консист.</div>
                <div className="text-center">Действия</div>
              </div>
              
              {/* Rows */}
              <div className="divide-y">
                {displayedResults.map((result) => (
                  <div
                    key={result.person_id}
                    className={`grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-2 px-4 py-2 text-sm border-l-4 items-center ${getRowStyle(result)}`}
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
                    <div className="flex justify-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setDetailPerson({
                          id: result.person_id,
                          name: result.person_name,
                        })}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Детали
                      </Button>
                      {result.outlier_count > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2"
                          disabled={clearingPersonId === result.person_id}
                          onClick={() => setConfirmClear({
                            open: true,
                            personId: result.person_id,
                            personName: result.person_name,
                            outlierCount: result.outlier_count,
                          })}
                        >
                          {clearingPersonId === result.person_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Очистить
                            </>
                          )}
                        </Button>
                      )}
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

      {/* Detail dialog for individual player */}
      {detailPerson && (
        <EmbeddingConsistencyDialog
          personId={detailPerson.id}
          personName={detailPerson.name}
          open={!!detailPerson}
          onOpenChange={(open) => {
            if (!open) setDetailPerson(null)
          }}
          onDescriptorCleared={() => {
            // Refresh audit after clearing
            runAudit()
          }}
        />
      )}

      {/* Confirm clear dialog */}
      <AlertDialog
        open={confirmClear.open}
        onOpenChange={(open) => setConfirmClear((s) => ({ ...s, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить все outliers?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет очищено <strong>{confirmClear.outlierCount}</strong> проблемных дескрипторов 
              для игрока <strong>{confirmClear.personName}</strong>.
              <br /><br />
              Эти дескрипторы будут удалены из индекса распознавания. 
              Фото останутся привязанными к игроку.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmClear.personId && handleClearOutliers(confirmClear.personId)}
            >
              Очистить {confirmClear.outlierCount} outliers
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
