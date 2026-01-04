"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Trash2,
  Check,
  Camera,
  Mail,
  MessageCircle,
  Facebook,
  Instagram,
  ExternalLink,
} from "lucide-react"
import type { DuplicatePerson } from "./types"

interface PersonCardProps {
  person: DuplicatePerson
  isSelected: boolean
  processing: boolean
  onSelect: () => void
  onDelete: () => void
}

export function PersonCard({
  person,
  isSelected,
  processing,
  onSelect,
  onDelete,
}: PersonCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={person.avatar_url || undefined} />
            <AvatarFallback>
              {person.real_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{person.real_name}</span>
              {isSelected && (
                <Badge variant="default" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Оставить
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Camera className="h-3 w-3" />
              <span>{person.photo_count} фото</span>
            </div>

            <div className="mt-2 space-y-1 text-xs">
              {person.gmail && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{person.gmail}</span>
                </div>
              )}
              {person.telegram_username && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MessageCircle className="h-3 w-3" />
                  <span className="truncate">@{person.telegram_username}</span>
                </div>
              )}
              {person.telegram_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  <a
                    href={person.telegram_profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Telegram
                  </a>
                </div>
              )}
              {person.facebook_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Facebook className="h-3 w-3" />
                  <a
                    href={person.facebook_profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Facebook
                  </a>
                </div>
              )}
              {person.instagram_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Instagram className="h-3 w-3" />
                  <a
                    href={person.instagram_profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Instagram
                  </a>
                </div>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={processing}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
