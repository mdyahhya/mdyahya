// api/utils.js — Safe JSON Body Parser & Helpers for Vercel Serverless Functions

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (e) {
    try {
      // In case body is URL encoded or has extra quotes
      return JSON.parse(decodeURIComponent(req.body));
    } catch (e2) {
      return {};
    }
  }
}

function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  return String(val).trim().replace(/^['"]|['"]$/g, '');
}

module.exports = { parseBody, cleanEnv };
