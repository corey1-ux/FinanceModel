const cache = new Map();

exports.handler = async (event, context) => {
    // Add CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    console.log('Function invoked with event:', JSON.stringify(event, null, 2));

    const { ticker } = event.queryStringParameters || {};
    const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

    if (!ticker) {
        console.log('No ticker provided');
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Ticker parameter is required' })
        };
    }

    console.log(`Processing request for ticker: ${ticker}`);

    // Check cache first
    const cachedEntry = cache.get(ticker);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        console.log(`Returning cached data for ${ticker}`);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(cachedEntry.data)
        };
    }

    // Get API key
    const apiKey = process.env.FMP_API_KEY;
    console.log('API key present:', !!apiKey);

    if (!apiKey) {
        console.log('FMP_API_KEY environment variable not found');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'FMP_API_KEY environment variable is not configured on the server.' 
            })
        };
    }

    // Construct API URLs
    const baseUrl = 'https://financialmodelingprep.com/api/v3';
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const cashflowUrl = `${baseUrl}/cash-flow-statement/${ticker}?period=quarter&limit=4&apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;

    console.log('Fetching from URLs:', {
        profile: profileUrl.replace(apiKey, 'HIDDEN'),
        cashflow: cashflowUrl.replace(apiKey, 'HIDDEN'),
        balanceSheet: balanceSheetUrl.replace(apiKey, 'HIDDEN')
    });

    try {
        // Make API calls
        const [profileRes, cashflowRes, balanceSheetRes] = await Promise.all([
            fetch(profileUrl),
            fetch(cashflowUrl),
            fetch(balanceSheetUrl)
        ]);

        console.log('API response status codes:', {
            profile: profileRes.status,
            cashflow: cashflowRes.status,
            balanceSheet: balanceSheetRes.status
        });

        // Check if any request failed
        if (!profileRes.ok) {
            const errorText = await profileRes.text();
            console.log('Profile API error:', errorText);
            throw new Error(`Profile API failed with status ${profileRes.status}: ${errorText}`);
        }

        if (!cashflowRes.ok) {
            const errorText = await cashflowRes.text();
            console.log('Cashflow API error:', errorText);
            throw new Error(`Cashflow API failed with status ${cashflowRes.status}: ${errorText}`);
        }

        if (!balanceSheetRes.ok) {
            const errorText = await balanceSheetRes.text();
            console.log('Balance Sheet API error:', errorText);
            throw new Error(`Balance Sheet API failed with status ${balanceSheetRes.status}: ${errorText}`);
        }

        // Parse responses
        const profileData = await profileRes.json();
        const cashflowData = await cashflowRes.json();
        const balanceSheetData = await balanceSheetRes.json();

        console.log('Data received:', {
            profileLength: Array.isArray(profileData) ? profileData.length : 'not array',
            cashflowLength: Array.isArray(cashflowData) ? cashflowData.length : 'not array',
            balanceSheetLength: Array.isArray(balanceSheetData) ? balanceSheetData.length : 'not array'
        });

        // Validate data
        if (!Array.isArray(profileData) || profileData.length === 0) {
            console.log('No profile data returned');
            throw new Error('No company profile data found. The ticker may be invalid or not supported.');
        }

        if (!Array.isArray(cashflowData) || cashflowData.length === 0) {
            console.log('No cashflow data returned');
            throw new Error('No cash flow data found. The ticker may be invalid or have no recent financial data.');
        }

        if (!Array.isArray(balanceSheetData) || balanceSheetData.length === 0) {
            console.log('No balance sheet data returned');
            throw new Error('No balance sheet data found. The ticker may be invalid or have no recent financial data.');
        }

        // Combine data
        const combinedData = {
            profile: profileData[0],
            cashflow: cashflowData,
            balanceSheet: balanceSheetData[0]
        };

        console.log(`Successfully processed data for ${ticker}`);

        // Cache the result
        cache.set(ticker, {
            data: combinedData,
            timestamp: Date.now()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(combinedData)
        };

    } catch (error) {
        console.error('Error in function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: error.message,
                details: 'Check function logs for more information'
            })
        };
    }
};
