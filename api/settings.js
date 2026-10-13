// api/settings.js — Dynamic Hero Button & Section Settings
const { getSupabaseClient } = require('./supabase');
const { isTokenValid, verifyPin } = require('./auth');

function checkAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const pinHeader = req.headers['x-admin-pin'] || (req.body && req.body.pin);
  return isTokenValid(token) || (pinHeader && verifyPin(pinHeader));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseClient();

  // ── GET: Read public settings ──────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (!supabase) {
        return res.status(200).json({
          settings: {
            hero_button: {
              text: 'Book an Appointment',
              subtext: 'Schedule a 1-on-1 strategy call or engineering discussion'
            },
            section_config: {
              slug: 'connect',
              title: 'Book an Appointment with Yahya Mundewadi',
              nav_title: 'Connect',
              subtitle: 'Select a date and convenient time for our discussion'
            }
          }
        });
      }

      const { data, error } = await supabase.from('site_settings').select('*');
      if (error) throw error;

      const settingsMap = {};
      (data || []).forEach(row => {
        settingsMap[row.key] = row.value;
      });

      return res.status(200).json({ settings: settingsMap });
    } catch (err) {
      console.error('[Settings GET Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: Admin update settings ─────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      if (!checkAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
      }

      const { key, value } = req.body || {};
      if (!key || value === undefined) {
        return res.status(400).json({ error: 'Missing key or value' });
      }

      if (!supabase) {
        return res.status(500).json({ error: 'Supabase credentials not configured in environment' });
      }

      const { data, error } = await supabase
        .from('site_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, setting: data });
    } catch (err) {
      console.error('[Settings POST Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
