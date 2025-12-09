-- Детальный отчет по верификации для конкретной галереи
-- Замени 'GALLERY_ID_HERE' на реальный ID галереи

WITH gallery_stats AS (
    SELECT 
        gi.id AS photo_id,
        gi.filename,
        COUNT(pf.id) AS total_faces,
        COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) AS verified_faces,
        CASE 
            WHEN COUNT(pf.id) = 0 THEN 'NO_FACES'
            WHEN COUNT(pf.id) = COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) THEN 'FULLY_VERIFIED'
            WHEN COUNT(CASE WHEN pf.verified = true AND pf.person_id IS NOT NULL THEN 1 END) > 0 THEN 'PARTIALLY_VERIFIED'
            ELSE 'NOT_VERIFIED'
        END AS status
    FROM gallery_images gi
    LEFT JOIN photo_faces pf ON pf.photo_id = gi.id
    WHERE gi.gallery_id = 'GALLERY_ID_HERE'
    GROUP BY gi.id, gi.filename
)
SELECT 
    status,
    COUNT(*) AS photo_count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM gallery_stats
GROUP BY status
ORDER BY 
    CASE status
        WHEN 'FULLY_VERIFIED' THEN 1
        WHEN 'PARTIALLY_VERIFIED' THEN 2
        WHEN 'NOT_VERIFIED' THEN 3
        WHEN 'NO_FACES' THEN 4
    END;

-- Детали по фото
SELECT 
    gi.id,
    gi.filename,
    gs.total_faces,
    gs.verified_faces,
    gs.status,
    array_agg(DISTINCT p.name ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL) AS people
FROM gallery_images gi
JOIN gallery_stats gs ON gs.photo_id = gi.id
LEFT JOIN photo_faces pf ON pf.photo_id = gi.id
LEFT JOIN people p ON p.id = pf.person_id
WHERE gi.gallery_id = 'GALLERY_ID_HERE'
GROUP BY gi.id, gi.filename, gs.total_faces, gs.verified_faces, gs.status
ORDER BY 
    CASE gs.status
        WHEN 'NOT_VERIFIED' THEN 1
        WHEN 'PARTIALLY_VERIFIED' THEN 2
        WHEN 'NO_FACES' THEN 3
        WHEN 'FULLY_VERIFIED' THEN 4
    END,
    gi.filename;
