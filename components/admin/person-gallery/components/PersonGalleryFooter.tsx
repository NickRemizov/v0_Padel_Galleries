"use client"

interface PersonGalleryFooterProps {
  photosCount: number
  unverifiedCount: number
}

export function PersonGalleryFooter({ photosCount, unverifiedCount }: PersonGalleryFooterProps) {
  return (
    <div className="flex items-center justify-end gap-4 pt-4 border-t">
      {unverifiedCount > 0 && (
        <p className="text-sm text-blue-600 font-medium">
          Неподтверждённых: {unverifiedCount}
        </p>
      )}
      <p className="text-sm text-muted-foreground">Всего фотографий: {photosCount}</p>
    </div>
  )
}
