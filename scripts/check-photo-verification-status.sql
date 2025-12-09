-- Проверка статуса верификации фотографий в галереях
-- ОБНОВЛЕНО: теперь не требует параметров, показывает ВСЕ галереи

-- 1. Статистика по всем галереям
SELECT 
    g.id AS gallery_id,
    g.title AS gallery_title,
    COUNT(DISTINCT gi.id) AS total_photos,
    COUNT(DISTINCT CASE WHEN pf.id IS NULL THEN gi.id END) AS photos_without_faces,
    COUNT(DISTINCT CASE 
        WHEN pf.id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM photo_faces pf2 
            WHERE pf2.photo_id = gi.id 
            AND (pf2.verified = false OR pf2.person_id IS NULL)
        )
        THEN gi.id 
    END) AS photos_fully_verified,
    COUNT(DISTINCT CASE 
        WHEN pf.id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM photo_faces pf2 
            WHERE pf2.photo_id = gi.id 
            AND pf2.verified = true 
            AND pf2.person_id IS NOT NULL
        )
        AND EXISTS (
            SELECT 1 FROM photo_faces pf3 
            WHERE pf3.photo_id = gi.id 
            AND (pf3.verified = false OR pf3.person_id IS NULL)
        )
        THEN gi.id 
    END) AS photos_partially_verified,
    COUNT(DISTINCT CASE 
        WHEN pf.id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM photo_faces pf2 
            WHERE pf2.photo_id = gi.id 
            AND pf2.verified = true 
            AND pf2.person_id IS NOT NULL
        )
        THEN gi.id 
    END) AS photos_not_verified,
    -- Добавлен процент верификации
    ROUND(
        100.0 * COUNT(DISTINCT CASE 
            WHEN pf.id IS NOT NULL 
            AND NOT EXISTS (
                SELECT 1 FROM photo_faces pf2 
                WHERE pf2.photo_id = gi.id 
                AND (pf2.verified = false OR pf2.person_id IS NULL)
            )
            THEN gi.id 
        END) / NULLIF(COUNT(DISTINCT gi.id), 0),
        2
    ) AS verification_percentage
FROM galleries g
LEFT JOIN gallery_images gi ON gi.gallery_id = g.id
LEFT JOIN photo_faces pf ON pf.photo_id = gi.id
GROUP BY g.id, g.title
ORDER BY g.title;

-- 2. Детальная информация по фото с частичной верификацией
SELECT 
    gi.id AS photo_id,
    g.title AS gallery_title,
    gi.filename,
    COUNT(pf.id) AS total_faces,
    COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) AS verified_faces,
    COUNT(CASE WHEN pf.verified = false OR pf.person_id IS NULL THEN 1 END) AS unverified_faces,
    -- Добавлены имена верифицированных людей
    STRING_AGG(
        CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL 
        THEN p.name ELSE NULL END, 
        ', '
    ) AS verified_people
FROM gallery_images gi
JOIN galleries g ON g.id = gi.gallery_id
LEFT JOIN photo_faces pf ON pf.photo_id = gi.id
LEFT JOIN people p ON p.id = pf.person_id
WHERE pf.id IS NOT NULL
GROUP BY gi.id, g.title, gi.filename
HAVING 
    COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) > 0
    AND COUNT(CASE WHEN pf.verified = false OR pf.person_id IS NULL THEN 1 END) > 0
ORDER BY g.title, gi.filename;

-- 3. Общая статистика по всей БД
SELECT 
    COUNT(DISTINCT gi.id) AS total_photos_in_db,
    COUNT(DISTINCT CASE WHEN pf.id IS NULL THEN gi.id END) AS photos_without_faces,
    COUNT(DISTINCT CASE WHEN pf.id IS NOT NULL THEN gi.id END) AS photos_with_faces,
    COUNT(DISTINCT CASE 
        WHEN pf.id IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM photo_faces pf2 
            WHERE pf2.photo_id = gi.id 
            AND (pf2.verified = false OR pf2.person_id IS NULL)
        )
        THEN gi.id 
    END) AS photos_fully_verified_all_faces,
    ROUND(
        100.0 * COUNT(DISTINCT CASE 
            WHEN pf.id IS NOT NULL 
            AND NOT EXISTS (
                SELECT 1 FROM photo_faces pf2 
                WHERE pf2.photo_id = gi.id 
                AND (pf2.verified = false OR pf2.person_id IS NULL)
            )
            THEN gi.id 
        END) / NULLIF(COUNT(DISTINCT CASE WHEN pf.id IS NOT NULL THEN gi.id END), 0),
        2
    ) AS verification_percentage
FROM gallery_images gi
LEFT JOIN photo_faces pf ON pf.photo_id = gi.id;
