"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { UserCircle } from "lucide-react"
import type { Config } from "../types"

interface ConfigurationCardProps {
  localConfig: Config
  setLocalConfig: (config: Config) => void
  fastapiError: boolean
  onSave: () => void
  onReset: () => void
}

export function ConfigurationCard({
  localConfig,
  setLocalConfig,
  fastapiError,
  onSave,
  onReset,
}: ConfigurationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Параметры распознавания</CardTitle>
        <CardDescription>Настройте пороги confidence и вес контекста для распознавания лиц</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto Avatar Section */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <UserCircle className="h-4 w-4" />
            Автоматические аватары
          </h4>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Автоматически присваивать аватар при создании игрока</Label>
              <p className="text-sm text-muted-foreground">
                При создании нового игрока аватар будет сгенерирован автоматически из фото с лицом
              </p>
            </div>
            <Switch
              checked={localConfig.auto_avatar_on_create ?? true}
              onCheckedChange={(checked) =>
                setLocalConfig({
                  ...localConfig,
                  auto_avatar_on_create: checked,
                })
              }
            />
          </div>
        </div>

        {/* Quality Filtering section */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium">Фильтрация качества</h4>
          <p className="text-xs text-muted-foreground">
            Отсеивайте лица низкого качества при детекции и распознавании
          </p>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Минимальный det_score</Label>
                <span className="text-sm font-medium">
                  {(localConfig.quality_filters?.min_detection_score || 0.7).toFixed(2)}
                </span>
              </div>
              <Slider
                value={[localConfig.quality_filters?.min_detection_score || 0.7]}
                onValueChange={([value]) =>
                  setLocalConfig({
                    ...localConfig,
                    quality_filters: {
                      ...localConfig.quality_filters!,
                      min_detection_score: value,
                    },
                  })
                }
                min={0.5}
                max={0.9}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">
                0.50 - очень мягкий | 0.70 - рекомендуемый | 0.90 - строгий
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Минимальный размер лица (px)</Label>
                <span className="text-sm font-medium">
                  {Math.round(localConfig.quality_filters?.min_face_size || 80)}
                </span>
              </div>
              <Slider
                value={[localConfig.quality_filters?.min_face_size || 80]}
                onValueChange={([value]) =>
                  setLocalConfig({
                    ...localConfig,
                    quality_filters: {
                      ...localConfig.quality_filters!,
                      min_face_size: value,
                    },
                  })
                }
                min={30}
                max={200}
                step={10}
              />
              <p className="text-xs text-muted-foreground">
                30px - очень мелкие лица | 80px - рекомендуемый | 200px - только крупные
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Минимальная резкость (blur score)</Label>
                <span className="text-sm font-medium">
                  {Math.round(localConfig.quality_filters?.min_blur_score || 80)}
                </span>
              </div>
              <Slider
                value={[localConfig.quality_filters?.min_blur_score || 80]}
                onValueChange={([value]) =>
                  setLocalConfig({
                    ...localConfig,
                    quality_filters: {
                      ...localConfig.quality_filters!,
                      min_blur_score: value,
                    },
                  })
                }
                min={10}
                max={150}
                step={10}
              />
              <p className="text-xs text-muted-foreground">
                10 - размытые лица | 60-80 - рекомендуемый | 150 - только четкие
              </p>
            </div>
          </div>
        </div>

        {/* Confidence Thresholds */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium">Пороги уверенности распознавания</h4>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Минимальная уверенность для сохранения person_id</Label>
                <span className="text-sm font-medium">
                  {(localConfig.confidence_thresholds.high_data * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[localConfig.confidence_thresholds.high_data]}
                onValueChange={([value]) =>
                  setLocalConfig({
                    ...localConfig,
                    confidence_thresholds: { ...localConfig.confidence_thresholds, high_data: value },
                  })
                }
                min={0.3}
                max={0.9}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">
                30% - очень мягкий | 60% - рекомендуемый | 80% - строгий
              </p>
            </div>

            <div className="space-y-2 opacity-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Средняя уверенность (не используется)</Label>
                <span className="text-sm font-medium">
                  {(localConfig.confidence_thresholds.medium_data * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                disabled
                value={[localConfig.confidence_thresholds.medium_data]}
                min={0.3}
                max={0.9}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">Будет использоваться с HDBSCAN clustering</p>
            </div>

            <div className="space-y-2 opacity-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Низкая уверенность (не используется)</Label>
                <span className="text-sm font-medium">
                  {(localConfig.confidence_thresholds.low_data * 100).toFixed(0)}%
                </span>
              </div>
              <Slider disabled value={[localConfig.confidence_thresholds.low_data]} min={0.3} max={0.9} step={0.05} />
              <p className="text-xs text-muted-foreground">Будет использоваться с HDBSCAN clustering</p>
            </div>
          </div>
        </div>

        {/* Context Weight */}
        <div className="space-y-4 pt-4 border-t opacity-50">
          <h4 className="text-sm font-medium">Контекстное распознавание (не используется)</h4>
          <p className="text-xs text-muted-foreground">
            Вес контекстной информации (галерея, дата) при распознавании
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Context Weight</Label>
              <span className="text-sm font-medium">{localConfig.context_weight.toFixed(2)}</span>
            </div>
            <Slider disabled value={[localConfig.context_weight]} min={0.0} max={0.5} step={0.05} />
            <p className="text-xs text-muted-foreground">
              0.00 - контекст не учитывается | 0.10 - минимальное влияние | 0.50 - максимальное влияние
            </p>
            <p className="text-xs text-muted-foreground">
              Будет использоваться с HDBSCAN для учёта совместных появлений людей
            </p>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={fastapiError}>
            Сохранить настройки
          </Button>
          <Button onClick={onReset} variant="outline">
            Сбросить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
