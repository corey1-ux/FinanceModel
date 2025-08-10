const cache = new Map();

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const { ticker, historical } = event.queryStringParameters || {};
    const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

    if (!ticker) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Ticker parameter is required' })
        };
    }

    // Check cache first
    const cacheKey = historical ? `${ticker}_hist` : ticker;
    const cachedEntry = cache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_DURATION_MS)) {
        console.log(`Returning cached data for ${cacheKey}`);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(cachedEntry.data)
        };
    }

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'FMP_API_KEY environment variable is not configured.' })
        };
    }

    const baseUrl = 'https://financialmodelingprep.com/api/v3';
    
    // Base endpoints
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const incomeUrl = `${baseUrl}/income-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const quoteUrl = `${baseUrl}/quote/${ticker}?apikey=${apiKey}`;
    
    // Historical data endpoint (if requested)
    const historicalIncomeUrl = historical ? 
        `${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}` : null;

    try {
        // Base API calls
        const apiCalls = [
            fetch(profileUrl),
            fetch(incomeUrl),
            fetch(balanceSheetUrl),
            fetch(quoteUrl)
        ];
        
        // Add historical call if requested
        if (historical && historicalIncomeUrl) {
            apiCalls.push(fetch(historicalIncomeUrl));
        }
        
        const responses = await Promise.all(apiCalls);
        
        // Check if any request failed
        for (let i = 0; i < responses.length; i++) {
            if (!responses[i].ok) {
                const errorText = await responses[i].text();
                throw new Error(`API call ${i} failed with status ${responses[i].status}: ${errorText}`);
            }
        }

        // Parse responses
        const [profileData, incomeData, balanceSheetData, quoteData, historicalIncomeData] = 
            await Promise.all(responses.map(r => r.json()));

        // Validate data
        if (!Array.isArray(profileData) || profileData.length === 0) {
            throw new Error('No company profile data found.');
        }
        if (!Array.isArray(incomeData) || incomeData.length === 0) {
            throw new Error('No income statement data found.');
        }
        if (!Array.isArray(balanceSheetData) || balanceSheetData.length === 0) {
            throw new Error('No balance sheet data found.');
        }
        if (!Array.isArray(quoteData) || quoteData.length === 0) {
            throw new Error('No quote data found.');
        }

        // Calculate estimated FCF
        const income = incomeData[0];
        const balance = balanceSheetData[0];
        const quote = quoteData[0];

        const netIncome = income.netIncome || 0;
        const depreciationAndAmortization = income.depreciationAndAmortization || 0;
        const estimatedFCF = netIncome + depreciationAndAmortization;

        // Create mock cash flow data
        const mockCashflow = [{
            freeCashFlow: estimatedFCF,
            revenue: income.revenue,
            netIncome: netIncome,
            operatingCashFlow: estimatedFCF * 1.2
        }];

        // Combine all data
        const combinedData = {
            profile: {
                ...profileData[0],
                price: quote.price,
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
            // Add historical data if requested
            ...(historical && historicalIncomeData ? { historicalIncome: historicalIncomeData } : {}),
            note: "Free Cash Flow is estimated from Income Statement data. For actual cash flow data, upgrade to FMP paid plan."
        };

        console.log(`Successfully processed data for ${ticker}${historical ? ' with historical data' : ''}`);

        // Cache the result
        cache.set(cacheKey, {
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
