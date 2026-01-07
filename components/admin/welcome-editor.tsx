"use client"

import { useEffect, useState } from "react"
import { adminFetch } from "@/lib/admin-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, RotateCcw, Eye } from "lucide-react"
import ReactMarkdown from "react-markdown"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface WelcomeContent {
  key: string
  value: {
    version: number
    title: string
    content: string
  }
  updated_at: string | null
}

export function WelcomeEditor() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [version, setVersion] = useState(1)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    loadContent()
  }, [])

  async function loadContent() {
    try {
      setLoading(true)
      const response = await adminFetch("/api/admin/content/welcome")
      if (!response.ok) throw new Error("Failed to load")

      const data: WelcomeContent = await response.json()
      setTitle(data.value?.title || "")
      setContent(data.value?.content || "")
      setVersion(data.value?.version || 1)
      setUpdatedAt(data.updated_at)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading content")
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const response = await adminFetch("/api/admin/content/welcome", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, version }),
      })

      if (!response.ok) throw new Error("Failed to save")

      setSuccess("Saved!")
      setTimeout(() => setSuccess(null), 3000)

      // Reload to get updated_at
      loadContent()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving")
    } finally {
      setSaving(false)
    }
  }

  async function handleResetSeen() {
    if (!confirm("Show welcome message to all users again?")) {
      return
    }

    try {
      setResetting(true)
      setError(null)

      const response = await adminFetch("/api/admin/content/welcome/reset-seen", {
        method: "POST",
      })

      if (!response.ok) throw new Error("Failed to reset")

      const data = await response.json()
      setSuccess(`Reset for ${data.reset_count} users`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error resetting")
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Welcome Message</CardTitle>
          <CardDescription>
            Message shown to users on first login. Version: {version}
            {updatedAt && ` | Updated: ${new Date(updatedAt).toLocaleString("ru-RU")}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600">
              {success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Welcome!"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="## Welcome text..."
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <div className="flex items-center gap-2">
              <Input
                id="version"
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                Increment to show message again to all users
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              variant="outline"
              onClick={handleResetSeen}
              disabled={resetting}
            >
              {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Reset all users
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title || "Welcome!"}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
