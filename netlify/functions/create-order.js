const https = require('https');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { courseId, courseName, amount, customerName, customerEmail, customerPhone } = body;

    console.log('[Cashfree] Incoming request body:', JSON.stringify({ courseId, courseName, amount, customerName, customerEmail, customerPhone }));

    if (!amount || !customerPhone) {
      console.error('[Cashfree] Validation failed: missing amount or customerPhone');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: amount, customerPhone' })
      };
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = (process.env.CASHFREE_ENV || 'PRODUCTION').toUpperCase();

    // Log env var presence WITHOUT revealing secrets
    console.log('[Cashfree] ENV check:');
    console.log('  CASHFREE_APP_ID present?', !!appId, '| Length:', appId ? appId.length : 0);
    console.log('  CASHFREE_SECRET_KEY present?', !!secretKey, '| Length:', secretKey ? secretKey.length : 0);
    console.log('  CASHFREE_ENV:', env);

    if (!appId || !secretKey) {
      const missing = [];
      if (!appId) missing.push('CASHFREE_APP_ID');
      if (!secretKey) missing.push('CASHFREE_SECRET_KEY');
      const msg = `Missing environment variables: ${missing.join(', ')}. Please set them in Netlify Site Settings → Environment Variables.`;
      console.error('[Cashfree] FATAL:', msg);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: msg,
          hint: 'Go to Netlify Dashboard → Site Settings → Environment Variables and add CASHFREE_APP_ID and CASHFREE_SECRET_KEY'
        })
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
        return_url: `https://${event.headers.host || 'yahya.in'}/payment-success.html?order_id={order_id}&course_id=${encodeURIComponent(courseId || '')}&course_name=${encodeURIComponent(courseName || '')}`
      },
      order_note: `Payment Gateway Integration Demo - ${courseName || 'Test'}`
    });

    console.log('[Cashfree] Sending order request to:', host);
    console.log('[Cashfree] Order payload:', payload);

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
          console.log('[Cashfree] Response status:', apiRes.statusCode);
          console.log('[Cashfree] Response body:', data);

          try {
            const parsed = JSON.parse(data);

            if (apiRes.statusCode === 401) {
              console.error('[Cashfree] 401 Unauthorized — Invalid App ID or Secret Key!');
              console.error('[Cashfree] Check: App ID starts with:', appId.substring(0, 6) + '...');
              console.error('[Cashfree] Ensure credentials are from the correct environment (TEST vs PRODUCTION).');
              return resolve({
                statusCode: 401,
                headers,
                body: JSON.stringify({
                  error: 'Authentication failed with Cashfree API (401 Unauthorized).',
                  detail: parsed.message || parsed.error || 'Invalid App ID or Secret Key.',
                  hint: 'Make sure CASHFREE_APP_ID and CASHFREE_SECRET_KEY are correctly set in Netlify Environment Variables. Also confirm you are using TEST credentials for sandbox mode.',
                  cashfree_response: parsed
                })
              });
            }

            if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
              console.log('[Cashfree] Order created successfully! Order ID:', parsed.order_id);
              return resolve({ statusCode: 200, headers, body: JSON.stringify(parsed) });
            }

            console.error('[Cashfree] Non-200 response:', apiRes.statusCode, parsed);
            return resolve({
              statusCode: apiRes.statusCode,
              headers,
              body: JSON.stringify({
                error: parsed.message || 'Cashfree returned an error.',
                cashfree_response: parsed
              })
            });
          } catch (e) {
            console.error('[Cashfree] Failed to parse response JSON. Raw body:', data);
            return resolve({
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'Failed to parse Cashfree response', raw: data })
            });
          }
        });
      });

      apiReq.on('error', (err) => {
        console.error('[Cashfree] HTTPS Request error:', err.message);
        resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Network error calling Cashfree API: ' + err.message })
        });
      });

      apiReq.write(payload);
      apiReq.end();
    });

  } catch (err) {
    console.error('[Cashfree] Unhandled server error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
