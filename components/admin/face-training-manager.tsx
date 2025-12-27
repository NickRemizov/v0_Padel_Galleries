"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, TrendingUp, AlertTriangle, UserCircle } from "lucide-react"
import { TrainingHistoryList } from "./training-history-list"

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://23.88.61.20:8001"

interface TrainingSession {
  id: string
  created_at: string
  training_mode: string
  faces_count: number
  people_count: number
  metrics: {
    accuracy?: number
    precision?: number
    recall?: number
  }
  status: string
}

interface Config {
  confidence_thresholds: {
    low_data: number
    medium_data: number
    high_data: number
  }
  context_weight: number
  min_faces_per_person: number
  auto_retrain_threshold: number
  auto_retrain_percentage: number
  quality_filters?: {
    min_detection_score: number
    min_face_size: number
    min_blur_score: number
  }
  auto_avatar_on_create?: boolean
}

interface DatasetStats {
  total_people: number
  total_faces: number
  faces_per_person: {
    min: number
    max: number
    avg: number
  }
  people_by_face_count: Record<string, number>
}

const DEFAULT_CONFIG: Config = {
  confidence_thresholds: {
    low_data: 0.75,
    medium_data: 0.65,
    high_data: 0.55,
  },
  context_weight: 0.1,
  min_faces_per_person: 3,
  auto_retrain_threshold: 25,
  auto_retrain_percentage: 0.1,
  quality_filters: {
    min_detection_score: 0.7,
    min_face_size: 80,
    min_blur_score: 80.0,
  },
  auto_avatar_on_create: true,
}

