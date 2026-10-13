-- ==============================================================================
-- YAHYA.IN — COMPLETE SUPABASE SCHEMA & AUTO-RELOAD MIGRATION
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- Solves: "Could not find the booking_date column of bookings in the schema cache"
-- ==============================================================================

-- 1. Ensure 'bookings' table exists
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely add all required columns if they don't already exist (idempotent)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS time_slot TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Safely handle legacy columns (e.g. customer_name, customer_email, date) by dropping NOT NULL constraints
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_name'
    ) THEN
        ALTER TABLE public.bookings ALTER COLUMN customer_name DROP NOT NULL;
        UPDATE public.bookings SET customer_name = name WHERE customer_name IS NULL AND name IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_email'
    ) THEN
        ALTER TABLE public.bookings ALTER COLUMN customer_email DROP NOT NULL;
        UPDATE public.bookings SET customer_email = email WHERE customer_email IS NULL AND email IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_phone'
    ) THEN
        ALTER TABLE public.bookings ALTER COLUMN customer_phone DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'date'
    ) THEN
        ALTER TABLE public.bookings ALTER COLUMN "date" DROP NOT NULL;
        UPDATE public.bookings 
        SET booking_date = "date"::DATE 
        WHERE booking_date IS NULL AND "date" IS NOT NULL;
    END IF;
END $$;

-- 2. Ensure 'blocked_slots' table exists
CREATE TABLE IF NOT EXISTS public.blocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_date DATE,
    time_slot TEXT,
    reason TEXT DEFAULT 'Unavailable',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.blocked_slots ADD COLUMN IF NOT EXISTS slot_date DATE;
ALTER TABLE public.blocked_slots ADD COLUMN IF NOT EXISTS time_slot TEXT;
ALTER TABLE public.blocked_slots ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'Unavailable';
ALTER TABLE public.blocked_slots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Ensure 'push_subscriptions' table exists
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE,
    keys JSONB,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS keys JSONB;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Ensure 'site_settings' table exists
CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default site settings
INSERT INTO public.site_settings (key, value)
VALUES 
    ('hero_button', '{"text": "Book an Appointment", "subtext": "1-on-1 Strategy & Engineering Call"}'::jsonb),
    ('section_config', '{"slug": "connect", "title": "Book an Appointment with Yahya Mundewadi", "nav_title": "Connect", "subtitle": "Select a date and convenient time for our discussion"}'::jsonb),
    ('general_availability', '{"start_hour": 10, "end_hour": 20, "slot_duration": 60, "days_ahead": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Grant permissions to public roles
GRANT ALL ON public.bookings TO anon, authenticated, service_role;
GRANT ALL ON public.blocked_slots TO anon, authenticated, service_role;
GRANT ALL ON public.push_subscriptions TO anon, authenticated, service_role;
GRANT ALL ON public.site_settings TO anon, authenticated, service_role;

-- 6. Setup RLS Policies
DROP POLICY IF EXISTS "Public insert bookings" ON public.bookings;
CREATE POLICY "Public insert bookings" ON public.bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read bookings" ON public.bookings;
CREATE POLICY "Public read bookings" ON public.bookings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public manage bookings" ON public.bookings;
CREATE POLICY "Public manage bookings" ON public.bookings FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read blocked_slots" ON public.blocked_slots;
CREATE POLICY "Public read blocked_slots" ON public.blocked_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public manage blocked_slots" ON public.blocked_slots;
CREATE POLICY "Public manage blocked_slots" ON public.blocked_slots FOR ALL USING (true);

DROP POLICY IF EXISTS "Public manage push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Public manage push_subscriptions" ON public.push_subscriptions FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read site_settings" ON public.site_settings;
CREATE POLICY "Public read site_settings" ON public.site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public manage site_settings" ON public.site_settings;
CREATE POLICY "Public manage site_settings" ON public.site_settings FOR ALL USING (true);

-- 7. CRITICAL: Force PostgREST schema cache to reload immediately!
NOTIFY pgrst, 'reload schema';
