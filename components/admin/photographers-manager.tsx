import { createClient } from "@/lib/supabase/server"
import { AddPhotographerDialog } from "@/components/admin/add-photographer-dialog"
import { PhotographerList } from "@/components/admin/photographer-list"

export async function PhotographersManager() {
  const supabase = await createClient()

  const { data: photographers } = await supabase.from("photographers").select("*").order("name")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Управление фотографами</h2>
          <p className="text-sm text-muted-foreground">Добавляйте, редактируйте и удаляйте фотографов</p>
        </div>
        <AddPhotographerDialog />
      </div>

      <PhotographerList photographers={photographers || []} />
    </div>
  )
}
