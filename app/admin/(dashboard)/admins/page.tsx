"use client"

import { useEffect, useState } from "react"
import { useAdminAuth } from "@/components/admin/admin-auth-provider"
import { adminFetch, hasMinRole, type AdminUser } from "@/lib/admin-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Plus, Pencil, Trash2, Shield, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface Admin {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: AdminUser["role"]
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  global_admin: "Глобальный админ",
  local_admin: "Локальный админ",
  moderator: "Модератор",
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-500",
  global_admin: "bg-blue-500",
  local_admin: "bg-green-500",
  moderator: "bg-gray-500",
}

export default function AdminsPage() {
  const { admin: currentAdmin } = useAdminAuth()
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)
  const [saving, setSaving] = useState(false)

  // Form states
  const [formEmail, setFormEmail] = useState("")
  const [formName, setFormName] = useState("")
  const [formRole, setFormRole] = useState<AdminUser["role"]>("moderator")
  const [formActive, setFormActive] = useState(true)

  // Check access
  useEffect(() => {
    if (currentAdmin && !hasMinRole(currentAdmin, "global_admin")) {
      router.push("/admin")
    }
  }, [currentAdmin, router])

  // Load admins
  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    try {
      setLoading(true)
      const response = await adminFetch("/api/admin/admins")
      if (!response.ok) {
        throw new Error("Failed to load admins")
      }
      const data = await response.json()
      setAdmins(data.admins)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading admins")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    try {
      setSaving(true)
      const response = await adminFetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          name: formName || null,
          role: formRole,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || "Failed to create admin")
      }

      setShowAddDialog(false)
      resetForm()
      loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating admin")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedAdmin) return

    try {
      setSaving(true)
      const response = await adminFetch(`/api/admin/admins/${selectedAdmin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName || null,
          role: formRole,
          is_active: formActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || "Failed to update admin")
      }

      setShowEditDialog(false)
      resetForm()
      loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating admin")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedAdmin) return

    try {
      setSaving(true)
      const response = await adminFetch(`/api/admin/admins/${selectedAdmin.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || "Failed to delete admin")
      }

      setShowDeleteDialog(false)
      setSelectedAdmin(null)
      loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deleting admin")
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (admin: Admin) => {
    setSelectedAdmin(admin)
    setFormName(admin.name || "")
    setFormRole(admin.role)
    setFormActive(admin.is_active)
    setShowEditDialog(true)
  }

  const openDeleteDialog = (admin: Admin) => {
    setSelectedAdmin(admin)
    setShowDeleteDialog(true)
  }

  const resetForm = () => {
    setFormEmail("")
    setFormName("")
    setFormRole("moderator")
    setFormActive(true)
    setSelectedAdmin(null)
  }

  const canEditAdmin = (admin: Admin) => {
    if (!currentAdmin) return false
    // Owner can edit anyone except themselves (role/status)
    if (currentAdmin.role === "owner") {
      return admin.id !== currentAdmin.id || admin.role !== "owner"
    }
    // Global admin can edit local_admin and moderator
    if (currentAdmin.role === "global_admin") {
      return admin.role === "local_admin" || admin.role === "moderator"
    }
    return false
  }

  const canDeleteAdmin = (admin: Admin) => {
    if (!currentAdmin) return false
    // Only owner can delete, and not themselves or other owners
    return currentAdmin.role === "owner" && admin.role !== "owner" && admin.id !== currentAdmin.id
  }

  if (!currentAdmin || !hasMinRole(currentAdmin, "global_admin")) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Администраторы</h1>
          <p className="text-muted-foreground">Управление доступом к админ-панели</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Добавить
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-4" onClick={() => setError(null)}>
            Закрыть
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Список администраторов</CardTitle>
          <CardDescription>
            {admins.length} администратор(ов)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Последний вход</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={admin.avatar_url || undefined} />
                          <AvatarFallback>
                            {(admin.name || admin.email).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{admin.name || admin.email}</div>
                          <div className="text-sm text-muted-foreground">{admin.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[admin.role]}>
                        <Shield className="mr-1 h-3 w-3" />
                        {ROLE_LABELS[admin.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.is_active ? "default" : "secondary"}>
                        {admin.is_active ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {admin.last_login_at
                        ? new Date(admin.last_login_at).toLocaleString("ru-RU")
                        : "Никогда"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canEditAdmin(admin) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(admin)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteAdmin(admin) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => openDeleteDialog(admin)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить администратора</DialogTitle>
            <DialogDescription>
              Введите email Google-аккаунта нового администратора
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@gmail.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Имя (опционально)</Label>
              <Input
                id="name"
                placeholder="Имя Фамилия"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Роль</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as AdminUser["role"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentAdmin?.role === "owner" && (
                    <SelectItem value="global_admin">Глобальный админ</SelectItem>
                  )}
                  <SelectItem value="local_admin">Локальный админ</SelectItem>
                  <SelectItem value="moderator">Модератор</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleAdd} disabled={!formEmail || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать администратора</DialogTitle>
            <DialogDescription>
              {selectedAdmin?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Имя</Label>
              <Input
                id="edit-name"
                placeholder="Имя Фамилия"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            {selectedAdmin?.role !== "owner" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Роль</Label>
                  <Select value={formRole} onValueChange={(v) => setFormRole(v as AdminUser["role"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentAdmin?.role === "owner" && (
                        <SelectItem value="global_admin">Глобальный админ</SelectItem>
                      )}
                      <SelectItem value="local_admin">Локальный админ</SelectItem>
                      <SelectItem value="moderator">Модератор</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-active">Активен</Label>
                  <Switch
                    id="edit-active"
                    checked={formActive}
                    onCheckedChange={setFormActive}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить администратора?</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить {selectedAdmin?.email}? Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
