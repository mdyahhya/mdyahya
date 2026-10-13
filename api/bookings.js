// api/bookings.js — Admin Management of Inquiries & Appointments
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase credentials not set in environment.' });
  }

  try {
    // ── GET: Fetch all bookings ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('booking_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ bookings: data || [] });
    }

    // ── PATCH: Update booking status ──────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !status) {
        return res.status(400).json({ error: 'Missing booking id or status' });
      }

      const { data, error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, booking: data });
    }

    // ── DELETE: Delete booking ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query.id ? req.query : (req.body || {});
      if (!id) {
        return res.status(400).json({ error: 'Missing booking id' });
      }

      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Booking deleted' });
    }

    // ── POST: Add manual booking ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, email, phone, message, booking_date, time_slot, status } = req.body || {};
      if (!name || !email || !booking_date || !time_slot) {
        return res.status(400).json({ error: 'Name, email, date, and slot are required' });
      }

      const { data, error } = await supabase
        .from('bookings')
        .insert([{
          name,
          email,
          phone: phone || null,
          message: message || null,
          booking_date,
          time_slot,
          status: status || 'confirmed'
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, booking: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[Bookings Endpoint Error]:', err);
    return res.status(500).json({ error: err.message });
  }
};
