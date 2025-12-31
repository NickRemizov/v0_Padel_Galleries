"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Bug } from "lucide-react"
import { DatabaseIntegrityChecker } from "@/components/admin/database-integrity-checker"
import { DebugPersonPhotos } from "@/components/admin/debug-person-photos"
import { BatchProcessingCard } from "./BatchProcessingCard"
import { DatabaseMaintenanceCard } from "./DatabaseMaintenanceCard"
import { ToolsCard } from "./ToolsCard"

export function ServiceManager() {
  return (
    <div className="space-y-6">
      {/* Пакетное распознавание */}
      <BatchProcessingCard />

      {/* Проверка целостности */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Проверка целостности базы данных</CardTitle>
          </div>
          <CardDescription>
            Диагностика и исправление нарушений целостности данных
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DatabaseIntegrityChecker />
        </CardContent>
      </Card>

      {/* Обслуживание базы данных */}
      <DatabaseMaintenanceCard />

      {/* Отладка */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            <CardTitle>Отладка</CardTitle>
          </div>
          <CardDescription>Инструменты для диагностики и отладки системы распознавания</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Проверка фото человека</div>
              <div className="text-sm text-muted-foreground">
                Отладочная информация о фото конкретного человека или файла
              </div>
            </div>
            <DebugPersonPhotos />
          </div>
        </CardContent>
      </Card>

      {/* Инструменты (в разработке) */}
      <ToolsCard />
    </div>
  )
}
