"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Loader2,
  AlertCircle,
  Users,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Images,
  Wrench,
  UserX,
  HelpCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

interface Statistics {
  overall: {
    total_people: number
    people_with_verified: number
    total_faces: number
    total_verified_faces: number
    avg_faces_per_person: string
    min_faces: number
    max_faces: number
  }
  distribution: Array<{
    threshold: string
    people_count: number
    total_faces: number
    percentage: string
  }>
  histogram: Array<{
    face_range: string
    people_count: number
    total_faces: number
  }>
  attention: {
    people_with_few_photos: Array<{ id: string; name: string; count: number }>
    people_without_avatar: Array<{ id: string; name: string }>
    unknown_faces_count: number
    faces_without_descriptors: number
  }
  top_people: Array<{ id: string; name: string; count: number }>
  galleries: {
    fully_verified: number
    partially_verified: number
    not_processed: number
    total: number
  }
  integrity: {
    inconsistent_verified_confidence: number
    orphaned_descriptors: number
    avg_unverified_confidence: number
  }
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
      const response = await fetch("/api/admin/face-statistics")
      const data = await response.json()

      if (!data || !data.overall || typeof data.overall.total_people !== "number") {
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

  if (error || !stats || !stats.overall) {
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

  const peopleWithoutVerified = stats.overall.total_people - stats.overall.people_with_verified
  const unverifiedFaces = stats.overall.total_faces - stats.overall.total_verified_faces

  const hasAttentionItems =
    stats.attention.people_with_few_photos.length > 0 ||
    stats.attention.people_without_avatar.length > 0 ||
    stats.attention.unknown_faces_count > 0 ||
    stats.attention.faces_without_descriptors > 0

  const hasIntegrityIssues =
    stats.integrity.inconsistent_verified_confidence > 0 || stats.integrity.orphaned_descriptors > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статистика распознавания</CardTitle>
        <CardDescription>Текущее состояние базы данных лиц</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ========== ОБЩАЯ СТАТИСТИКА ========== */}
        <div className="space-y-4">
          {/* Игроки */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Игроки</h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего в базе</div>
                <div className="text-2xl font-bold">{stats.overall.total_people}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />С подтверждёнными фото
                </div>
                <div className="text-2xl font-bold text-green-600">{stats.overall.people_with_verified}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Без подтверждённых фото</div>
                <div className="text-2xl font-bold text-muted-foreground">{peopleWithoutVerified}</div>
              </div>
            </div>
          </div>

          {/* Лица */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Лица на фото</h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего записей</div>
                <div className="text-2xl font-bold">{stats.overall.total_faces}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Подтверждённых (verified)
                </div>
                <div className="text-2xl font-bold text-green-600">{stats.overall.total_verified_faces}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Неподтверждённых</div>
                <div className="text-2xl font-bold text-muted-foreground">{unverifiedFaces}</div>
              </div>
            </div>
          </div>

          {/* Средние показатели */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Средн. фото на игрока</div>
              <div className="text-xl font-bold">{stats.overall.avg_faces_per_person}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Мин. фото</div>
              <div className="text-xl font-bold">{stats.overall.min_faces}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Макс. фото</div>
              <div className="text-xl font-bold">{stats.overall.max_faces}</div>
            </div>
          </div>
        </div>

        {/* ========== ТРЕБУЮТ ВНИМАНИЯ ========== */}
        {hasAttentionItems && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h4 className="font-medium text-amber-800">Требуют внимания</h4>
            </div>

            {/* Игроки с <3 фото */}
            {stats.attention.people_with_few_photos.length > 0 && (
              <div>
                <div className="text-sm text-amber-700 mb-1">
                  Игроки с &lt;3 фото ({stats.attention.people_with_few_photos.length}):
                </div>
                <div className="flex flex-wrap gap-1">
                  {stats.attention.people_with_few_photos.map((person) => (
                    <Badge key={person.id} variant="outline" className="bg-white text-amber-800 border-amber-300">
                      {person.name} ({person.count})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Неизвестные лица */}
            {stats.attention.unknown_faces_count > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <HelpCircle className="h-4 w-4" />
                <span>
                  Неизвестные лица (person_id=NULL): <strong>{stats.attention.unknown_faces_count}</strong>
                </span>
              </div>
            )}

            {/* Лица без дескрипторов */}
            {stats.attention.faces_without_descriptors > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Лица без дескрипторов: <strong>{stats.attention.faces_without_descriptors}</strong>
                  <span className="text-xs ml-1">(не будут распознаваться)</span>
                </span>
              </div>
            )}

            {/* Игроки без аватара */}
            {stats.attention.people_without_avatar.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-amber-700 mb-1">
                  <UserX className="h-4 w-4" />
                  <span>Игроки без аватара ({stats.attention.people_without_avatar.length}):</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {stats.attention.people_without_avatar.slice(0, 5).map((person) => (
                    <Badge key={person.id} variant="outline" className="bg-white text-amber-800 border-amber-300">
                      {person.name}
                    </Badge>
                  ))}
                  {stats.attention.people_without_avatar.length > 5 && (
                    <Badge variant="outline" className="bg-white text-amber-800 border-amber-300">
                      +{stats.attention.people_without_avatar.length - 5} ещё
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== ТОП ИГРОКОВ ========== */}
        {stats.top_people.length > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h4 className="font-medium">Топ игроков по фото</h4>
            </div>
            <div className="space-y-2">
              {stats.top_people.map((person, index) => (
                <div key={person.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${index === 0 ? "text-amber-500" : index === 1 ? "text-gray-400" : index === 2 ? "text-amber-700" : "text-muted-foreground"}`}
                    >
                      #{index + 1}
                    </span>
                    <span>{person.name}</span>
                  </div>
                  <Badge variant="secondary">{person.count} фото</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== СОСТОЯНИЕ ГАЛЕРЕЙ ========== */}
        {stats.galleries.total > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Images className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Состояние галерей</h4>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.galleries.fully_verified}</div>
                <div className="text-xs text-muted-foreground">Полностью верифицированы</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">{stats.galleries.partially_verified}</div>
                <div className="text-xs text-muted-foreground">Частично обработаны</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-muted-foreground">{stats.galleries.not_processed}</div>
                <div className="text-xs text-muted-foreground">Не обработаны</div>
              </div>
            </div>
            <div className="mt-3">
              <Progress value={(stats.galleries.fully_verified / stats.galleries.total) * 100} className="h-2" />
              <div className="text-xs text-muted-foreground text-center mt-1">
                {Math.round((stats.galleries.fully_verified / stats.galleries.total) * 100)}% полностью готово
              </div>
            </div>
          </div>
        )}

        {/* ========== ПРОБЛЕМЫ ЦЕЛОСТНОСТИ ========== */}
        {hasIntegrityIssues && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-red-600" />
              <h4 className="font-medium text-red-800">Проблемы целостности</h4>
            </div>

            {stats.integrity.inconsistent_verified_confidence > 0 && (
              <div className="text-sm text-red-700">
                • verified=true, но confidence≠1: <strong>{stats.integrity.inconsistent_verified_confidence}</strong>
                <span className="text-xs ml-1">(запустите синхронизацию)</span>
              </div>
            )}

            {stats.integrity.orphaned_descriptors > 0 && (
              <div className="text-sm text-red-700">
                • Осиротевшие дескрипторы: <strong>{stats.integrity.orphaned_descriptors}</strong>
                <span className="text-xs ml-1">(ссылаются на несуществующие фото)</span>
              </div>
            )}
          </div>
        )}

        {/* ========== СРЕДНЯЯ CONFIDENCE ========== */}
        {stats.integrity.avg_unverified_confidence > 0 && (
          <div className="rounded-lg border p-3 text-center">
            <div className="text-sm text-muted-foreground">Средняя confidence неверифицированных</div>
            <div className="text-xl font-bold">{(stats.integrity.avg_unverified_confidence * 100).toFixed(1)}%</div>
          </div>
        )}

        {/* ========== РАСПРЕДЕЛЕНИЕ ========== */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Распределение по количеству лиц</h4>
          <p className="text-xs text-muted-foreground">Сколько игроков имеют N и более подтверждённых фото</p>
          {stats.distribution.map((item) => (
            <div key={item.threshold} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{item.threshold}</span>
                <span className="text-muted-foreground">
                  {item.people_count} людей ({item.percentage}%)
                </span>
              </div>
              <Progress value={Number.parseFloat(item.percentage)} />
            </div>
          ))}
        </div>

        {/* ========== ГИСТОГРАММА ========== */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Гистограмма распределения</h4>
          <p className="text-xs text-muted-foreground">
            Распределение игроков по диапазонам количества подтверждённых фото
          </p>
          {stats.histogram.map((item) => (
            <div key={item.face_range} className="flex items-center gap-4">
              <div className="min-w-[100px] text-sm font-medium">{item.face_range}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 rounded bg-primary transition-all"
                    style={{
                      width: `${stats.overall.people_with_verified > 0 ? (item.people_count / stats.overall.people_with_verified) * 100 : 0}%`,
                      minWidth: item.people_count > 0 ? "20px" : "0",
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {item.people_count} ({item.total_faces} лиц)
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
