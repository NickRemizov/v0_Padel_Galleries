import { TrainingStatsCard } from "@/components/admin/training-stats-card"

export default function StatisticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Статистика</h2>
        <p className="text-muted-foreground">
          Статистика распознавания лиц и обработки фотографий
        </p>
      </div>

      <TrainingStatsCard />
    </div>
  )
}
