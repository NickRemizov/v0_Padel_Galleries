"use client"

import { useState, useEffect, useCallback } from "react"
import type { Config, TrainingSession, DatasetStats } from "../types"
import { DEFAULT_CONFIG } from "../constants"

export function useFaceTraining() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [preparing, setPreparing] = useState(false)
  const [training, setTraining] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [fastapiError, setFastapiError] = useState(false)
  const [httpsRequired, setHttpsRequired] = useState(false)
  const [localConfig, setLocalConfig] = useState<Config>(DEFAULT_CONFIG)

  // Загрузка данных
  const loadData = useCallback(async () => {
    setLoading(true)
    setFastapiError(false)
    setHttpsRequired(false)
    try {
      console.log("[v0] Loading training data from API routes")

      const [configRes, historyRes] = await Promise.all([
        fetch("/api/admin/training/config"),
        fetch("/api/admin/training/history?limit=10"),
      ])

      // Handle config
      if (configRes.ok) {
        const configResult = await configRes.json()
        if (configResult.success && configResult.data) {
          const configData = configResult.data
          const validConfig = {
            ...DEFAULT_CONFIG,
            ...configData,
            confidence_thresholds: {
              ...DEFAULT_CONFIG.confidence_thresholds,
              ...(configData.confidence_thresholds || {}),
            },
            quality_filters: {
              ...DEFAULT_CONFIG.quality_filters,
              ...(configData.quality_filters || {}),
            },
            auto_avatar_on_create: configData.auto_avatar_on_create ?? DEFAULT_CONFIG.auto_avatar_on_create,
          }
          setFastapiError(false)
          setConfig(validConfig)
          setLocalConfig(validConfig)
        } else {
          console.warn("[v0] Config request failed:", configResult.error)
          setFastapiError(true)
          setConfig(DEFAULT_CONFIG)
          setLocalConfig(DEFAULT_CONFIG)
        }
      } else {
        setFastapiError(true)
        setConfig(DEFAULT_CONFIG)
        setLocalConfig(DEFAULT_CONFIG)
      }

      // Handle history
      if (historyRes.ok) {
        const historyResult = await historyRes.json()
        if (historyResult.success && historyResult.data) {
          setSessions(historyResult.data.sessions || [])
        } else {
          setSessions([])
        }
      } else {
        setSessions([])
      }
    } catch (error) {
      console.error("[v0] Error loading data:", error)
      setFastapiError(true)
      setConfig(DEFAULT_CONFIG)
      setLocalConfig(DEFAULT_CONFIG)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Подготовка датасета
  const prepareDataset = useCallback(async () => {
    setPreparing(true)
    try {
      const response = await fetch("/api/admin/training/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {},
          options: {
            min_faces_per_person: config?.min_faces_per_person || 3,
            include_co_occurring: true,
            context_weight: config?.context_weight || 0.1,
            quality_filters: config?.quality_filters,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        alert(`Ошибка при подготовке датасета: ${result.error || "Неизвестная ошибка"}`)
        return
      }

      setDatasetStats(result.data.dataset_stats)
      alert("Датасет успешно подготовлен!")
    } catch (error) {
      console.error("[v0] Error preparing dataset:", error)
      alert(`Ошибка при подготовке датасета: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
    } finally {
      setPreparing(false)
    }
  }, [config])

  // Запуск обучения
  const startTraining = useCallback(async () => {
    if (!datasetStats) {
      alert("Сначала подготовьте датасет")
      await prepareDataset()
      return
    }

    setTraining(true)
    setTrainingProgress(0)

    try {
      const response = await fetch("/api/admin/training/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "full",
          filters: {},
          options: {
            min_faces_per_person: config?.min_faces_per_person || 3,
            context_weight: config?.context_weight || 0.1,
            model_version: "v1.0",
            quality_filters: config?.quality_filters,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        alert(`Ошибка при запуске обучения: ${result.error || "Неизвестная ошибка"}`)
        setTraining(false)
        return
      }

      setCurrentSessionId(result.data.session_id)
      alert("Обучение запущено!")
    } catch (error) {
      console.error("[v0] Error starting training:", error)
      alert(`Ошибка при запуске обучения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
      setTraining(false)
    }
  }, [datasetStats, config, prepareDataset])

  // Проверка статуса обучения
  const checkTrainingStatus = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/admin/training/status/${sessionId}`)
      const result = await response.json()

      if (result.success && result.data) {
        const data = result.data
        if (data.progress) {
          setTrainingProgress(data.progress.percentage)
        }
        if (data.status === "completed" || data.status === "failed") {
          setTraining(false)
          setCurrentSessionId(null)
          setTrainingProgress(0)
          loadData()
        }
      }
    } catch (error) {
      console.error("[v0] Error checking training status:", error)
    }
  }, [loadData])

  // Сохранение конфига
  const saveConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/training/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localConfig),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save config")
      }

      setConfig(localConfig)
      setFastapiError(false)
      alert("Настройки сохранены успешно!")
    } catch (error) {
      console.error("[v0] Error saving config:", error)
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка"

      if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
        alert("Error 503: FastAPI сервер недоступен.")
      } else if (errorMessage.includes("connection_failed")) {
        alert("Ошибка подключения: Не удалось подключиться к FastAPI серверу.")
      } else {
        alert(`Ошибка при сохранении настроек: ${errorMessage}`)
      }
    }
  }, [localConfig])

  // Сброс конфига
  const resetConfig = useCallback(() => {
    setLocalConfig(config)
  }, [config])

  // Загрузка данных при монтировании
  useEffect(() => {
    loadData()
  }, [loadData])

  // Поллинг статуса обучения
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentSessionId) {
        checkTrainingStatus(currentSessionId)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [currentSessionId, checkTrainingStatus])

  // Вычисляемые значения
  const lastSession = sessions[0]
  const needsRetraining = lastSession && lastSession.metrics.accuracy && lastSession.metrics.accuracy < 0.85

  return {
    // Состояние
    config,
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
    // Действия
    loadData,
    prepareDataset,
    startTraining,
    saveConfig,
    resetConfig,
  }
}