export function FaceTrainingManager() {
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

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      if (currentSessionId) {
        checkTrainingStatus(currentSessionId)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [currentSessionId])

  async function loadData() {
    setLoading(true)
    setFastapiError(false)
    setHttpsRequired(false)
    try {
      console.log("[v0] Loading training data from API routes")

      const [configRes, historyRes] = await Promise.all([
        fetch("/api/admin/training/config"),
        fetch("/api/admin/training/history?limit=10"),
      ])

      console.log("[v0] Config response status:", configRes.status)
      console.log("[v0] History response status:", historyRes.status)

      // Handle config - unified format: {success, data, error, code}
      if (configRes.ok) {
        const configResult = await configRes.json()
        console.log("[v0] Config result:", configResult)

        if (configResult.success && configResult.data) {
          const configData = configResult.data
          // Valid config received - merge with defaults
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
          console.log("[v0] Merged config:", validConfig)
          setFastapiError(false)
          setConfig(validConfig)
          setLocalConfig(validConfig)
        } else {
          // Backend error
          console.warn("[v0] Config request failed:", configResult.error)
          setFastapiError(true)
          setConfig(DEFAULT_CONFIG)
          setLocalConfig(DEFAULT_CONFIG)
        }
      } else {
        console.error("[v0] Config request failed:", configRes.status)
        setFastapiError(true)
        setConfig(DEFAULT_CONFIG)
        setLocalConfig(DEFAULT_CONFIG)
      }

      // Handle history - unified format: {success, data: {sessions, total}}
      if (historyRes.ok) {
        const historyResult = await historyRes.json()
        if (historyResult.success && historyResult.data) {
          setSessions(historyResult.data.sessions || [])
        } else {
          console.warn("[v0] History request failed:", historyResult.error)
          setSessions([])
        }
      } else {
        console.error("[v0] History request failed:", historyRes.status)
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
  }

  async function prepareDataset() {
    setPreparing(true)
    try {
      console.log("[v0] Preparing dataset...")

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

      console.log("[v0] Prepare response status:", response.status)
      const result = await response.json()

      // Unified format: {success, data: {dataset_stats}}
      if (!response.ok || !result.success) {
        console.error("[v0] Prepare dataset error:", result.error)
        alert(`Ошибка при подготовке датасета: ${result.error || "Неизвестная ошибка"}`)
        return
      }

      console.log("[v0] Dataset prepared:", result.data)
      setDatasetStats(result.data.dataset_stats)
      alert("Датасет успешно подготовлен!")
    } catch (error) {
      console.error("[v0] Error preparing dataset:", error)
      alert(`Ошибка при подготовке датасета: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
    } finally {
      setPreparing(false)
    }
  }

  async function startTraining() {
    if (!datasetStats) {
      alert("Сначала подготовьте датасет")
      await prepareDataset()
      return
    }

    setTraining(true)
    setTrainingProgress(0)

    try {
      console.log("[v0] Starting training...")

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

      console.log("[v0] Training response status:", response.status)
      const result = await response.json()

      // Unified format: {success, data: {session_id}}
      if (!response.ok || !result.success) {
        console.error("[v0] Training error:", result.error)
        alert(`Ошибка при запуске обучения: ${result.error || "Неизвестная ошибка"}`)
        setTraining(false)
        return
      }

      console.log("[v0] Training started:", result.data)
      setCurrentSessionId(result.data.session_id)
      alert("Обучение запущено!")
    } catch (error) {
      console.error("[v0] Error starting training:", error)
      alert(`Ошибка при запуске обучения: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
      setTraining(false)
    }
  }

  async function checkTrainingStatus(sessionId: string) {
    try {
      const response = await fetch(`/api/admin/training/status/${sessionId}`)
      const result = await response.json()

      // Unified format: {success, data: {progress, status}}
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
  }

  async function saveConfig() {
    try {
      console.log("[v0] Saving config:", localConfig)

      const response = await fetch("/api/admin/training/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localConfig),
      })

      console.log("[v0] Save config response status:", response.status)
      const result = await response.json()

      // Unified format: {success, data, error}
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save config")
      }

      console.log("[v0] Config saved:", result.data)
      setConfig(localConfig)
      setFastapiError(false)
      alert("Настройки сохранены успешно!")
    } catch (error) {
      console.error("[v0] Error saving config:", error)
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка"

      if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
        alert(
          "Ошибка 503: FastAPI сервер недоступен. Проверьте, что сервер запущен и доступен по адресу " + FASTAPI_URL,
        )
      } else if (errorMessage.includes("connection_failed")) {
        alert("Ошибка подключения: Не удалось подключиться к FastAPI серверу. Проверьте URL и доступность сервера.")
      } else {
        alert(`Ошибка при сохранении настроек: ${errorMessage}`)
      }
    }
  }

  function resetConfig() {
    setLocalConfig(config)
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const lastSession = sessions[0]
  const needsRetraining = lastSession && lastSession.metrics.accuracy && lastSession.metrics.accuracy < 0.85

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Настройки распознавания</h2>
        <p className="text-sm text-muted-foreground">Управление обучением InsightFace модели и параметрами распознавания</p>
      </div>

      {httpsRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-destructive">FastAPI сервер требует HTTPS</p>
            <p className="text-xs text-muted-foreground">
              Сервер отклоняет HTTP запросы с сообщением "Invalid request, only https is supported"
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-medium">Решение 1: Измените переменную окружения</p>
              <p className="text-muted-foreground">
                В разделе "Vars" боковой панели измените FASTAPI_URL на https://23.88.61.20:8001
              </p>
              <p className="mt-2 font-medium">Решение 2: Настройте FastAPI сервер</p>
              <p className="text-muted-foreground">
                Отключите проверку HTTPS в настройках FastAPI сервера для разработки
              </p>
            </div>
          </div>
        </div>
      )}

      {fastapiError && !httpsRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-amber-500">FastAPI сервер недоступен</p>
            <p className="text-xs text-muted-foreground">
              Не удалось подключиться к серверу обучения. Проверьте консоль браузера (F12) для деталей.
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-medium">Возможные причины:</p>
              <ul className="list-inside list-disc text-muted-foreground">
                <li>FastAPI сервер не запущен</li>
                <li>Неверный URL в переменной FASTAPI_URL</li>
                <li>Сервер недоступен из интернета (для деплоя)</li>
                <li>Порт закрыт файрволом</li>
              </ul>
              <p className="mt-2 font-medium">Текущий URL: {process.env.NEXT_PUBLIC_FASTAPI_URL || "не установлен"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Training Control Section */}
      <Card>
        <CardHeader>
          <CardTitle>Переобучение модели</CardTitle>
          <CardDescription>Запустите обучение модели на подтвержденных лицах из базы данных</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {training && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Обучение в процессе...</span>
                <span>{trainingProgress.toFixed(0)}%</span>
              </div>
              <Progress value={trainingProgress} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={prepareDataset} disabled={preparing || training || fastapiError} variant="outline">
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
            <Button onClick={startTraining} disabled={preparing || training || fastapiError}>
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
            <Button onClick={loadData} variant="outline" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры распознавания</CardTitle>
          <CardDescription>Настройте пороги confidence и вес контекста для распознавания лиц</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto Avatar Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Автоматические аватары
            </h4>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Автоматически присваивать аватар при создании игрока</Label>
                <p className="text-sm text-muted-foreground">
                  При создании нового игрока аватар будет сгенерирован автоматически из фото с лицом
                </p>
              </div>
              <Switch
                checked={localConfig.auto_avatar_on_create ?? true}
                onCheckedChange={(checked) =>
                  setLocalConfig({
                    ...localConfig,
                    auto_avatar_on_create: checked,
                  })
                }
              />
            </div>
          </div>

          {/* Quality Filtering section */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Фильтрация качества</h4>
            <p className="text-xs text-muted-foreground">
              Отсеивайте лица низкого качества при детекции и распознавании
            </p>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Минимальный det_score</Label>
                  <span className="text-sm font-medium">
                    {(localConfig.quality_filters?.min_detection_score || 0.7).toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[localConfig.quality_filters?.min_detection_score || 0.7]}
                  onValueChange={([value]) =>
                    setLocalConfig({
                      ...localConfig,
                      quality_filters: {
                        ...localConfig.quality_filters!,
                        min_detection_score: value,
                      },
                    })
                  }
                  min={0.5}
                  max={0.9}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  0.50 - очень мягкий | 0.70 - рекомендуемый | 0.90 - строгий
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Минимальный размер лица (px)</Label>
                  <span className="text-sm font-medium">
                    {Math.round(localConfig.quality_filters?.min_face_size || 80)}
                  </span>
                </div>
                <Slider
                  value={[localConfig.quality_filters?.min_face_size || 80]}
                  onValueChange={([value]) =>
                    setLocalConfig({
                      ...localConfig,
                      quality_filters: {
                        ...localConfig.quality_filters!,
                        min_face_size: value,
                      },
                    })
                  }
                  min={30}
                  max={200}
                  step={10}
                />
                <p className="text-xs text-muted-foreground">
                  30px - очень мелкие лица | 80px - рекомендуемый | 200px - только крупные
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Минимальная резкость (blur score)</Label>
                  <span className="text-sm font-medium">
                    {Math.round(localConfig.quality_filters?.min_blur_score || 80)}
                  </span>
                </div>
                <Slider
                  value={[localConfig.quality_filters?.min_blur_score || 80]}
                  onValueChange={([value]) =>
                    setLocalConfig({
                      ...localConfig,
                      quality_filters: {
                        ...localConfig.quality_filters!,
                        min_blur_score: value,
                      },
                    })
                  }
                  min={10}
                  max={150}
                  step={10}
                />
                <p className="text-xs text-muted-foreground">
                  10 - размытые лица | 60-80 - рекомендуемый | 150 - только четкие
                </p>
              </div>
            </div>
          </div>

          {/* Confidence Thresholds */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Пороги уверенности распознавания</h4>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Минимальная уверенность для сохранения person_id, для распознавания</Label>
                  <span className="text-sm font-medium">
                    {(localConfig.confidence_thresholds.high_data * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[localConfig.confidence_thresholds.high_data]}
                  onValueChange={([value]) =>
                    setLocalConfig({
                      ...localConfig,
                      confidence_thresholds: { ...localConfig.confidence_thresholds, high_data: value },
                    })
                  }
                  min={0.3}
                  max={0.9}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  30% - очень мягкий | 60% - рекомендуемый | 80% - строгий
                </p>
              </div>

              <div className="space-y-2 opacity-50">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Средняя уверенность (не используется)</Label>
                  <span className="text-sm font-medium">
                    {(localConfig.confidence_thresholds.medium_data * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  disabled
                  value={[localConfig.confidence_thresholds.medium_data]}
                  min={0.3}
                  max={0.9}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">Будет использоваться с HDBSCAN clustering</p>
              </div>

              <div className="space-y-2 opacity-50">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Низкая уверенность (не используется)</Label>
                  <span className="text-sm font-medium">
                    {(localConfig.confidence_thresholds.low_data * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider disabled value={[localConfig.confidence_thresholds.low_data]} min={0.3} max={0.9} step={0.05} />
                <p className="text-xs text-muted-foreground">Будет использоваться с HDBSCAN clustering</p>
              </div>
            </div>
          </div>

          {/* Context Weight */}
          <div className="space-y-4 pt-4 border-t opacity-50">
            <h4 className="text-sm font-medium">Контекстное распознавание (не используется)</h4>
            <p className="text-xs text-muted-foreground">
              Вес контекстной информации (галерея, дата) при распознавании
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Context Weight</Label>
                <span className="text-sm font-medium">{localConfig.context_weight.toFixed(2)}</span>
              </div>
              <Slider disabled value={[localConfig.context_weight]} min={0.0} max={0.5} step={0.05} />
              <p className="text-xs text-muted-foreground">
                0.00 - контекст не учитывается | 0.10 - минимальное влияние | 0.30 - среднее влияние | 0.50 -
                максимальное влияние
              </p>
              <p className="text-xs text-muted-foreground">
                Будет использоваться с HDBSCAN для учёта совместных появлений людей
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={saveConfig} disabled={fastapiError}>
              Сохранить настройки
            </Button>
            <Button onClick={resetConfig} variant="outline">
              Сбросить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Training History */}
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
