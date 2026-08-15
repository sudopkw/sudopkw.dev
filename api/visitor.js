import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const allowedOrigins = [
    'https://sudopkw.github.io',
    'https://sudopkw.dev',
    'https://www.sudopkw.dev'
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://sudopkw.dev');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Parse cookies safely
    const cookieHeader = req.headers.cookie || '';
    const cookies = {};

    for (const cookie of cookieHeader.split(';')) {
      const separatorIndex = cookie.indexOf('=');

      if (separatorIndex === -1) continue;

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      cookies[name] = decodeURIComponent(value);
    }

    let visitorId = cookies.visitor_id;
    let isNew = false;

    // Generate a visitor ID if this browser doesn't have one
    if (!visitorId) {
      visitorId = `visitor_${crypto.randomUUID()}`;
      isNew = true;
    }

    const visitorKey = `visitor:${visitorId}`;

    /*
     * SET NX is atomic:
     *
     * - If the visitor key doesn't exist, Redis creates it.
     * - If it already exists, Redis does nothing.
     *
     * This prevents duplicate counting from simultaneous requests.
     */
    const wasCreated = await redis.set(
      visitorKey,
      '1',
      {
        nx: true
      }
    );

    let count;

    if (wasCreated) {
      count = await redis.incr('unique_visitors_total');

      console.log(`New unique visitor: ${visitorId}, total: ${count}`);
      isNew = true;
    } else {
      count = await redis.get('unique_visitors_total') || 0;
      count = parseInt(count, 10);

      console.log(`Returning visitor: ${visitorId}, total: ${count}`);
      isNew = false;
    }

    /*
     * Keep the visitor ID for one year.
     *
     * HttpOnly prevents client-side JavaScript from reading/modifying it.
     * SameSite=None + Secure allows it to be sent to the API from sudopkw.dev.
     */
    if (!cookies.visitor_id) {
      res.setHeader(
        'Set-Cookie',
        [
          `visitor_id=${encodeURIComponent(visitorId)}`,
          'Max-Age=31536000',
          'Path=/',
          'SameSite=None',
          'Secure',
          'HttpOnly'
        ].join('; ')
      );
    }

    return res.status(200).json({
      count,
      status: 'success',
      isNew
    });

  } catch (error) {
    console.error('Redis error:', error);

    return res.status(500).json({
      error: 'Counter temporarily offline',
      count: 0
    });
  }
}
