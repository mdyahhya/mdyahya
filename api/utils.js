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

function timeStringToMinutes(str) {
  if (!str) return null;
  str = String(str).trim();
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toUpperCase() : null;
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function parseSlotInterval(slotStr) {
  if (!slotStr) return null;
  const parts = String(slotStr).split(/–|-/);
  if (parts.length >= 2) {
    const start = timeStringToMinutes(parts[0]);
    const end = timeStringToMinutes(parts[1]);
    if (start !== null && end !== null) return [start, end];
  }
  const single = timeStringToMinutes(slotStr);
  if (single !== null) return [single, single + 60];
  return null;
}

function intervalsOverlap(rangeA, rangeB) {
  if (!rangeA || !rangeB) return false;
  return rangeA[0] < rangeB[1] && rangeA[1] > rangeB[0];
}

module.exports = { parseBody, cleanEnv, parseSlotInterval, intervalsOverlap };
