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
    &lt;Card&gt;
      &lt;CardHeader&gt;
        &lt;CardTitle&gt;Параметры распознавания&lt;/CardTitle&gt;
        &lt;CardDescription&gt;Настройте пороги confidence и вес контекста для распознавания лиц&lt;/CardDescription&gt;
      &lt;/CardHeader&gt;
      &lt;CardContent className="space-y-6"&gt;
        {/* Auto Avatar Section */}
        &lt;div className="space-y-4"&gt;
          &lt;h4 className="text-sm font-medium flex items-center gap-2"&gt;
            &lt;UserCircle className="h-4 w-4" /&gt;
            Автоматические аватары
          &lt;/h4&gt;
          &lt;div className="flex items-center justify-between rounded-lg border p-4"&gt;
            &lt;div className="space-y-0.5"&gt;
              &lt;Label className="text-base"&gt;Автоматически присваивать аватар при создании игрока&lt;/Label&gt;
              &lt;p className="text-sm text-muted-foreground"&gt;
                При создании нового игрока аватар будет сгенерирован автоматически из фото с лицом
              &lt;/p&gt;
            &lt;/div&gt;
            &lt;Switch
              checked={localConfig.auto_avatar_on_create === true}
              onCheckedChange={(checked) =&gt;
                setLocalConfig({
                  ...localConfig,
                  auto_avatar_on_create: checked,
                })
              }
            /&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Quality Filtering section */}
        &lt;div className="space-y-4 pt-4 border-t"&gt;
          &lt;h4 className="text-sm font-medium"&gt;Фильтрация качества&lt;/h4&gt;
          &lt;p className="text-xs text-muted-foreground"&gt;
            Отсеивайте лица низкого качества при детекции и распознавании
          &lt;/p&gt;

          &lt;div className="space-y-3"&gt;
            &lt;div className="space-y-2"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Минимальный det_score&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {(localConfig.quality_filters?.min_detection_score || 0.7).toFixed(2)}
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider
                value={[localConfig.quality_filters?.min_detection_score || 0.7]}
                onValueChange={([value]) =&gt;
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
              /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;
                0.50 - очень мягкий | 0.70 - рекомендуемый | 0.90 - строгий
              &lt;/p&gt;
            &lt;/div&gt;

            &lt;div className="space-y-2"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Минимальный размер лица (px)&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {Math.round(localConfig.quality_filters?.min_face_size || 80)}
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider
                value={[localConfig.quality_filters?.min_face_size || 80]}
                onValueChange={([value]) =&gt;
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
                step={5}
              /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;
                30px - очень мелкие лица | 80px - рекомендуемый | 200px - только крупные
              &lt;/p&gt;
            &lt;/div&gt;

            &lt;div className="space-y-2"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Минимальная резкость (blur score)&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {Math.round(localConfig.quality_filters?.min_blur_score || 80)}
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider
                value={[localConfig.quality_filters?.min_blur_score || 80]}
                onValueChange={([value]) =&gt;
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
                step={5}
              /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;
                10 - размытые лица | 60-80 - рекомендуемый | 150 - только четкие
              &lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Confidence Thresholds */}
        &lt;div className="space-y-4 pt-4 border-t"&gt;
          &lt;h4 className="text-sm font-medium"&gt;Пороги уверенности распознавания&lt;/h4&gt;

          &lt;div className="space-y-3"&gt;
            &lt;div className="space-y-2"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Минимальная уверенность для сохранения person_id&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {(localConfig.confidence_thresholds.high_data * 100).toFixed(0)}%
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider
                value={[localConfig.confidence_thresholds.high_data]}
                onValueChange={([value]) =&gt;
                  setLocalConfig({
                    ...localConfig,
                    confidence_thresholds: { ...localConfig.confidence_thresholds, high_data: value },
                  })
                }
                min={0.3}
                max={0.9}
                step={0.05}
              /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;
                30% - очень мягкий | 60% - рекомендуемый | 80% - строгий
              &lt;/p&gt;
            &lt;/div&gt;

            &lt;div className="space-y-2 opacity-50"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Средняя уверенность (не используется)&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {(localConfig.confidence_thresholds.medium_data * 100).toFixed(0)}%
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider
                disabled
                value={[localConfig.confidence_thresholds.medium_data]}
                min={0.3}
                max={0.9}
                step={0.05}
              /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;Будет использоваться с HDBSCAN clustering&lt;/p&gt;
            &lt;/div&gt;

            &lt;div className="space-y-2 opacity-50"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;Label className="text-sm"&gt;Низкая уверенность (не используется)&lt;/Label&gt;
                &lt;span className="text-sm font-medium"&gt;
                  {(localConfig.confidence_thresholds.low_data * 100).toFixed(0)}%
                &lt;/span&gt;
              &lt;/div&gt;
              &lt;Slider disabled value={[localConfig.confidence_thresholds.low_data]} min={0.3} max={0.9} step={0.05} /&gt;
              &lt;p className="text-xs text-muted-foreground"&gt;Будет использоваться с HDBSCAN clustering&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Context Weight */}
        &lt;div className="space-y-4 pt-4 border-t opacity-50"&gt;
          &lt;h4 className="text-sm font-medium"&gt;Контекстное распознавание (не используется)&lt;/h4&gt;
          &lt;p className="text-xs text-muted-foreground"&gt;
            Вес контекстной информации (галерея, дата) при распознавании
          &lt;/p&gt;

          &lt;div className="space-y-2"&gt;
            &lt;div className="flex items-center justify-between"&gt;
              &lt;Label className="text-sm"&gt;Context Weight&lt;/Label&gt;
              &lt;span className="text-sm font-medium"&gt;{localConfig.context_weight.toFixed(2)}&lt;/span&gt;
            &lt;/div&gt;
            &lt;Slider disabled value={[localConfig.context_weight]} min={0.0} max={0.5} step={0.05} /&gt;
            &lt;p className="text-xs text-muted-foreground"&gt;
              0.00 - контекст не учитывается | 0.10 - минимальное влияние | 0.50 - максимальное влияние
            &lt;/p&gt;
            &lt;p className="text-xs text-muted-foreground"&gt;
              Будет использоваться с HDBSCAN для учёта совместных появлений людей
            &lt;/p&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Кнопки */}
        &lt;div className="flex gap-2"&gt;
          &lt;Button onClick={onSave} disabled={fastapiError}&gt;
            Сохранить настройки
          &lt;/Button&gt;
          &lt;Button onClick={onReset} variant="outline"&gt;
            Сбросить
          &lt;/Button&gt;
        &lt;/div&gt;
      &lt;/CardContent&gt;
    &lt;/Card&gt;
  )
}
