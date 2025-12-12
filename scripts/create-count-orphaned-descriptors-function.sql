-- SQL функция для подсчёта осиротевших дескрипторов
-- Запустите это в Supabase SQL Editor

CREATE OR REPLACE FUNCTION count_orphaned_descriptors()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM photo_faces pf
    LEFT JOIN gallery_images gi ON pf.photo_id = gi.id
    WHERE gi.id IS NULL
  );
END;
$$ LANGUAGE plpgsql;
