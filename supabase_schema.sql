-- ============================================================
-- YAHYA.IN — CALENDLY & APPOINTMENT BOOKING SUPABASE MIGRATION
-- Run this in your Supabase SQL Editor (1-Click Run)
-- ============================================================

-- 1. Bookings / Appointments Table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    booking_date DATE NOT NULL,
    time_slot TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, confirmed, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Blocked Slots Table (for Admin Hourly / Daily unavailability)
CREATE TABLE IF NOT EXISTS blocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_date DATE NOT NULL,
    time_slot TEXT, -- NULL represents entire day blocked
    reason TEXT DEFAULT 'Unavailable',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (slot_date, time_slot)
);

-- 3. Web Push Subscriptions Table (VAPID device endpoints)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    keys JSONB NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Site & Calendar Settings Table
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO site_settings (key, value)
VALUES 
    ('hero_button', '{"text": "Book an Appointment", "subtext": "Schedule a 1-on-1 strategy call or engineering discussion"}'::jsonb),
    ('section_config', '{"slug": "connect", "title": "Book an Appointment with Yahya Mundewadi", "nav_title": "Connect", "subtitle": "Select a date and convenient time for our discussion"}'::jsonb),
    ('general_availability', '{"start_hour": 10, "end_hour": 20, "slot_duration": 60, "days_ahead": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Public read site_settings" ON site_settings;
CREATE POLICY "Public read site_settings" ON site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public manage site_settings" ON site_settings;
CREATE POLICY "Public manage site_settings" ON site_settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read blocked_slots" ON blocked_slots;
CREATE POLICY "Public read blocked_slots" ON blocked_slots FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public manage blocked_slots" ON blocked_slots;
CREATE POLICY "Public manage blocked_slots" ON blocked_slots FOR ALL USING (true);

DROP POLICY IF EXISTS "Public insert bookings" ON bookings;
CREATE POLICY "Public insert bookings" ON bookings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public read bookings" ON bookings;
CREATE POLICY "Public read bookings" ON bookings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public manage bookings" ON bookings;
CREATE POLICY "Public manage bookings" ON bookings FOR ALL USING (true);

DROP POLICY IF EXISTS "Public manage push_subscriptions" ON push_subscriptions;
CREATE POLICY "Public manage push_subscriptions" ON push_subscriptions FOR ALL USING (true);
