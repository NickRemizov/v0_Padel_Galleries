import { getLocationsAction } from "@/app/admin/actions/entities"
import { AddLocationDialog } from "@/components/admin/add-location-dialog"
import { LocationList } from "@/components/admin/location-list"

export async function LocationsManager() {
  const result = await getLocationsAction()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Локации</h2>
        <AddLocationDialog />
      </div>
      <LocationList locations={result.success ? result.data : []} />
    </div>
  )
}
