// api/push-subscribe.js — Register Web Push Subscriptions & Send Test Alert
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const { subscription, test } = body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing push subscription object' });
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let keysPayload = subscription.keys;
        if (typeof keysPayload === 'string') {
          try { keysPayload = JSON.parse(keysPayload); } catch (_) {}
        }

        const { data: existing } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();

        if (existing && existing.id) {
          await supabase
            .from('push_subscriptions')
            .update({
              keys: keysPayload,
              user_agent: req.headers['user-agent'] || 'Unknown',
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('push_subscriptions')
            .insert([{
              endpoint: subscription.endpoint,
              keys: keysPayload,
              user_agent: req.headers['user-agent'] || 'Unknown'
            }]);
        }
      } catch (dbErr) {
        console.warn('[Push DB save notice]:', dbErr.message);
      }
    }

    if (test) {
      const payload = JSON.stringify({
        title: '🔔 Push Alert Test Successful!',
        body: 'Yahya, mobile push notifications are working perfectly on your device!',
        url: '/#admin'
      });

      try {
        await webpush.sendNotification(subscription, payload);
        return res.status(200).json({ success: true, message: 'Test notification sent to device!' });
      } catch (pushErr) {
        console.error('[Push Test Error]:', pushErr);
        return res.status(200).json({
          success: true,
          warning: 'Subscription saved, test push returned: ' + pushErr.message
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully' });
  } catch (err) {
    console.error('[Push Error]:', err);
    return res.status(500).json({ error: err.message });
  }
};
