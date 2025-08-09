const cache = new Map();

exports.handler = async (event, context) => {
    // Get query parameters from event
    const { ticker } = event.queryStringParameters || {};
    const CACHE_DURATION_MS = 60 * 60 * 1000;

    if (!ticker) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Ticker is required' })
        };
    }

    // Check cache
    const cachedEntry = cache.get(ticker);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        console.log(`Serving cached data for ${ticker}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(cachedEntry.data)
        };
    }

    console.log(`Fetching new data for ${ticker} from FMP API`);
    const apiKey = process.env.FMP_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key is not configured on the server.' })
        };
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

        // Cache the result
        cache.set(ticker, {
            data: combinedData,
            timestamp: Date.now()
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(combinedData)
        };

    } catch (error) {
        console.error('Error in serverless function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
