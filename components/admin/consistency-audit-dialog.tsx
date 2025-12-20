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
import { AlertTriangle, CheckCircle, Loader2, Users, Eye, Wrench } from "lucide-react"
import {
  runConsistencyAuditAction,
  clearPersonOutliersAction,
  auditAllEmbeddingsAction,
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
    total_excluded: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Detail dialog state
  const [detailPerson, setDetailPerson] = useState<{
    id: string
    name: string
  } | null>(null)
  
  // Fix outliers state
  const [fixingPersonId, setFixingPersonId] = useState<string | null>(null)
  const [fixingAll, setFixingAll] = useState(false)
  const [confirmFix, setConfirmFix] = useState<{
    open: boolean
    personId: string | null
    personName: string
    outlierCount: number
  }>({ open: false, personId: null, personName: "", outlierCount: 0 })
  const [confirmFixAll, setConfirmFixAll] = useState(false)

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
          total_excluded: result.data.total_excluded || 0,
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

  async function handleFixOutliers(personId: string) {
    setFixingPersonId(personId)
    try {
      const result = await clearPersonOutliersAction(personId, 0.5)
      
      if (result.success && result.data) {
        // Update local state - move outliers to excluded
        setDisplayedResults((prev) =>
          prev.map((r) => {
            if (r.person_id !== personId) return r
            const clearedCount = result.data?.cleared_count || 0
            return {
              ...r,
              outlier_count: 0,
              excluded_count: (r.excluded_count || 0) + clearedCount,
              has_problems: false,
            }
          })
        )
        setResults((prev) =>
          prev.map((r) => {
            if (r.person_id !== personId) return r
            const clearedCount = result.data?.cleared_count || 0
            return {
              ...r,
              outlier_count: 0,
              excluded_count: (r.excluded_count || 0) + clearedCount,
              has_problems: false,
            }
          })
        )
        
        // Update summary
        if (summary && result.data.cleared_count > 0) {
          setSummary((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              total_outliers: Math.max(0, prev.total_outliers - result.data!.cleared_count),
              total_excluded: prev.total_excluded + result.data!.cleared_count,
              people_with_problems: Math.max(0, prev.people_with_problems - 1),
            }
          })
        }
      } else {
        console.error("[FixOutliers] Failed:", result.error)
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      console.error("[FixOutliers] Error:", e)
      alert(`Ошибка: ${e.message}`)
    } finally {
      setFixingPersonId(null)
      setConfirmFix({ open: false, personId: null, personName: "", outlierCount: 0 })
    }
  }

  async function handleFixAll() {
    setFixingAll(true)
    setConfirmFixAll(false)
    try {
      const result = await auditAllEmbeddingsAction(0.5, 3)
      
      if (result.success && result.data) {
        // Refresh the audit to show updated state
        await runAudit()
      } else {
        console.error("[FixAll] Failed:", result.error)
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      console.error("[FixAll] Error:", e)
      alert(`Ошибка: ${e.message}`)
    } finally {
      setFixingAll(false)
    }
  }

  function getConsistencyColor(value: number): string {
    if (value >= 0.8) return "text-green-600"
    if (value >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  function getRowStyle(result: ConsistencyAuditResult): string {
    if (result.outlier_count > 0) return "bg-red-50 border-red-200"
    if ((result.excluded_count || 0) > 0) return "bg-yellow-50 border-yellow-200"
    if (result.overall_consistency < 0.7) return "bg-orange-50 border-orange-200"
    return "border-gray-100"
  }

  // Count total outliers that can be fixed
  const totalFixableOutliers = displayedResults.reduce((sum, r) => sum + r.outlier_count, 0)

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
            <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-lg">
              <div className="flex items-center gap-6">
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
              
              {/* Fix All button */}
              {totalFixableOutliers > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={fixingAll}
                  onClick={() => setConfirmFixAll(true)}
                  className="border-gray-400"
                >
                  {fixingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Wrench className="h-4 w-4 mr-2" />
                  )}
                  Исправить все ({totalFixableOutliers})
                </Button>
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
              <div className="sticky top-0 bg-muted/90 backdrop-blur grid grid-cols-[2fr_0.8fr_0.8fr_1fr_0.8fr_auto] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                <div>Игрок</div>
                <div className="text-center">Фото</div>
                <div className="text-center">Дескр.</div>
                <div className="text-center">Исключено</div>
                <div className="text-center">Консист.</div>
                <div className="text-center w-[180px]">Действия</div>
              </div>
              
              {/* Rows */}
              <div className="divide-y">
                {displayedResults.map((result) => (
                  <div
                    key={result.person_id}
                    className={`grid grid-cols-[2fr_0.8fr_0.8fr_1fr_0.8fr_auto] gap-2 px-4 py-2 text-sm border-l-4 items-center ${getRowStyle(result)}`}
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
                      {/* Format: total_excluded / new_outliers */}
                      {((result.excluded_count || 0) > 0 || result.outlier_count > 0) ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          result.outlier_count > 0 
                            ? "bg-red-100 text-red-800" 
                            : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {(result.excluded_count || 0) + result.outlier_count}
                          {result.outlier_count > 0 && (
                            <span className="text-red-600 ml-1">
                              (+{result.outlier_count})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </div>
                    <div className={`text-center font-medium ${getConsistencyColor(result.overall_consistency)}`}>
                      {Math.round(result.overall_consistency * 100)}%
                    </div>
                    <div className="flex justify-end gap-1 w-[180px]">
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
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 border-gray-400"
                          disabled={fixingPersonId === result.person_id}
                          onClick={() => setConfirmFix({
                            open: true,
                            personId: result.person_id,
                            personName: result.person_name,
                            outlierCount: result.outlier_count,
                          })}
                        >
                          {fixingPersonId === result.person_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Wrench className="h-3.5 w-3.5 mr-1" />
                              Исправить
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
            // Refresh audit after changes
            runAudit()
          }}
        />
      )}

      {/* Confirm fix single player dialog */}
      <AlertDialog
        open={confirmFix.open}
        onOpenChange={(open) => setConfirmFix((s) => ({ ...s, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Исключить outliers из индекса?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет исключено <strong>{confirmFix.outlierCount}</strong> проблемных дескрипторов 
              для игрока <strong>{confirmFix.personName}</strong>.
              <br /><br />
              Дескрипторы останутся в базе, но не будут использоваться для распознавания.
              Это можно отменить в любой момент через "Детали".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmFix.personId && handleFixOutliers(confirmFix.personId)}
            >
              Исключить {confirmFix.outlierCount} outliers
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm fix all dialog */}
      <AlertDialog
        open={confirmFixAll}
        onOpenChange={setConfirmFixAll}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Исправить все outliers?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет исключено <strong>{totalFixableOutliers}</strong> проблемных дескрипторов 
              у всех игроков.
              <br /><br />
              Дескрипторы останутся в базе, но не будут использоваться для распознавания.
              Это можно отменить в любой момент через "Детали" каждого игрока.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleFixAll}>
              Исключить все {totalFixableOutliers} outliers
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
