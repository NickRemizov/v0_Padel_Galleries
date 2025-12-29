"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react"
import type { TrainingSession, DatasetStats } from "../types"

interface TrainingControlCardProps {
  lastSession: TrainingSession | undefined
  needsRetraining: boolean
  datasetStats: DatasetStats | null
  training: boolean
  trainingProgress: number
  preparing: boolean
  fastapiError: boolean
  onPrepare: () => void
  onStartTraining: () => void
  onRefresh: () => void
}

export function TrainingControlCard({
  lastSession,
  needsRetraining,
  datasetStats,
  training,
  trainingProgress,
  preparing,
  fastapiError,
  onPrepare,
  onStartTraining,
  onRefresh,
}: TrainingControlCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Переобучение модели</CardTitle>
        <CardDescription>Запустите обучение модели на подтвержденных лицах из базы данных</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Последняя сессия */}
        {lastSession && (
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Последнее обучение:</span>
              <Badge variant={lastSession.status === "completed" ? "default" : "secondary"}>
                {lastSession.status === "completed" ? "Завершено" : lastSession.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>Дата: {new Date(lastSession.created_at).toLocaleString("ru-RU")}</div>
              <div>Режим: {lastSession.training_mode === "full" ? "Полное" : "Инкрементальное"}</div>
              <div>Людей: {lastSession.people_count}</div>
              <div>Лиц: {lastSession.faces_count}</div>
            </div>
            {lastSession.metrics.accuracy && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Accuracy:</span>
                  <span className="font-medium">{(lastSession.metrics.accuracy * 100).toFixed(1)}%</span>
                </div>
                <Progress value={lastSession.metrics.accuracy * 100} />
              </div>
            )}
          </div>
        )}

        {/* Предупреждение о переобучении */}
        {needsRetraining && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Рекомендуется переобучение</p>
              <p className="text-xs text-muted-foreground">
                Accuracy модели ниже 85%. Запустите переобучение для улучшения качества распознавания.
              </p>
            </div>
          </div>
        )}

        {/* Статистика датасета */}
        {datasetStats && (
          <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
            <h4 className="text-sm font-medium">Статистика датасета:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>Людей: {datasetStats.total_people}</div>
              <div>Лиц: {datasetStats.total_faces}</div>
              <div>Мин. лиц: {datasetStats.faces_per_person.min}</div>
              <div>Макс. лиц: {datasetStats.faces_per_person.max}</div>
              <div>Средн. лиц: {datasetStats.faces_per_person.avg.toFixed(1)}</div>
            </div>
          </div>
        )}

        {/* Прогресс обучения */}
        {training && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Обучение в процессе...</span>
              <span>{trainingProgress.toFixed(0)}%</span>
            </div>
            <Progress value={trainingProgress} />
          </div>
        )}

        {/* Кнопки управления */}
        <div className="flex gap-2">
          <Button onClick={onPrepare} disabled={preparing || training || fastapiError} variant="outline">
            {preparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Подготовка...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 h-4 w-4" />
                Подготовить датасет
              </>
            )}
          </Button>
          <Button onClick={onStartTraining} disabled={preparing || training || fastapiError}>
            {training ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Обучение...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Запустить обучение
              </>
            )}
          </Button>
          <Button onClick={onRefresh} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
