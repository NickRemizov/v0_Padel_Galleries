"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { MapPin, Globe, Link2 } from "lucide-react"
import { updateLocationAction } from "@/app/admin/actions/entities"
import { createClient } from "@/lib/supabase/client"
import type { Location } from "@/lib/types"

interface City {
  id: string
  name: string
  slug: string
}

interface EditLocationDialogProps {
  location: Location
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditLocationDialog({ location, open, onOpenChange }: EditLocationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cities, setCities] = useState<City[]>([])
  const [formData, setFormData] = useState({
    name: location.name,
    city_id: location.city_id || "",
    address: location.address || "",
    maps_url: location.maps_url || "",
    website_url: location.website_url || "",
  })

  useEffect(() => {
    async function loadCities() {
      const supabase = createClient()
      const { data } = await supabase
        .from("cities")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name")
      if (data) setCities(data)
    }
    if (open) loadCities()
  }, [open])

  useEffect(() => {
    setFormData({
      name: location.name,
      city_id: location.city_id || "",
      address: location.address || "",
      maps_url: location.maps_url || "",
      website_url: location.website_url || "",
    })
  }, [location])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const result = await updateLocationAction(location.id, {
      name: formData.name,
      city_id: formData.city_id || null,
      address: formData.address || null,
      maps_url: formData.maps_url || null,
      website_url: formData.website_url || null,
    })

    if (result?.error) {
      alert(result.error)
    } else {
      onOpenChange(false)
    }

    setIsSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Редактировать площадку</DialogTitle>
          <DialogDescription>Измените информацию о площадке</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  <SelectItem value="">Не указан</SelectItem>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.name}>
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
