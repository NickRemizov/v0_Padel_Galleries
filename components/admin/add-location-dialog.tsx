"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, MapPin, Globe, Link2 } from "lucide-react"
import { addLocationAction, getCitiesAction } from "@/app/admin/actions/entities"

interface City {
  id: string
  name: string
  slug: string
}

export function AddLocationDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cities, setCities] = useState<City[]>([])
  const [formData, setFormData] = useState({
    name: "",
    city_id: "none",
    address: "",
    maps_url: "",
    website_url: "",
  })

  useEffect(() => {
    async function loadCities() {
      const result = await getCitiesAction(true) // active_only=true
      if (result.success && result.data) {
        setCities(result.data)
      }
    }
    if (open) loadCities()
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    
    const result = await addLocationAction({
      name: formData.name,
      city_id: formData.city_id === "none" ? undefined : formData.city_id,
      address: formData.address || undefined,
      maps_url: formData.maps_url || undefined,
      website_url: formData.website_url || undefined,
    })
    
    setLoading(false)

    if (result.success) {
      setOpen(false)
      setFormData({ name: "", city_id: "none", address: "", maps_url: "", website_url: "" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Добавить площадку
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Добавить площадку</DialogTitle>
            <DialogDescription>Введите информацию о площадке</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Padel Valencia Indoor"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="city">Город</Label>
              <Select
                value={formData.city_id}
                onValueChange={(value) => setFormData({ ...formData, city_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите город" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указан</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Адрес
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="C/ de la Innovación, 10, Valencia"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maps_url" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Ссылка на карту
              </Label>
              <Input
                id="maps_url"
                type="url"
                value={formData.maps_url}
                onChange={(e) => setFormData({ ...formData, maps_url: e.target.value })}
                placeholder="https://maps.google.com/..."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="website_url" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Сайт
              </Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://padelvalencia.com"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading ? "Добавление..." : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
