"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { IntegritySummaryProps } from "../types"

export function IntegritySummary({ stats, checksPerformed }: IntegritySummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 Статистика базы данных</CardTitle>
        <CardDescription>Общая информация о количестве записей в базе</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Галереи</div>
            <div className="text-2xl font-bold">{stats.totalGalleries}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Фото</div>
            <div className="text-2xl font-bold">{stats.totalPhotos}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Лица на фото</div>
            <div className="text-2xl font-bold">{stats.totalPhotoFaces}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Игроки</div>
            <div className="text-2xl font-bold">{stats.totalPeople}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Настройки</div>
            <div className="text-2xl font-bold">{stats.totalConfigs}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Проверок</div>
            <div className="text-2xl font-bold">{checksPerformed}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
