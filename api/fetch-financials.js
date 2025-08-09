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

    const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`;
    const cashflowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?period=quarter&limit=4&apikey=${apiKey}`;
    const balanceSheetUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;

    try {
        const [profileRes, cashflowRes, balanceSheetRes] = await Promise.all([
            fetch(profileUrl),
            fetch(cashflowUrl),
            fetch(balanceSheetUrl)
        ]);

        if (!profileRes.ok || !cashflowRes.ok || !balanceSheetRes.ok) {
           throw new Error(`API request to FMP failed. Check if the ticker is valid.`);
        }

        const profileData = await profileRes.json();
        const cashflowData = await cashflowRes.json();
        const balanceSheetData = await balanceSheetRes.json();

        if (!profileData.length || !cashflowData.length || !balanceSheetData.length) {
            throw new Error('No data returned from FMP API. The ticker may be invalid.');
        }

        const combinedData = {
            profile: profileData[0],
            cashflow: cashflowData,
            balanceSheet: balanceSheetData[0]
        };

        // --- Store the new data in the cache before returning it ---
        cache.set(ticker, {
            data: combinedData,
            timestamp: Date.now()
        });

        res.status(200).json(combinedData);

    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({ error: error.message });
    }
}
