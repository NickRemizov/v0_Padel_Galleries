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
import { AlertTriangle, Loader2, Users, Wrench } from "lucide-react"
import {
  runConsistencyAuditAction,
  clearPersonOutliersAction,
  auditAllEmbeddingsAction,
} from "@/app/admin/actions/people"
import { EmbeddingConsistencyDialog } from "@/components/admin/embedding-consistency-dialog"
import type { ConsistencyAuditResult, AuditSummary } from "./types"
import { AuditResultRow } from "./AuditResultRow"
import { ConfirmFixDialog } from "./ConfirmFixDialog"
import { ConfirmFixAllDialog } from "./ConfirmFixAllDialog"

interface ConsistencyAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConsistencyAuditDialog({ open, onOpenChange }: ConsistencyAuditDialogProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ConsistencyAuditResult[]>([])
  const [displayedResults, setDisplayedResults] = useState<ConsistencyAuditResult[]>([])
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const [detailPerson, setDetailPerson] = useState<{ id: string; name: string } | null>(null)
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
      setResults([])
      setDisplayedResults([])
      setSummary(null)
      setCurrentIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (results.length === 0 || currentIndex >= results.length) return

    const timer = setTimeout(() => {
      setDisplayedResults((prev) => [...prev, results[currentIndex]])
      setCurrentIndex((prev) => prev + 1)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 50)

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
    } finally {
      setLoading(false)
    }
  }

  async function handleFixOutliers(personId: string) {
    setFixingPersonId(personId)
    try {
      const result = await clearPersonOutliersAction(personId, 0.5)
      
      if (result.success && result.data) {
        const clearedCount = result.data.cleared_count || 0
        setDisplayedResults((prev) =>
          prev.map((r) => r.person_id !== personId ? r : {
            ...r,
            outlier_count: 0,
            excluded_count: (r.excluded_count || 0) + clearedCount,
            has_problems: false,
          })
        )
        setResults((prev) =>
          prev.map((r) => r.person_id !== personId ? r : {
            ...r,
            outlier_count: 0,
            excluded_count: (r.excluded_count || 0) + clearedCount,
            has_problems: false,
          })
        )
        
        if (summary && clearedCount > 0) {
          setSummary((prev) => prev ? {
            ...prev,
            total_outliers: Math.max(0, prev.total_outliers - clearedCount),
            total_excluded: prev.total_excluded + clearedCount,
            people_with_problems: Math.max(0, prev.people_with_problems - 1),
          } : prev)
        }
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
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
      if (result.success) {
        await runAudit()
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`)
    } finally {
      setFixingAll(false)
    }
  }

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

          {summary && (
            <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-lg">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>Проверено:</span>
                  <span className="font-bold">{summary.total_people}</span>
                </div>
                <div className="flex items-center gap-1 text-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>С проблемами:</span>
                  <span className="font-bold">{summary.people_with_problems}</span>
                </div>
                <div className="flex items-center gap-1 text-red-600">
                  <span>Найдено проблем:</span>
                  <span className="font-bold">{summary.total_outliers}</span>
                </div>
              </div>
              
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

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Анализируем игроков...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-red-500">
              {error}
            </div>
          )}

          {!loading && displayedResults.length > 0 && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto border rounded-lg">
              <div className="sticky top-0 bg-muted/90 backdrop-blur grid grid-cols-[2fr_0.7fr_0.7fr_0.9fr_0.7fr_110px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                <div>Игрок</div>
                <div className="text-center">Фото</div>
                <div className="text-center">Дескр.</div>
                <div className="text-center">Outliers</div>
                <div className="text-center">Консист.</div>
                <div>Действия</div>
              </div>
              
              <div className="divide-y">
                {displayedResults.map((result) => (
                  <AuditResultRow
                    key={result.person_id}
                    result={result}
                    fixingPersonId={fixingPersonId}
                    onViewDetails={(id, name) => setDetailPerson({ id, name })}
                    onFixOutliers={(id, name, count) => setConfirmFix({ open: true, personId: id, personName: name, outlierCount: count })}
                  />
                ))}
              </div>
            </div>
          )}

          {!loading && results.length > 0 && currentIndex < results.length && (
            <div className="text-center text-sm text-muted-foreground py-2">
              Загружено {currentIndex} из {results.length}...
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {displayedResults.length > 0 && `Показано: ${displayedResults.length} игроков`}
            </div>
            <div className="flex gap-2">
              {!loading && results.length > 0 && (
                <Button variant="outline" onClick={runAudit}>Обновить</Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Закрыть</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {detailPerson && (
        <EmbeddingConsistencyDialog
          personId={detailPerson.id}
          personName={detailPerson.name}
          open={!!detailPerson}
          onOpenChange={(open) => { if (!open) setDetailPerson(null) }}
          onDescriptorCleared={() => runAudit()}
        />
      )}

      <ConfirmFixDialog
        open={confirmFix.open}
        onOpenChange={(open) => setConfirmFix((s) => ({ ...s, open }))}
        personName={confirmFix.personName}
        outlierCount={confirmFix.outlierCount}
        onConfirm={() => confirmFix.personId && handleFixOutliers(confirmFix.personId)}
      />

      <ConfirmFixAllDialog
        open={confirmFixAll}
        onOpenChange={setConfirmFixAll}
        totalOutliers={totalFixableOutliers}
        onConfirm={handleFixAll}
      />
    </>
  )
}
