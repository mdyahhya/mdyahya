// api/push-subscribe.js — Register Web Push Subscriptions & Send Test Alert
const webpush = require('web-push');
const { getSupabaseClient } = require('./supabase');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPN3I4uXoHfIr8rR9BirQFsp21iZ3bLOTv6V4mSsUV3LYOO0WuQ76yETVCWMjv3PyxmQvBGtAz2F8ZY3MrwM4Vs';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'NZPiBwvWtTqNYa83eh9CfuDaJvNg5ywlZfXPOAksAmQ';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:yahyabuilds@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
    const { subscription, test } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing push subscription object' });
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      // Upsert subscription into Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            user_agent: req.headers['user-agent'] || 'Unknown'
          },
          { onConflict: 'endpoint' }
        );

      if (error) {
        console.warn('[Push] Supabase upsert notice:', error.message);
      }
    }

    // If test is requested, immediately trigger a test push alert
    if (test) {
      const payload = JSON.stringify({
        title: '🔔 Test Notification Successful!',
        body: 'Yahya, your mobile push alerts are active and ready to receive real-time bookings.',
        url: '/#admin'
      });

      try {
        await webpush.sendNotification(subscription, payload);
        return res.status(200).json({ success: true, message: 'Test notification sent to device!' });
      } catch (pushErr) {
        console.error('[Push Test Error]:', pushErr);
        return res.status(200).json({
          success: true,
          warning: 'Subscription saved, but test push encountered an issue: ' + pushErr.message
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully' });
  } catch (err) {
    console.error('[Push Error]:', err);
    return res.status(500).json({ error: err.message });
  }
};
