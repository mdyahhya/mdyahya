// api/auth.js — 6-Digit Admin PIN Authentication
const crypto = require('crypto');

function verifyPin(inputPin) {
  const configuredPin = process.env.ADMIN_PIN || '123456';
  return String(inputPin).trim() === String(configuredPin).trim();
}

function generateAdminToken(pin) {
  const secret = process.env.ADMIN_PIN || 'yahya-admin-secret-2026';
  const timestamp = Date.now();
  const hash = crypto.createHmac('sha256', secret).update(`${pin}:${timestamp}`).digest('hex');
  return Buffer.from(JSON.stringify({ pin, timestamp, hash })).toString('base64');
}

function isTokenValid(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const { pin, timestamp, hash } = JSON.parse(raw);
    const secret = process.env.ADMIN_PIN || 'yahya-admin-secret-2026';
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const valid = isTokenValid(token);
    return res.status(200).json({ authenticated: valid });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pin } = req.body || {};
    if (!pin || String(pin).length < 4) {
      return res.status(400).json({ error: 'Please enter a valid PIN' });
    }

    if (verifyPin(pin)) {
      const token = generateAdminToken(pin);
      return res.status(200).json({ success: true, token });
    } else {
      return res.status(401).json({ error: 'Incorrect 6-digit PIN' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports.isTokenValid = isTokenValid;
module.exports.verifyPin = verifyPin;
