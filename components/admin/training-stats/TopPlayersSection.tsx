import { Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Statistics } from "./types"

interface TopPlayersSectionProps {
  stats: Statistics
}

export function TopPlayersSection({ stats }: TopPlayersSectionProps) {
  if (stats.top_players.length === 0) return null

  const getTopPlayersColumns = (players: typeof stats.top_players, numColumns: number) => {
    const perColumn = Math.ceil(players.length / numColumns)
    const columns: (typeof players)[] = []
    for (let i = 0; i < numColumns; i++) {
      columns.push(players.slice(i * perColumn, (i + 1) * perColumn))
    }
    return columns
  }

  const topColumns = getTopPlayersColumns(stats.top_players, 3)

  return (
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
  )
}
