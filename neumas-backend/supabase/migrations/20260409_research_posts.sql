-- Run in Supabase SQL Editor or via migration pipeline.
-- Research / insights blog posts (agent-generated).

CREATE TABLE IF NOT EXISTS research_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    published BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS research_posts_slug_idx ON research_posts(slug);
CREATE INDEX IF NOT EXISTS research_posts_category_idx ON research_posts(category);

ALTER TABLE research_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON research_posts;
CREATE POLICY "public_read" ON research_posts FOR SELECT USING (published = true);

DROP POLICY IF EXISTS "service_write" ON research_posts;
CREATE POLICY "service_write" ON research_posts FOR ALL USING (true);
