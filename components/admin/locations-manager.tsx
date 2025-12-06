import { createClient } from "@/lib/supabase/server"
import { AddLocationDialog } from "@/components/admin/add-location-dialog"
import { LocationList } from "@/components/admin/location-list"

export async function LocationsManager() {
  const supabase = await createClient()

  const { data: locations } = await supabase.from("locations").select("*").order("name")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Управление местами съёмки</h2>
          <p className="text-sm text-muted-foreground">Добавляйте, редактируйте и удаляйте места съёмки</p>
        </div>
        <AddLocationDialog />
      </div>
      <LocationList locations={locations} />
    </div>
  )
}
