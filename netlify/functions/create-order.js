const https = require('https');

exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { courseId, courseName, amount, customerName, customerEmail, customerPhone } = body;

    if (!amount || !customerPhone) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: amount, customerPhone' })
      };
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();

    if (!appId || !secretKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Cashfree API credentials are not set in environment variables.' })
      };
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
        return_url: `https://${event.headers.host || 'yahya.in'}/courses.html?order_id={order_id}`
      },
      order_note: `Enrollment for ${courseName || 'Course'}`
    });

    return new Promise((resolve) => {
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
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              statusCode: apiRes.statusCode,
              headers,
              body: JSON.stringify(parsed)
            });
          } catch (e) {
            resolve({
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'Failed to parse Cashfree response', raw: data })
            });
          }
        });
      });

      apiReq.on('error', (err) => {
        resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: err.message })
        });
      });

      apiReq.write(payload);
      apiReq.end();
    });

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
