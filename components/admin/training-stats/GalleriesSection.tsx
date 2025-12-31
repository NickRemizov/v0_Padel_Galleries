import { Images } from "lucide-react"
import type { Statistics } from "./types"

interface GalleriesSectionProps {
  stats: Statistics
}

export function GalleriesSection({ stats }: GalleriesSectionProps) {
  if (stats.galleries.total === 0) return null

  return (
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

        {/* 5. Не обработаны (оранжевый) */}
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
  )
}
