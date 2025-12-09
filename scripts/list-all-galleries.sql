-- Список всех галерей с ID для использования в других скриптах
-- Запуск: просто выполни этот скрипт, скопируй нужный gallery_id

SELECT 
    g.id AS gallery_id,
    g.title AS gallery_title,
    g.date AS gallery_date,
    COUNT(DISTINCT gi.id) AS total_photos,
    g.created_at
FROM galleries g
LEFT JOIN gallery_images gi ON gi.gallery_id = g.id
GROUP BY g.id, g.title, g.date, g.created_at
ORDER BY g.date DESC;
