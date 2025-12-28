"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"

/**
 * Statistics interface matching actual backend response from
 * python/routers/admin/statistics.py -> ApiResponse.ok({...})
 */
interface FaceStatistics {
  confidence_threshold: number
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
    fully_verified_list: Array<{ id: string; slug: string; title: string; date: string; photos: number }>
    fully_recognized: number
    fully_recognized_list: Array<{ id: string; slug: string; title: string; date: string; photos: number }>
    fully_processed: number
    fully_processed_list: Array<{ id: string; slug: string; title: string; date: string; photos: number }>
    partially_verified: number
    partially_verified_list: Array<{ id: string; slug: string; title: string; date: string }>
    not_processed: number
    not_processed_list: Array<{ id: string; slug: string; title: string; date: string; photos: number }>
  }
  integrity: {
    inconsistent_verified: number
    orphaned_descriptors: number
    avg_unverified_confidence: number
  }
  distribution: Array<{ threshold: number; count: number; percentage: number }>
  histogram: Array<{ range: string; count: number; total_faces: number }>
}

interface ApiResponse {
  success: boolean
  data?: FaceStatistics
  error?: string
}

export default function FaceStatisticsPage() {
  const [stats, setStats] = useState<FaceStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/face-statistics")
      const result: ApiResponse = await response.json()

      if (result.success && result.data) {
        setStats(result.data)
      } else {
        setError(result.error || "Failed to load statistics")
        setStats(null)
      }
    } catch (err) {
      console.error("Error fetching statistics:", err)
      setError(err instanceof Error ? err.message : "Network error")
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-muted-foreground">
          {error || "Failed to load statistics"}
        </div>
        <div className="flex justify-center mt-4">
          <Button onClick={fetchStats} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Face Recognition Statistics</h1>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Statistics */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Players</div>
            <div className="text-2xl font-bold">{stats.players.total}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Verified Faces</div>
            <div className="text-2xl font-bold">{stats.faces.verified}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg Photos/Player</div>
            <div className="text-2xl font-bold">{stats.player_stats.avg_photos}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Min Photos</div>
            <div className="text-2xl font-bold">{stats.player_stats.min_photos}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Max Photos</div>
            <div className="text-2xl font-bold">{stats.player_stats.max_photos}</div>
          </div>
        </div>
      </Card>

      {/* Players & Faces Details */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Players</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">With verified faces</span>
              <span className="font-medium">{stats.players.with_verified}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Without verified faces</span>
              <span className="font-medium">{stats.players.without_verified}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Players with few photos (1-2)</span>
              <span className="font-medium">{stats.attention.few_photos_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Without avatar</span>
              <span className="font-medium">{stats.attention.no_avatar_count}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Faces</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total faces</span>
              <span className="font-medium">{stats.faces.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verified</span>
              <span className="font-medium text-green-600">{stats.faces.verified}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unverified</span>
              <span className="font-medium text-yellow-600">{stats.faces.unverified}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unknown (no person)</span>
              <span className="font-medium text-red-600">{stats.attention.unknown_faces}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Images Statistics */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Images</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Images</div>
            <div className="text-2xl font-bold">{stats.images.total}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Processed</div>
            <div className="text-2xl font-bold">{stats.images.recognized}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">With 1 person</div>
            <div className="text-2xl font-bold">{stats.images.with_1_person}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">With 2-3 persons</div>
            <div className="text-2xl font-bold">{stats.images.with_2_3_persons}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">With 4+ persons</div>
            <div className="text-2xl font-bold">{stats.images.with_4_plus_persons}</div>
          </div>
        </div>
      </Card>

      {/* Distribution by Threshold */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Distribution by Minimum Photos</h2>
        <div className="space-y-3">
          {stats.distribution.map((item) => (
            <div key={item.threshold} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="font-medium min-w-[100px]">≥ {item.threshold} photos</div>
                <div className="text-sm text-muted-foreground">
                  {item.count} players ({item.percentage}%)
                </div>
              </div>
              <div className="w-32 bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Histogram */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Distribution Histogram</h2>
        <div className="space-y-2">
          {stats.histogram.map((item) => (
            <div key={item.range} className="flex items-center gap-4">
              <div className="min-w-[100px] text-sm font-medium">{item.range}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 bg-primary rounded transition-all"
                    style={{
                      width: `${Math.min((item.count / Math.max(stats.players.total, 1)) * 100, 100)}%`,
                      minWidth: item.count > 0 ? "20px" : "0",
                    }}
                  />
                  <div className="text-sm text-muted-foreground">
                    {item.count} players ({item.total_faces} faces)
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Players */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Top Players by Photo Count</h2>
        <div className="space-y-2">
          {stats.top_players.map((player, index) => (
            <div key={player.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground w-8">#{index + 1}</div>
                <div className="font-medium">{player.name}</div>
              </div>
              <div className="text-sm font-medium">{player.count} photos</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Galleries Status */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Galleries Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.galleries.total}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Fully Verified</div>
            <div className="text-2xl font-bold text-green-600">{stats.galleries.fully_verified}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Fully Recognized</div>
            <div className="text-2xl font-bold text-blue-600">{stats.galleries.fully_recognized}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Partially</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.galleries.partially_verified}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Not Processed</div>
            <div className="text-2xl font-bold text-red-600">{stats.galleries.not_processed}</div>
          </div>
        </div>
      </Card>

      {/* Data Integrity */}
      <Card className="p-6 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
        <h2 className="text-xl font-semibold mb-4">Data Integrity</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Inconsistent verified faces (verified=true but confidence≠1)</span>
            <span className={stats.integrity.inconsistent_verified > 0 ? "text-red-600 font-medium" : ""}>
              {stats.integrity.inconsistent_verified}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Orphaned descriptors</span>
            <span className={stats.integrity.orphaned_descriptors > 0 ? "text-red-600 font-medium" : ""}>
              {stats.integrity.orphaned_descriptors}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Average unverified confidence</span>
            <span>{(stats.integrity.avg_unverified_confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Recognition threshold</span>
            <span>{(stats.confidence_threshold * 100).toFixed(0)}%</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
