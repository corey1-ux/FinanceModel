const cache = new Map();

// This is a Node.js environment, so we need to import fetch
const fetch = require('node-fetch');

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

    const { ticker } = event.queryStringParameters || {};
    const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

    if (!ticker) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Ticker parameter is required' })
        };
    }

    const cacheKey = ticker;
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
    
    // Define all API endpoints
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const quoteUrl = `${baseUrl}/quote/${ticker}?apikey=${apiKey}`;
    // --- NEW: Add the URL for the Cash Flow Statement ---
    const cashflowUrl = `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;

    try {
        // Add the new API call to the list
        const apiCalls = [
            fetch(profileUrl),
            fetch(balanceSheetUrl),
            fetch(quoteUrl),
            fetch(cashflowUrl) // --- NEW ---
        ];
        
        const responses = await Promise.all(apiCalls);
        
        // Check if any request failed
        for (const response of responses) {
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API call failed with status ${response.status}: ${errorText}`);
            }
        }

        // Parse all responses
        const [profileData, balanceSheetData, quoteData, cashflowData] = 
            await Promise.all(responses.map(r => r.json()));

        // --- VALIDATION ---
        if (!Array.isArray(profileData) || profileData.length === 0) throw new Error('No company profile data found.');
        if (!Array.isArray(balanceSheetData) || balanceSheetData.length === 0) throw new Error('No balance sheet data found.');
        if (!Array.isArray(quoteData) || quoteData.length === 0) throw new Error('No quote data found.');
        if (!Array.isArray(cashflowData) || cashflowData.length === 0) throw new Error('No cash flow statement data found.');

        // --- ACCURATE FCF CALCULATION ---
        const profile = profileData[0];
        const balance = balanceSheetData[0];
        const quote = quoteData[0];
        const cashflowStatement = cashflowData[0];

        // --- UPDATED: Use the new, precise formula ---
        const operatingCashFlow = cashflowStatement.operatingCashFlow || 0;
        const capitalExpenditure = cashflowStatement.capitalExpenditure || 0;
        const accurateFCF = operatingCashFlow - capitalExpenditure;

        // Combine all data for the response
        const combinedData = {
            profile: {
                ...profile,
                price: quote.price,
                sharesOutstanding: quote.sharesOutstanding || profile.sharesOutstanding || null
            },
            // --- UPDATED: Use the real cash flow data ---
            cashflow: [{
                freeCashFlow: accurateFCF,
                revenue: cashflowStatement.revenue, // Revenue is also on the cash flow statement
                netIncome: cashflowStatement.netIncome,
                operatingCashFlow: operatingCashFlow,
                capitalExpenditure: capitalExpenditure
            }],
            balanceSheet: balance,
            note: "FCF is calculated from the annual Cash Flow Statement (Operating Cash Flow - Capital Expenditure)."
        };

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
