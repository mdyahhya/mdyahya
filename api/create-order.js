const https = require('https');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { courseId, courseName, amount, customerName, customerEmail, customerPhone } = req.body || {};

    if (!amount || !customerPhone) {
      return res.status(400).json({ error: 'Missing required fields: amount, customerPhone' });
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = (process.env.CASHFREE_ENV || 'PRODUCTION').toUpperCase();

    if (!appId || !secretKey) {
      return res.status(500).json({ error: 'Cashfree API credentials are not set in environment variables.' });
    }

    const host = env === 'PRODUCTION' ? 'api.cashfree.com' : 'sandbox.cashfree.com';
    const orderId = `ORDER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const payload = JSON.stringify({
      order_id: orderId,
      order_amount: parseFloat(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: `CUST_${Date.now()}`,
        customer_name: customerName || 'Learner',
        customer_email: customerEmail || 'learner@example.com',
        customer_phone: customerPhone
      },
      order_meta: {
        return_url: `https://${req.headers.host || 'yahya.in'}/course-player.html?order_id={order_id}&course_id=${encodeURIComponent(courseId || '')}&course_name=${encodeURIComponent(courseName || '')}`
      },
      order_note: `Enrollment for ${courseName || 'Course'}`
    });

    const options = {
      hostname: host,
      port: 443,
      path: '/pg/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => {
        data += chunk;
      });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
            return res.status(200).json(parsed);
          } else {
            return res.status(apiRes.statusCode).json(parsed);
          }
        } catch (e) {
          return res.status(500).json({ error: 'Failed to parse Cashfree response', raw: data });
        }
      });
    });

    apiReq.on('error', (err) => {
      console.error('Cashfree Request Error:', err);
      return res.status(500).json({ error: err.message });
    });

    apiReq.write(payload);
    apiReq.end();
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  }
};
