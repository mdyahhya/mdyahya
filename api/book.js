// api/book.js — Public Booking Submission with Instant Push Notification
const webpush = require('web-push');
const { getSupabaseClient } = require('./supabase');
const { parseBody, cleanEnv } = require('./utils');

const VAPID_PUBLIC_KEY = cleanEnv(process.env.VAPID_PUBLIC_KEY, 'BPN3I4uXoHfIr8rR9BirQFsp21iZ3bLOTv6V4mSsUV3LYOO0WuQ76yETVCWMjv3PyxmQvBGtAz2F8ZY3MrwM4Vs');
const VAPID_PRIVATE_KEY = cleanEnv(process.env.VAPID_PRIVATE_KEY, 'NZPiBwvWtTqNYa83eh9CfuDaJvNg5ywlZfXPOAksAmQ');
const VAPID_SUBJECT = cleanEnv(process.env.VAPID_SUBJECT, 'mailto:yahyabuilds@gmail.com');

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('[VAPID Setup Warning]:', e.message);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const { name, email, phone, message, booking_date, time_slot } = body;

    if (!name || !email || !booking_date || !time_slot) {
      return res.status(400).json({ error: 'Name, email, date, and time slot are required.' });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const supabase = getSupabaseClient();
    let savedBooking = {
      id: `local_${Date.now()}`,
      name: String(name).trim(),
      email: String(email).trim(),
      phone: phone ? String(phone).trim() : null,
      message: message ? String(message).trim() : null,
      booking_date,
      time_slot,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (supabase) {
      // 1. Check if the slot or entire day is blocked by Yahya
      try {
        const { data: blocked } = await supabase
          .from('blocked_slots')
          .select('*')
          .eq('slot_date', booking_date)
          .or(`time_slot.eq.${time_slot},time_slot.is.null`);

        if (blocked && blocked.length > 0) {
          return res.status(409).json({ error: 'This time slot is marked unavailable. Please select another slot.' });
        }
      } catch (blockErr) {
        console.warn('[Blocked slot check note]:', blockErr.message);
      }

      // 2. Check if already booked
      try {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id')
          .eq('booking_date', booking_date)
          .eq('time_slot', time_slot)
          .neq('status', 'cancelled');

        if (existing && existing.length > 0) {
          return res.status(409).json({ error: 'This slot has already been booked. Please pick another time.' });
        }
      } catch (checkErr) {
        console.warn('[Existing booking check note]:', checkErr.message);
      }

      // 3. Insert new booking with resilient constraint handling
      let insertPayload = {
        name: savedBooking.name,
        email: savedBooking.email,
        phone: savedBooking.phone,
        message: savedBooking.message,
        booking_date,
        time_slot,
        status: 'pending'
      };

      let inserted = null;
      let insertError = null;

      // Dynamically satisfy any legacy NOT NULL columns (customer_name, customer_email, date, etc.)
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await supabase
          .from('bookings')
          .insert([insertPayload])
          .select()
          .single();

        if (!result.error) {
          inserted = result.data;
          insertError = null;
          break;
        }

        insertError = result.error;
        const msg = insertError.message || '';

        // 1. Check for NOT-NULL constraint violations on legacy columns (e.g. customer_name, customer_phone, etc.)
        const notNullMatch = msg.match(/null value in column "([^"]+)"/i);
        if (notNullMatch) {
          const col = notNullMatch[1];
          console.warn(`[Auto-resolving NOT NULL constraint on legacy column: '${col}']`);
          if (col.includes('name')) insertPayload[col] = savedBooking.name;
          else if (col.includes('email')) insertPayload[col] = savedBooking.email;
          else if (col.includes('phone')) insertPayload[col] = savedBooking.phone || 'N/A';
          else if (col.includes('date')) insertPayload[col] = booking_date;
          else if (col.includes('message') || col.includes('note')) insertPayload[col] = savedBooking.message || '';
          else if (col.includes('amount') || col.includes('price') || col.includes('total')) insertPayload[col] = 0;
          else if (col.includes('status')) insertPayload[col] = 'pending';
          else insertPayload[col] = 'N/A';
          continue;
        }

        // 2. Check for missing columns in schema cache (PGRST204)
        const unknownColMatch = msg.match(/Could not find the ([^\s]+) column/i);
        if (unknownColMatch) {
          const col = unknownColMatch[1];
          if (insertPayload[col]) {
            console.warn(`[Removing unknown column from payload: '${col}']`);
            delete insertPayload[col];
            // If booking_date was rejected by cache, try 'date' instead
            if (col === 'booking_date') insertPayload['date'] = booking_date;
            continue;
          }
        }

        break;
      }

      if (insertError) {
        console.error('[Booking Insert Error]:', insertError);
        return res.status(500).json({ 
          error: 'Failed to record booking. ' + insertError.message,
          hint: 'Please run the fix migration in your Supabase SQL Editor to drop NOT NULL on legacy columns and reload the schema cache.'
        });
      }

      savedBooking = inserted || savedBooking;

      // 4. Send Web Push to all registered admin devices
      try {
        const { data: subs, error: subsError } = await supabase
          .from('push_subscriptions')
          .select('*');

        if (!subsError && subs && subs.length > 0) {
          const pushPayload = JSON.stringify({
            title: `📅 New Booking: ${savedBooking.name}`,
            body: `${booking_date} at ${time_slot}\nEmail: ${savedBooking.email}${savedBooking.phone ? '\nPhone: ' + savedBooking.phone : ''}${savedBooking.message ? '\nNote: ' + savedBooking.message : ''}`,
            url: '/#admin'
          });

          const sendPromises = subs.map(async (sub) => {
            try {
              await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: sub.keys
              }, pushPayload);
            } catch (err) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription has expired, remove from DB
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              }
            }
          });

          await Promise.allSettled(sendPromises);
        }
      } catch (pushErr) {
        console.error('[Push Dispatch Error]:', pushErr);
      }
    }

    return res.status(200).json({
      success: true,
      booking: savedBooking,
      message: 'Booking request confirmed! You will receive a confirmation message from our team.'
    });
  } catch (err) {
    console.error('[Book Endpoint Error]:', err);
    return res.status(500).json({ error: err.message });
  }
};
