import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    const allowedOrigins = [
        'https://sudopkw.dev',
        'https://www.sudopkw.dev',
        'https://sudopkw.github.io'
    ];

    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }

    try {
        const { visitorId } = req.body || {};

        if (!visitorId || typeof visitorId !== 'string') {
            return res.status(400).json({
                error: 'Missing visitor ID'
            });
        }

        // Permanently remember this visitor.
        const visitorKey = `visitor:${visitorId}`;

        const alreadyCounted = await redis.get(visitorKey);

        let count;

        if (!alreadyCounted) {
            count = await redis.incr('unique_visitors_total');

            // Permanent record.
            await redis.set(visitorKey, '1');

            console.log(`New unique visitor: ${visitorId}, total: ${count}`);
        } else {
            count = await redis.get('unique_visitors_total') || 0;
            count = parseInt(count, 10);

            console.log(`Returning visitor: ${visitorId}, total: ${count}`);
        }

        return res.status(200).json({
            count: count,
            status: 'success',
            isNew: !alreadyCounted
        });

    } catch (error) {
        console.error('Redis error:', error);

        return res.status(500).json({
            error: 'Counter temporarily offline',
            count: 0
        });
    }
}
