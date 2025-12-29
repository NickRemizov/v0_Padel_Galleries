"use client"

/**
 * Face Training Manager Component
 * 
 * Рефакторинг: 750 строк → 9 модулей
 * @refactored 2025-12-29
 */

import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrainingHistoryList } from "../training-history-list"

import { useFaceTraining } from "./hooks"
import { ErrorBanners, TrainingControlCard, ConfigurationCard } from "./components"

export function FaceTrainingManager() {
  const {
    localConfig,
    setLocalConfig,
    sessions,
    datasetStats,
    loading,
    preparing,
    training,
    trainingProgress,
    fastapiError,
    httpsRequired,
    lastSession,
    needsRetraining,
    loadData,
    prepareDataset,
    startTraining,
    saveConfig,
    resetConfig,
  } = useFaceTraining()

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Настройки распознавания</h2>
        <p className="text-sm text-muted-foreground">
          Управление обучением InsightFace модели и параметрами распознавания
        </p>
      </div>

      {/* Предупреждения об ошибках */}
      <ErrorBanners httpsRequired={httpsRequired} fastapiError={fastapiError} />

      {/* Управление обучением */}
      <TrainingControlCard
        lastSession={lastSession}
        needsRetraining={needsRetraining}
        datasetStats={datasetStats}
        training={training}
        trainingProgress={trainingProgress}
        preparing={preparing}
        fastapiError={fastapiError}
        onPrepare={prepareDataset}
        onStartTraining={startTraining}
        onRefresh={loadData}
      />

      {/* Настройки */}
      <ConfigurationCard
        localConfig={localConfig}
        setLocalConfig={setLocalConfig}
        fastapiError={fastapiError}
        onSave={saveConfig}
        onReset={resetConfig}
      />

      {/* История обучений */}
      <Card>
        <CardHeader>
          <CardTitle>История обучений</CardTitle>
          <CardDescription>Последние 10 сессий обучения модели</CardDescription>
        </CardHeader>
        <CardContent>
          <TrainingHistoryList sessions={sessions} />
        </CardContent>
      </Card>
    </div>
  )
}
