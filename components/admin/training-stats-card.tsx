"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Loader2,
  AlertCircle,
  Users,
  Camera,
  AlertTriangle,
  Trophy,
  Images,
  Wrench,
  BarChart3,
  TrendingUp,
  UserCheck,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

interface Statistics {
  players: {
    total: number
    with_verified: number
    without_verified: number
    without_verified_list: Array<{ id: string; name: string }>
  }
  faces: {
    total: number
    verified: number
    unverified: number
  }
  images: {
    total: number
    recognized: number
    with_1_person: number
    with_2_3_persons: number
    with_4_plus_persons: number
  }
  player_stats: {
    avg_photos: number
    min_photos: number
    max_photos: number
  }
  gallery_stats: {
    avg_photos: number
    min_photos: number
    max_photos: number
  }
  attention: {
    few_photos_count: number
    few_photos_list: Array<{ id: string; name: string; count: number }>
    no_avatar_count: number
    no_avatar_list: Array<{ id: string; name: string }>
    unknown_faces: number
  }
  top_players: Array<{ id: string; name: string; count: number }>
  galleries: {
    total: number
    fully_verified: number
    fully_verified_list: Array<{ id: string; title: string; date: string; photos: number; facesVerified: number }>
    fully_recognized: number
    fully_recognized_list: Array<{
      id: string
      title: string
      date: string
      photos: number
      facesVerified: number
      facesUnverified: number
    }>
    fully_processed: number
    fully_processed_list: Array<{
      id: string
      title: string
      date: string
      photos: number
      facesVerified: number
      facesUnverified: number
      facesUnknown: number
    }>
    partially_verified: number
    partially_verified_list: Array<{
      id: string
      title: string
      date: string
      processed: number
      total: number
      facesVerified: number
      facesUnverified: number
      facesUnknown: number
    }>
    not_processed: number
    not_processed_list: Array<{ id: string; title: string; date: string; photos: number }>
  }
  integrity: {
    inconsistent_verified: number
    orphaned_descriptors: number
    avg_unverified_confidence: number
  }
  distribution: Array<{
    threshold: number
    count: number
    percentage: number
  }>
  histogram: Array<{
    range: string
    count: number
    total_faces: number
  }>
}
function StatValue({
  label,
  value,
  color = "text-foreground",
  small = false,
}: {
  label: string
  value: string | number
  color?: string
  small?: boolean
}) {
  return (
    <div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export function TrainingStatsCard() {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const response = await fetch("/api/admin/face-statistics?top=15")
      const result = await response.json()

      // Unified format: {success, data, error, code}
      if (!result.success) {
        console.error("[v0] Failed to fetch statistics:", result.error)
        setError(result.error || "Не удалось загрузить статистику")
        setStats(null)
        return
      }

      const data = result.data
      if (!data || !data.players || typeof data.players.total !== "number") {
        console.error("[v0] Invalid statistics data structure:", data)
        setError("Получены некорректные данные статистики")
        setStats(null)
        return
      }

      setStats(data)
      setError(null)
    } catch (error) {
      console.error("[v0] Error fetching statistics:", error)
      setError("Не удалось загрузить статистику")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Статистика распознавания</CardTitle>
          <CardDescription>Текущее состояние базы данных лиц</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              {error || "Не удалось загрузить статистику. Проверьте подключение к базе данных."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const getTopPlayersColumns = (players: typeof stats.top_players, numColumns: number) => {
    const perColumn = Math.ceil(players.length / numColumns)
    const columns: (typeof players)[] = []
    for (let i = 0; i < numColumns; i++) {
      columns.push(players.slice(i * perColumn, (i + 1) * perColumn))
    }
    return columns
  }

  const topColumns = getTopPlayersColumns(stats.top_players, 3)

  const hasAttentionItems =
    stats.attention.few_photos_count > 0 ||
    stats.attention.no_avatar_count > 0 ||
    stats.attention.unknown_faces > 0 ||
    stats.players.without_verified > 0

  const hasIntegrityIssues = stats.integrity.inconsistent_verified > 0 || stats.integrity.orphaned_descriptors > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статистика распознавания</CardTitle>
        <CardDescription>Текущее состояние базы данных лиц</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* === СЕКЦИЯ 1: Основные метрики === */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Игроки */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Игроки</h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatValue label="Всего" value={stats.players.total} />
              <StatValue label="С фото" value={stats.players.with_verified} color="text-green-600" />
              <StatValue label="Без фото" value={stats.players.without_verified} color="text-muted-foreground" />
            </div>
          </div>

          {/* Лица */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Лица на фото</h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatValue label="Всего" value={stats.faces.total.toLocaleString()} />
              <StatValue label="Verified" value={stats.faces.verified.toLocaleString()} color="text-green-600" />
              <StatValue
                label="Unverified"
                value={stats.faces.unverified.toLocaleString()}
                color="text-muted-foreground"
              />
            </div>
          </div>

          {/* Изображения */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Images className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Изображения</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatValue label="Всего" value={stats.images.total.toLocaleString()} />
              <StatValue label="Распознан" value={stats.images.recognized.toLocaleString()} color="text-green-600" />
            </div>
          </div>

          {/* Распределение людей на фото */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium text-sm">Распределение людей на фото</h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatValue label="1 чел" value={stats.images.with_1_person} />
              <StatValue label="2-3 чел" value={stats.images.with_2_3_persons} />
              <StatValue label="4+ чел" value={stats.images.with_4_plus_persons} />
            </div>
          </div>
        </div>

        {/* === СЕКЦИЯ 2: Средние показатели === */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">Средние показатели</h4>
          </div>
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {/* Фото/игрок */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото на игрока</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.player_stats.avg_photos}</div>
                  <div className="text-xs text-muted-foreground">среднее</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{stats.player_stats.min_photos}</div>
                  <div className="text-xs text-muted-foreground">минимум</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{stats.player_stats.max_photos}</div>
                  <div className="text-xs text-muted-foreground">максимум</div>
                </div>
              </div>
            </div>

            {/* Фото/галерея */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото в галерее</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.gallery_stats.avg_photos}</div>
                  <div className="text-xs text-muted-foreground">среднее</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{stats.gallery_stats.min_photos}</div>
                  <div className="text-xs text-muted-foreground">минимум</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{stats.gallery_stats.max_photos}</div>
                  <div className="text-xs text-muted-foreground">максимум</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === СЕКЦИЯ 3: Внимание + Целостность === */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Требуют внимания */}
          {hasAttentionItems && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h4 className="font-medium text-amber-800 dark:text-amber-200">Требуют внимания</h4>
              </div>

              {/* 1. Без подтверждённых фото */}
              {stats.players.without_verified > 0 && (
                <div>
                  <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
                    Без подтверждённых фото ({stats.players.without_verified}):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.players.without_verified_list?.slice(0, 20).map((p) => (
                      <span
                        key={p.id}
                        className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                      >
                        {p.name}
                      </span>
                    ))}
                    {stats.players.without_verified > 20 && (
                      <Badge variant="outline" className="text-amber-700">
                        +{stats.players.without_verified - 20} ещё
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* 2. С 1-2 фото */}
              {stats.attention.few_photos_count > 0 && (
                <div>
                  <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
                    С 1-2 фото ({stats.attention.few_photos_count}):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.attention.few_photos_list?.map((p) => (
                      <span
                        key={p.id}
                        className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                      >
                        {p.name} ({p.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Без аватара */}
              {stats.attention.no_avatar_count > 0 && (
                <div>
                  <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
                    Без аватара ({stats.attention.no_avatar_count}):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.attention.no_avatar_list?.map((p) => (
                      <span
                        key={p.id}
                        className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Неизвестные лица */}
              {stats.attention.unknown_faces > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <span>❓ Неизвестные лица:</span>
                  <strong>{stats.attention.unknown_faces}</strong>
                </div>
              )}
            </div>
          )}

          {/* Целостность */}
          <div
            className={`rounded-lg border p-4 space-y-2 ${
              hasIntegrityIssues
                ? "border-red-200 bg-red-50 dark:bg-red-950/20"
                : "border-green-200 bg-green-50 dark:bg-green-950/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <Wrench className={`h-5 w-5 ${hasIntegrityIssues ? "text-red-600" : "text-green-600"}`} />
              <h4
                className={`font-medium ${hasIntegrityIssues ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}`}
              >
                Целостность данных
              </h4>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm">verified ≠ confidence</span>
              <Badge
                variant={stats.integrity.inconsistent_verified === 0 ? "default" : "destructive"}
                className={
                  stats.integrity.inconsistent_verified === 0 ? "bg-green-100 text-green-700 hover:bg-green-100" : ""
                }
              >
                {stats.integrity.inconsistent_verified === 0 ? "✓ OK" : stats.integrity.inconsistent_verified}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Осиротевшие дескрипторы</span>
              <Badge
                variant={stats.integrity.orphaned_descriptors === 0 ? "default" : "destructive"}
                className={
                  stats.integrity.orphaned_descriptors === 0 ? "bg-green-100 text-green-700 hover:bg-green-100" : ""
                }
              >
                {stats.integrity.orphaned_descriptors === 0 ? "✓ OK" : stats.integrity.orphaned_descriptors}
              </Badge>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm">Ср. confidence (unverified)</span>
              <span className="font-bold">{(stats.integrity.avg_unverified_confidence * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* === СЕКЦИЯ 4: Топ игроков === */}
        {stats.top_players.length > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h4 className="font-medium">Топ игроков по количеству фото</h4>
            </div>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              {topColumns.map((column, colIndex) => (
                <div key={colIndex} className="space-y-1">
                  {column.map((player, i) => {
                    const globalIndex = colIndex * 5 + i
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 text-xs font-bold ${
                              globalIndex === 0
                                ? "text-amber-500"
                                : globalIndex === 1
                                  ? "text-gray-400"
                                  : globalIndex === 2
                                    ? "text-amber-700"
                                    : "text-muted-foreground"
                            }`}
                          >
                            #{globalIndex + 1}
                          </span>
                          <span>{player.name}</span>
                        </div>
                        <Badge variant="secondary">{player.count}</Badge>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === СЕКЦИЯ 5: Галереи === */}
        {stats.galleries.total > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Images className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Состояние галерей</h4>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              {/* 1. Полностью верифицированы (зелёный) */}
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-green-600">{stats.galleries.fully_verified}</span>
                  <span className="text-xs text-green-700 dark:text-green-300">Полностью верифиц.</span>
                </div>
                <div className="space-y-1.5">
                  {stats.galleries.fully_verified_list?.map((g) => (
                    <div key={g.id} className="text-xs flex justify-between items-center">
                      <span className="truncate">
                        {g.title} {g.date}
                      </span>
                      <span className="text-muted-foreground ml-2 whitespace-nowrap">
                        {g.photos}ф / <span className="text-green-600">{g.facesVerified}✓</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Полностью распознаны (синий) */}
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-blue-600">{stats.galleries.fully_recognized}</span>
                  <span className="text-xs text-blue-700 dark:text-blue-300">Полностью распознаны</span>
                </div>
                <div className="space-y-1.5">
                  {stats.galleries.fully_recognized_list?.map((g) => (
                    <div key={g.id} className="text-xs flex justify-between items-center">
                      <span className="truncate">
                        {g.title} {g.date}
                      </span>
                      <span className="text-muted-foreground ml-2 whitespace-nowrap">
                        {g.photos}ф / <span className="text-green-600">{g.facesVerified}✓</span>+
                        <span className="text-yellow-600">{g.facesUnverified}~</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Полностью обработаны (серый) */}
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-slate-600">{stats.galleries.fully_processed}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Полностью обработаны</span>
                </div>
                <div className="space-y-1.5">
                  {stats.galleries.fully_processed_list?.map((g) => (
                    <div key={g.id} className="text-xs flex justify-between items-center">
                      <span className="truncate">
                        {g.title} {g.date}
                      </span>
                      <span className="text-muted-foreground ml-2 whitespace-nowrap">
                        {g.photos}ф / <span className="text-green-600">{g.facesVerified}✓</span>+
                        <span className="text-yellow-600">{g.facesUnverified}~</span>+
                        <span className="text-red-500">{g.facesUnknown}?</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Частично обработаны (жёлтый) */}
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-yellow-600">{stats.galleries.partially_verified}</span>
                  <span className="text-xs text-yellow-700 dark:text-yellow-300">Частично обработаны</span>
                </div>
                <div className="space-y-1.5">
                  {stats.galleries.partially_verified_list?.map((g) => (
                    <div key={g.id} className="text-xs flex justify-between items-center">
                      <span className="truncate">
                        {g.title} {g.date}
                      </span>
                      <span className="text-muted-foreground ml-2 whitespace-nowrap">
                        {g.processed}/{g.total}ф / <span className="text-green-600">{g.facesVerified}✓</span>+
                        <span className="text-yellow-600">{g.facesUnverified}~</span>+
                        <span className="text-red-500">{g.facesUnknown}?</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Не обработаны (оранжжый) */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-amber-600">{stats.galleries.not_processed}</span>
                  <span className="text-xs text-amber-700 dark:text-amber-300">Не обработаны</span>
                </div>
                <div className="space-y-1.5">
                  {stats.galleries.not_processed_list?.map((g) => (
                    <div key={g.id} className="text-xs flex justify-between items-center">
                      <span className="truncate">
                        {g.title} {g.date}
                      </span>
                      <span className="text-muted-foreground ml-2 whitespace-nowrap">({g.photos} фото)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === СЕКЦИЯ 6: Гистограмма + Распределение === */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Гистограмма */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Гистограмма (по диапазонам фото)</h4>
            </div>
            <div className="space-y-2">
              {stats.histogram.map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium w-16">{item.range}</span>
                    <span className="text-muted-foreground text-xs">
                      {item.count} игр. ({item.total_faces} лиц)
                    </span>
                  </div>
                  <Progress
                    value={(item.count / Math.max(...stats.histogram.map((h) => h.count), 1)) * 100}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Распределение */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Распределение (≥N фото)</h4>
            </div>
            <div className="space-y-2">
              {stats.distribution.map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">≥ {item.threshold} фото</span>
                    <span className="text-muted-foreground text-xs">
                      {item.count} игр. ({item.percentage}%)
                    </span>
                  </div>
                  <Progress value={item.percentage} className="h-2 [&>div]:bg-green-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
