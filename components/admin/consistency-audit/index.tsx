"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, Loader2, Users, Wrench } from "lucide-react"
import { EmbeddingConsistencyDialog } from "@/components/admin/embedding-consistency-dialog"
import type { ConsistencyAuditResult } from "./types"
import { AuditResultRow } from "./AuditResultRow"
import { ConfirmFixDialog } from "./ConfirmFixDialog"
import { ConfirmFixAllDialog } from "./ConfirmFixAllDialog"
import { useConsistencyAudit } from "./useConsistencyAudit"

interface ConsistencyAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConsistencyAuditDialog({ open, onOpenChange }: ConsistencyAuditDialogProps) {
  const {
    loading,
    results,
    displayedResults,
    summary,
    error,
    currentIndex,
    scrollRef,
    fixingPersonId,
    fixingAll,
    totalFixableOutliers,
    runAudit,
    handleFixOutliers,
    handleFixAll,
  } = useConsistencyAudit(open)

  const [detailPerson, setDetailPerson] = useState<{ id: string; name: string } | null>(null)
  const [confirmFix, setConfirmFix] = useState<{
    open: boolean
    personId: string | null
    personName: string
    outlierCount: number
  }>({ open: false, personId: null, personName: "", outlierCount: 0 })
  const [confirmFixAll, setConfirmFixAll] = useState(false)

  async function onConfirmFix() {
    if (confirmFix.personId) {
      await handleFixOutliers(confirmFix.personId)
    }
    setConfirmFix({ open: false, personId: null, personName: "", outlierCount: 0 })
  }

  async function onConfirmFixAll() {
    setConfirmFixAll(false)
    await handleFixAll()
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
                    onFixOutliers={(id, name, count) =>
                      setConfirmFix({ open: true, personId: id, personName: name, outlierCount: count })
                    }
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
                <Button variant="outline" onClick={runAudit}>
                  Обновить
                </Button>
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
          onOpenChange={(open) => {
            if (!open) setDetailPerson(null)
          }}
          onDescriptorCleared={() => runAudit()}
        />
      )}

      <ConfirmFixDialog
        open={confirmFix.open}
        onOpenChange={(open) => setConfirmFix((s) => ({ ...s, open }))}
        personName={confirmFix.personName}
        outlierCount={confirmFix.outlierCount}
        onConfirm={onConfirmFix}
      />

      <ConfirmFixAllDialog
        open={confirmFixAll}
        onOpenChange={setConfirmFixAll}
        totalOutliers={totalFixableOutliers}
        onConfirm={onConfirmFixAll}
      />
    </>
  )
}
