// This file should be placed in: /api/fetch-financials.js

// A simple in-memory cache object to store API responses.
// In a production environment, you'd use a more robust solution like
// Netlify Blobs, Upstash (Redis), or Momento Cache for persistence.
const cache = new Map();

export default async function handler(req, res) {
    const { ticker } = req.query;
    const CACHE_DURATION_MS = 60 * 60 * 1000; // Cache data for 1 hour

    if (!ticker) {
        return res.status(400).json({ error: 'Ticker is required' });
    }

    // --- START: Caching Logic ---
    const cachedEntry = cache.get(ticker);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        // If a valid, non-expired entry is found in the cache, return it immediately.
        console.log(`Serving cached data for ${ticker}`);
        return res.status(200).json(cachedEntry.data);
    }
    // --- END: Caching Logic ---

    console.log(`Fetching new data for ${ticker} from FMP API`);
    const apiKey = process.env.FMP_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured on the server.' });
    }
