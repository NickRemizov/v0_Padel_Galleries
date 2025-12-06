import { AddPhotographerDialog } from "@/components/admin/add-photographer-dialog"
import { PhotographerList } from "@/components/admin/photographer-list"
import { getPhotographersAction } from "@/app/admin/actions/photographers"

export async function PhotographersManager() {
  const result = await getPhotographersAction()
  const photographers = result.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Управление фотографами</h2>
          <p className="text-sm text-muted-foreground">Добавляйте, редактируйте и удаляйте фотографов</p>
        </div>
        <AddPhotographerDialog />
      </div>

      <PhotographerList photographers={photographers} />
    </div>
  )
}
