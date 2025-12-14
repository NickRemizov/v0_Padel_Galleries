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
import { toast } from "sonner"

export function AddPhotographerDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Введите имя фотографа")
      return
    }
    
    setLoading(true)
    const result = await addPhotographerAction(name.trim())
    setLoading(false)

    if (result.success) {
      toast.success("Фотограф добавлен")
      setName("")
      setOpen(false)
    } else {
      toast.error(result.error || "Ошибка добавления")
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
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Добавить фотографа</DialogTitle>
            <DialogDescription>Введите имя фотографа</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Имя</Label>
              <Input 
                id="name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
              />
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
