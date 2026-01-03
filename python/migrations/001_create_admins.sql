-- Migration: Create admins table and add created_by fields
-- Date: 2026-01-03

-- 1. Create admins table
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'global_admin', 'local_admin', 'moderator')),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

-- 2. Add created_by to galleries
ALTER TABLE galleries
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id);

-- 3. Add created_by to people
ALTER TABLE people
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id);

-- 4. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_galleries_created_by ON galleries(created_by);
CREATE INDEX IF NOT EXISTS idx_people_created_by ON people(created_by);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);

-- 5. Enable RLS on admins table
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for admins table (only authenticated admins can read)
CREATE POLICY "Admins can view all admins" ON admins
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only owner and global_admin can insert admins" ON admins
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admins
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('owner', 'global_admin')
        )
    );

CREATE POLICY "Only owner and global_admin can update admins" ON admins
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('owner', 'global_admin')
        )
    );

CREATE POLICY "Only owner can delete admins" ON admins
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE email = auth.jwt() ->> 'email'
            AND role = 'owner'
        )
    );

-- 7. Insert initial owner (replace with your email)
-- INSERT INTO admins (email, name, role) VALUES ('your-email@gmail.com', 'Owner Name', 'owner');
