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
          \u041d\u0435\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0445: {unverifiedCount}
        </p>
      )}
      <p className="text-sm text-muted-foreground">\u0412\u0441\u0435\u0433\u043e \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0439: {photosCount}</p>
    </div>
  )
}
