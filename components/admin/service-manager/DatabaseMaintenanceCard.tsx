"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Database, RefreshCw, AlertTriangle } from "lucide-react"
import { CleanupDuplicatesButton } from "@/components/admin/cleanup-duplicates-button"
import { SyncVerifiedButton } from "@/components/admin/sync-verified-button"
import { RegenerateDescriptorsDialog } from "@/components/admin/regenerate-descriptors-dialog"
import { ConsistencyAuditDialog } from "@/components/admin/consistency-audit-dialog"

export function DatabaseMaintenanceCard() {
  const [showRegenerateDescriptors, setShowRegenerateDescriptors] = useState(false)
  const [showConsistencyAudit, setShowConsistencyAudit] = useState(false)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Обслуживание базы данных</CardTitle>
          </div>
          <CardDescription>Инструменты для очистки и оптимизации базы данных распознавания лиц</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Удаление дубликатов записей</div>
                <div className="text-sm text-muted-foreground">
                  Удалить несколько записей для одной комбинации человек+фото
                </div>
              </div>
              <CleanupDuplicatesButton />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Синхронизация verified/confidence/processed</div>
                <div className="text-sm text-muted-foreground">
                  Исправить несоответствия в полях verified, confidence и has_been_processed
                </div>
              </div>
              <SyncVerifiedButton />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Восстановить дескрипторы</div>
                <div className="text-sm text-muted-foreground">
                  Регенерация дескрипторов для лиц без дескриптора
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowRegenerateDescriptors(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Восстановить
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Аудит эмбеддингов игроков</div>
                <div className="text-sm text-muted-foreground">
                  Проверка консистентности дескрипторов для поиска outliers
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowConsistencyAudit(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Аудит
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showRegenerateDescriptors && (
        <RegenerateDescriptorsDialog open={showRegenerateDescriptors} onOpenChange={setShowRegenerateDescriptors} />
      )}

      <ConsistencyAuditDialog
        open={showConsistencyAudit}
        onOpenChange={setShowConsistencyAudit}
      />
    </>
  )
}
