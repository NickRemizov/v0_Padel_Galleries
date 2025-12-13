"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  getCitiesAction,
  addCityAction,
  updateCityAction,
  toggleCityActiveAction,
  deleteCityAction,
} from "@/app/admin/actions/entities"

interface City {
  id: string
  name: string
  slug: string
  country: string
  is_active: boolean
  created_at: string
}

export function CitiesManager() {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCity, setEditingCity] = useState<City | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    country: "Spain",
    is_active: true,
  })

  useEffect(() => {
    loadCities()
  }, [])

  async function loadCities() {
    setLoading(true)
    const result = await getCitiesAction()
    if (result.success) {
      setCities(result.data || [])
    } else {
      console.error("Error loading cities:", result.error)
      toast.error("Ошибка загрузки городов")
    }
    setLoading(false)
  }

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  function handleNameChange(name: string) {
    setFormData({
      ...formData,
      name,
      slug: editingCity ? formData.slug : generateSlug(name),
    })
  }

  function openAddDialog() {
    setEditingCity(null)
    setFormData({
      name: "",
      slug: "",
      country: "Spain",
      is_active: true,
    })
    setDialogOpen(true)
  }

  function openEditDialog(city: City) {
    setEditingCity(city)
    setFormData({
      name: city.name,
      slug: city.slug,
      country: city.country,
      is_active: city.is_active,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error("Заполните название и slug")
      return
    }

    setSaving(true)

    try {
      let result
      if (editingCity) {
        result = await updateCityAction(editingCity.id, {
          name: formData.name,
          slug: formData.slug,
          country: formData.country,
          is_active: formData.is_active,
        })
      } else {
        result = await addCityAction({
          name: formData.name,
          slug: formData.slug,
          country: formData.country,
          is_active: formData.is_active,
        })
      }

      if (result.success) {
        toast.success(editingCity ? "Город обновлён" : "Город добавлен")
        setDialogOpen(false)
        loadCities()
      } else {
        if (result.code === "23505") {
          toast.error("Город с таким slug уже существует")
        } else {
          toast.error(result.error || "Ошибка сохранения")
        }
      }
    } catch (error) {
      console.error("Error saving city:", error)
      toast.error("Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(city: City) {
    if (!confirm(`Удалить город "${city.name}"?`)) return

    const result = await deleteCityAction(city.id)
    
    if (result.success) {
      toast.success("Город удалён")
      loadCities()
    } else {
      if (result.code === "23503") {
        toast.error("Невозможно удалить: есть связанные площадки")
      } else {
        toast.error(result.error || "Ошибка удаления")
      }
    }
  }

  async function toggleActive(city: City) {
    const result = await toggleCityActiveAction(city.id)
    
    if (result.success) {
      loadCities()
    } else {
      toast.error(result.error || "Ошибка обновления")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Города</h3>
          <p className="text-sm text-muted-foreground">
            Управление городами для фильтрации контента
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить город
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCity ? "Редактировать город" : "Новый город"}
              </DialogTitle>
              <DialogDescription>
                {editingCity
                  ? "Измените данные города"
                  : "Добавьте новый город в систему"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Valencia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  placeholder="valencia"
                />
                <p className="text-xs text-muted-foreground">
                  Используется в URL: /valencia/players
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Страна</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                  placeholder="Spain"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Активен</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Отмена
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCity ? "Сохранить" : "Добавить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Страна</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="w-[100px]">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cities.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Нет городов
              </TableCell>
            </TableRow>
          ) : (
            cities.map((city) => (
              <TableRow key={city.id}>
                <TableCell className="font-medium">{city.name}</TableCell>
                <TableCell className="text-muted-foreground">{city.slug}</TableCell>
                <TableCell>{city.country}</TableCell>
                <TableCell>
                  <Switch
                    checked={city.is_active}
                    onCheckedChange={() => toggleActive(city)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(city)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(city)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
