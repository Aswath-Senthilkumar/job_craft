-- ============================================================================
-- Migration: Add user_id column + Row Level Security to all tables
-- Run this in your InsForge SQL editor (Dashboard > Database > SQL Editor)
-- ============================================================================

-- 1. Add user_id to all tables with automatic defaults
-- Using DEFAULT auth.uid() ensures the DB handles the mapping on creation

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE skill_snapshots ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE career_events ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE scraped_jobs_archive ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE pipeline_settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE resume_profile ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE resume_experiences ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE resume_projects ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);
ALTER TABLE resume_education ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

-- 2. Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_jobs_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_education ENABLE ROW LEVEL SECURITY;

-- 3. Industry Standard Scoped Constraints
-- These ensure that unique fields (like job links) are unique PER USER, not globally.

-- Jobs: Scope job_link to user
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_link_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_link ON jobs(user_id, job_link);

-- Events: Scope event_url to user
ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_url ON career_events(user_id, event_url);

-- Archive: Scope content_hash to user
ALTER TABLE scraped_jobs_archive DROP CONSTRAINT IF EXISTS scraped_jobs_archive_content_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_user_hash ON scraped_jobs_archive(user_id, content_hash);

-- Settings: Scope key to user
ALTER TABLE pipeline_settings DROP CONSTRAINT IF EXISTS pipeline_settings_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON pipeline_settings(user_id, key);

-- Profile: Modern 1:1 user-to-profile mapping
-- Remove old hardcoded ID column and make user_id the Primary Key
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resume_profile' AND column_name = 'id') THEN
        ALTER TABLE resume_profile DROP CONSTRAINT IF EXISTS resume_profile_pkey CASCADE;
        ALTER TABLE resume_profile DROP COLUMN IF EXISTS id;
        ALTER TABLE resume_profile ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE resume_profile ADD PRIMARY KEY (user_id);
    END IF;
END $$;
ALTER TABLE resume_profile DROP CONSTRAINT IF EXISTS resume_profile_id_check;

-- 4. RLS Policies
DROP POLICY IF EXISTS "users_own_jobs" ON jobs;
CREATE POLICY "users_own_jobs" ON jobs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_snapshots" ON skill_snapshots;
CREATE POLICY "users_own_snapshots" ON skill_snapshots FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_events" ON career_events;
CREATE POLICY "users_own_events" ON career_events FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_archive" ON scraped_jobs_archive;
CREATE POLICY "users_own_archive" ON scraped_jobs_archive FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_settings" ON pipeline_settings;
CREATE POLICY "users_own_settings" ON pipeline_settings FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_profile" ON resume_profile;
CREATE POLICY "users_own_profile" ON resume_profile FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_experiences" ON resume_experiences;
CREATE POLICY "users_own_experiences" ON resume_experiences FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_projects" ON resume_projects;
CREATE POLICY "users_own_projects" ON resume_projects FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_education" ON resume_education;
CREATE POLICY "users_own_education" ON resume_education FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_experiences_user_id ON resume_experiences(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_projects_user_id ON resume_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_education_user_id ON resume_education(user_id);

-- 6. Sequence Permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 7. Sync Sequences
-- Ensures the "next ID" counter starts AFTER the highest migrated ID
SELECT setval(pg_get_serial_sequence('resume_experiences', 'id'), COALESCE(MAX(id), 1)) FROM resume_experiences;
SELECT setval(pg_get_serial_sequence('resume_projects', 'id'), COALESCE(MAX(id), 1)) FROM resume_projects;
SELECT setval(pg_get_serial_sequence('resume_education', 'id'), COALESCE(MAX(id), 1)) FROM resume_education;
SELECT setval(pg_get_serial_sequence('jobs', 'id'), COALESCE(MAX(id), 1)) FROM jobs;
