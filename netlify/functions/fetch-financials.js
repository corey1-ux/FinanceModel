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

    // FREE TIER ENDPOINTS ONLY
    const baseUrl = 'https://financialmodelingprep.com/api/v3';
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const incomeUrl = `${baseUrl}/income-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const quoteUrl = `${baseUrl}/quote/${ticker}?apikey=${apiKey}`;

    console.log('Fetching from FREE TIER URLs:', {
        profile: profileUrl.replace(apiKey, 'HIDDEN'),
        income: incomeUrl.replace(apiKey, 'HIDDEN'),
        balanceSheet: balanceSheetUrl.replace(apiKey, 'HIDDEN'),
        quote: quoteUrl.replace(apiKey, 'HIDDEN')
    });

    try {
        // Make API calls to FREE endpoints only
        const [profileRes, incomeRes, balanceSheetRes, quoteRes] = await Promise.all([
            fetch(profileUrl),
            fetch(incomeUrl),
            fetch(balanceSheetUrl),
            fetch(quoteUrl)
        ]);

        console.log('API response status codes:', {
            profile: profileRes.status,
            income: incomeRes.status,
            balanceSheet: balanceSheetRes.status,
            quote: quoteRes.status
        });

        // Check if any request failed
        if (!profileRes.ok) {
            const errorText = await profileRes.text();
            console.log('Profile API error:', errorText);
            throw new Error(`Profile API failed with status ${profileRes.status}: ${errorText}`);
        }

        if (!incomeRes.ok) {
            const errorText = await incomeRes.text();
            console.log('Income API error:', errorText);
            throw new Error(`Income API failed with status ${incomeRes.status}: ${errorText}`);
        }

        if (!balanceSheetRes.ok) {
            const errorText = await balanceSheetRes.text();
            console.log('Balance Sheet API error:', errorText);
            throw new Error(`Balance Sheet API failed with status ${balanceSheetRes.status}: ${errorText}`);
        }

        if (!quoteRes.ok) {
            const errorText = await quoteRes.text();
            console.log('Quote API error:', errorText);
            throw new Error(`Quote API failed with status ${quoteRes.status}: ${errorText}`);
        }

        // Parse responses
        const profileData = await profileRes.json();
        const incomeData = await incomeRes.json();
        const balanceSheetData = await balanceSheetRes.json();
        const quoteData = await quoteRes.json();

        console.log('Data received:', {
            profileLength: Array.isArray(profileData) ? profileData.length : 'not array',
            incomeLength: Array.isArray(incomeData) ? incomeData.length : 'not array',
            balanceSheetLength: Array.isArray(balanceSheetData) ? balanceSheetData.length : 'not array',
            quoteLength: Array.isArray(quoteData) ? quoteData.length : 'not array'
        });

        // Debug: Log available fields in each dataset
        if (Array.isArray(profileData) && profileData.length > 0) {
            console.log('Profile fields:', Object.keys(profileData[0]));
            console.log('Profile shares-related fields:', Object.keys(profileData[0]).filter(key => 
                key.toLowerCase().includes('share') || key.toLowerCase().includes('outstanding')));
        }
        
        if (Array.isArray(quoteData) && quoteData.length > 0) {
            console.log('Quote fields:', Object.keys(quoteData[0]));
            console.log('Quote shares-related fields:', Object.keys(quoteData[0]).filter(key => 
                key.toLowerCase().includes('share') || key.toLowerCase().includes('outstanding')));
        }

        // Validate data
        if (!Array.isArray(profileData) || profileData.length === 0) {
            console.log('No profile data returned');
            throw new Error('No company profile data found. The ticker may be invalid or not supported.');
        }

        if (!Array.isArray(incomeData) || incomeData.length === 0) {
            console.log('No income data returned');
            throw new Error('No income statement data found. The ticker may be invalid or have no recent financial data.');
        }

        if (!Array.isArray(balanceSheetData) || balanceSheetData.length === 0) {
            console.log('No balance sheet data returned');
            throw new Error('No balance sheet data found. The ticker may be invalid or have no recent financial data.');
        }

        if (!Array.isArray(quoteData) || quoteData.length === 0) {
            console.log('No quote data returned');
            throw new Error('No quote data found. The ticker may be invalid.');
        }

        // CALCULATE FREE CASH FLOW from available data
        // FCF = Net Income + Depreciation - Capital Expenditures - Change in Working Capital
        // For approximation: FCF ≈ Net Income + Depreciation (conservative estimate)
        const income = incomeData[0];
        const balance = balanceSheetData[0];
        const quote = quoteData[0];

        // Approximate FCF calculation using available free tier data
        const netIncome = income.netIncome || 0;
        const depreciationAndAmortization = income.depreciationAndAmortization || 0;
        
        // Conservative FCF estimate (actual FCF is usually lower due to CapEx)
        const estimatedFCF = netIncome + depreciationAndAmortization;

        console.log('Calculated estimated FCF:', {
            netIncome,
            depreciationAndAmortization,
            estimatedFCF
        });

        // Create mock cash flow data structure
        const mockCashflow = [{
            freeCashFlow: estimatedFCF,
            revenue: income.revenue,
            netIncome: netIncome,
            // Note: This is estimated data since actual cash flow requires paid subscription
            operatingCashFlow: estimatedFCF * 1.2 // Rough estimate
        }];

        // Combine data
        const combinedData = {
            profile: {
                ...profileData[0],
                price: quote.price, // Add current price from quote
                // Try to get shares outstanding from multiple possible sources
                sharesOutstanding: profileData[0].sharesOutstanding || 
                                 profileData[0].weightedAverageShsOut || 
                                 profileData[0].weightedAverageShsOutDil ||
                                 quote.sharesOutstanding ||
                                 quote.weightedAverageShsOut ||
                                 quote.weightedAverageShsOutDil ||
                                 null
            },
            cashflow: mockCashflow,
            balanceSheet: balanceSheetData[0],
            note: "Free Cash Flow is estimated from Income Statement data. For actual cash flow data, upgrade to FMP paid plan."
        };

        console.log('Final shares outstanding value:', combinedData.profile.sharesOutstanding);

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
