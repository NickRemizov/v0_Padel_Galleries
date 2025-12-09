-- Поиск проблемных фотографий для исправления

-- 1. Фото где есть лица без person_id (нераспознанные)
SELECT 
    gi.id AS photo_id,
    g.title AS gallery_title,
    gi.filename,
    gi.storage_path,
    COUNT(pf.id) AS total_faces,
    COUNT(CASE WHEN pf.person_id IS NULL THEN 1 END) AS unassigned_faces
FROM gallery_images gi
JOIN galleries g ON g.id = gi.gallery_id
JOIN photo_faces pf ON pf.photo_id = gi.id
WHERE pf.person_id IS NULL
GROUP BY gi.id, g.title, gi.filename, gi.storage_path
ORDER BY COUNT(CASE WHEN pf.person_id IS NULL THEN 1 END) DESC;

-- 2. Фото где есть verified=false лица с назначенным person_id
SELECT 
    gi.id AS photo_id,
    g.title AS gallery_title,
    gi.filename,
    p.name AS person_name,
    pf.confidence,
    pf.verified
FROM gallery_images gi
JOIN galleries g ON g.id = gi.gallery_id
JOIN photo_faces pf ON pf.photo_id = gi.id
JOIN people p ON p.id = pf.person_id
WHERE pf.verified = false
ORDER BY g.title, gi.filename, p.name;

-- 3. Фото с максимальным количеством неверифицированных лиц (приоритет для ручной проверки)
SELECT 
    gi.id AS photo_id,
    g.title AS gallery_title,
    gi.filename,
    gi.storage_path,
    COUNT(pf.id) AS total_faces,
    COUNT(CASE WHEN pf.verified = false OR pf.person_id IS NULL THEN 1 END) AS unverified_count,
    array_agg(DISTINCT p.name) FILTER (WHERE p.id IS NOT NULL) AS assigned_people
FROM gallery_images gi
JOIN galleries g ON g.id = gi.gallery_id
JOIN photo_faces pf ON pf.photo_id = gi.id
LEFT JOIN people p ON p.id = pf.person_id
GROUP BY gi.id, g.title, gi.filename, gi.storage_path
HAVING COUNT(CASE WHEN pf.verified = false OR pf.person_id IS NULL THEN 1 END) > 0
ORDER BY COUNT(CASE WHEN pf.verified = false OR pf.person_id IS NULL THEN 1 END) DESC
LIMIT 50;
