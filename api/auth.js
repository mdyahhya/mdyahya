// api/auth.js — 6-Digit Admin PIN Authentication & Environment Diagnostics
const crypto = require('crypto');
const { parseBody, cleanEnv } = require('./utils');

function getAdminPin() {
  const pin = cleanEnv(process.env.ADMIN_PIN || process.env.ADMINPIN || process.env.PIN, '123456');
  return String(pin).trim();
}

function verifyPin(inputPin) {
  if (!inputPin) return false;
  const configuredPin = getAdminPin();
  return String(inputPin).trim() === configuredPin;
}

function generateAdminToken(pin) {
  const secret = getAdminPin() + '-yahya-secret-2026';
  const timestamp = Date.now();
  const hash = crypto.createHmac('sha256', secret).update(`${pin}:${timestamp}`).digest('hex');
  return Buffer.from(JSON.stringify({ pin, timestamp, hash })).toString('base64');
}

function isTokenValid(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const { pin, timestamp, hash } = JSON.parse(raw);
    const secret = getAdminPin() + '-yahya-secret-2026';
    const expectedHash = crypto.createHmac('sha256', secret).update(`${pin}:${timestamp}`).digest('hex');
    if (hash !== expectedHash) return false;
    // Token valid for 7 days
    const isNotExpired = (Date.now() - timestamp) < (7 * 24 * 60 * 60 * 1000);
    return isNotExpired && verifyPin(pin);
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── GET: Check auth & return environment variable diagnostics ───────────────
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const valid = isTokenValid(token);

    // Diagnostics to help Yahya verify Vercel environment variables without leaking secrets
    const diagnostics = {
      hasAdminPin: Boolean(process.env.ADMIN_PIN || process.env.ADMINPIN),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      hasSupabaseKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasVapidPublic: Boolean(process.env.VAPID_PUBLIC_KEY),
      hasVapidPrivate: Boolean(process.env.VAPID_PRIVATE_KEY),
      activePinSource: (process.env.ADMIN_PIN || process.env.ADMINPIN) ? 'vercel_env' : 'default_fallback'
    };

    return res.status(200).json({
      authenticated: valid,
      diagnostics
    });
  }

  // ── POST: Validate PIN ──────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const pin = body.pin || req.headers['x-admin-pin'];

    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ error: 'Please enter a valid PIN' });
    }

    if (verifyPin(pin)) {
      const token = generateAdminToken(pin);
      return res.status(200).json({
        success: true,
        token,
        pinSource: (process.env.ADMIN_PIN || process.env.ADMINPIN) ? 'vercel_env' : 'default_fallback'
      });
    } else {
      return res.status(401).json({
        error: 'Incorrect 6-digit PIN. Please check the PIN configured in your Vercel environment variables.',
        hasCustomPinSet: Boolean(process.env.ADMIN_PIN || process.env.ADMINPIN)
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports.isTokenValid = isTokenValid;
module.exports.verifyPin = verifyPin;
module.exports.getAdminPin = getAdminPin;
