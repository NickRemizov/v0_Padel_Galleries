"use client"

import { useState } from "react"
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
import { Plus } from "lucide-react"
import { addPhotographerAction } from "@/app/admin/actions"

export function AddPhotographerDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    const result = await addPhotographerAction(formData)
    setLoading(false)

    if (result.success) {
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Добавить фотографа
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Добавить фотографа</DialogTitle>
            <DialogDescription>Введите имя фотографа</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" name="name" required />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Добавление..." : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
