"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Wrench } from "lucide-react"

export function ToolsCard() {
  const handleComingSoon = (feature: string) => {
    alert(`${feature} - в разработке`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <CardTitle>Инструменты</CardTitle>
        </div>
        <CardDescription>Дополнительные инструменты для работы с системой (в разработке)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Экспорт данных</div>
              <div className="text-sm text-muted-foreground">Экспорт списка людей и статистики в CSV/JSON</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleComingSoon("Экспорт данных")}>
              Экспорт
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Логи системы</div>
              <div className="text-sm text-muted-foreground">Просмотр последних операций и событий</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleComingSoon("Логи системы")}>
              Открыть логи
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Backup/Restore</div>
              <div className="text-sm text-muted-foreground">Резервное копирование и восстановление базы данных</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleComingSoon("Backup/Restore")}>
              Управление
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
