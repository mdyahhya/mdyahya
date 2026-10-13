// api/availability.js — Fetch Availability & Admin Block/Unblock Hourly Slots
const { getSupabaseClient } = require('./supabase');
const { isTokenValid, verifyPin } = require('./auth');
const { parseBody, parseSlotInterval, intervalsOverlap } = require('./utils');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseClient();

  // ── GET: Public availability check ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (!supabase) {
        return res.status(200).json({
          blocked: [],
          booked: [],
          notice: 'Supabase credentials not yet configured'
        });
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const { data: blocked } = await supabase
        .from('blocked_slots')
        .select('*')
        .gte('slot_date', todayStr);

      // ONLY confirmed or accepted bookings lock slots. Pending requests do NOT block slots!
      const { data: booked } = await supabase
        .from('bookings')
        .select('id, booking_date, time_slot, status, name')
        .gte('booking_date', todayStr)
        .in('status', ['confirmed', 'accepted']);

      const { data: pending } = await supabase
        .from('bookings')
        .select('id, booking_date, time_slot, status, name')
        .gte('booking_date', todayStr)
        .eq('status', 'pending');

      return res.status(200).json({
        blocked: blocked || [],
        booked: booked || [],
        pending: pending || []
      });
    } catch (err) {
      console.error('[Availability GET Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: Admin Toggle Block/Unblock ─────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = parseBody(req);
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const pinHeader = req.headers['x-admin-pin'] || body.pin;

      const isAuthed = isTokenValid(token) || (pinHeader && verifyPin(pinHeader));
      if (!isAuthed) {
        return res.status(401).json({ error: 'Unauthorized. Admin PIN required.' });
      }

      const { date, time_slot, blocked, reason } = body;

      if (!date) {
        return res.status(400).json({ error: 'Date is required.' });
      }

      if (!supabase) {
        return res.status(500).json({ error: 'Supabase credentials not set in environment.' });
      }

      if (blocked === false) {
        // Unblock slot or day
        if (time_slot) {
          const { data: allBlocked } = await supabase
            .from('blocked_slots')
            .select('id, time_slot')
            .eq('slot_date', date);

          const targetRange = parseSlotInterval(time_slot);
          const toDelete = (allBlocked || []).filter(b => {
            if (b.time_slot === time_slot) return true;
            if (targetRange && b.time_slot) {
              const bRange = parseSlotInterval(b.time_slot);
              return intervalsOverlap(targetRange, bRange);
            }
            return false;
          }).map(b => b.id);

          if (toDelete.length > 0) {
            await supabase.from('blocked_slots').delete().in('id', toDelete);
          }
        } else {
          await supabase.from('blocked_slots').delete().eq('slot_date', date).is('time_slot', null);
        }
        return res.status(200).json({ success: true, message: 'Slot unblocked successfully.' });
      } else {
        // Block slot or entire day: clean up overlapping or exact matches first, then insert
        if (time_slot) {
          const { data: allBlocked } = await supabase
            .from('blocked_slots')
            .select('id, time_slot')
            .eq('slot_date', date);

          const targetRange = parseSlotInterval(time_slot);
          const toDelete = (allBlocked || []).filter(b => {
            if (b.time_slot === time_slot) return true;
            if (targetRange && b.time_slot) {
              const bRange = parseSlotInterval(b.time_slot);
              return intervalsOverlap(targetRange, bRange);
            }
            return false;
          }).map(b => b.id);

          if (toDelete.length > 0) {
            await supabase.from('blocked_slots').delete().in('id', toDelete);
          }
        } else {
          await supabase.from('blocked_slots').delete().eq('slot_date', date).is('time_slot', null);
        }

        const { error } = await supabase
          .from('blocked_slots')
          .insert([{
            slot_date: date,
            time_slot: time_slot || null,
            reason: reason || 'Blocked by Admin'
          }]);

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Slot marked unavailable.' });
      }
    } catch (err) {
      console.error('[Availability POST Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
