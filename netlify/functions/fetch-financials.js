const fetch = require('node-fetch');

// NOTE: No cache for this example to ensure we always see fresh data for debugging.
// In a real app, you would add your external cache (like Redis) here.

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    const { ticker } = event.queryStringParameters || {};
    if (!ticker) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker is required' }) };
    }

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'API Key not configured' }) };
    }

    const baseUrl = 'https://financialmodelingprep.com/api/v3';
    
    // Define all necessary API endpoints
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const quoteUrl = `${baseUrl}/quote/${ticker}?apikey=${apiKey}`;
    const cashflowUrl = `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    // --- RE-ADD the Income Statement for our fallback ---
    const incomeUrl = `${baseUrl}/income-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;

    try {
        const apiCalls = [
            fetch(profileUrl),
            fetch(balanceSheetUrl),
            fetch(quoteUrl),
            fetch(cashflowUrl),
            fetch(incomeUrl) // --- RE-ADD ---
        ];
        
        const responses = await Promise.all(apiCalls);
        
        for (const response of responses) {
            if (!response.ok) {
                throw new Error(`API call failed with status ${response.status}`);
            }
        }

        const [profileData, balanceSheetData, quoteData, cashflowData, incomeData] = 
            await Promise.all(responses.map(r => r.json()));

        // More robust validation
        if (!profileData?.[0]) throw new Error('No profile data found.');
        if (!balanceSheetData?.[0]) throw new Error('No balance sheet data found.');
        if (!quoteData?.[0]) throw new Error('No quote data found.');
        if (!cashflowData?.[0]) throw new Error('No cash flow statement data found.');
        if (!incomeData?.[0]) throw new Error('No income statement data found.');

        const profile = profileData[0];
        const balance = balanceSheetData[0];
        const quote = quoteData[0];
        const cashflowStatement = cashflowData[0];
        const incomeStatement = incomeData[0]; // --- NEW: Get income statement data ---

        // --- UPDATED: Accurate FCF Calculation ---
        const operatingCashFlow = cashflowStatement.operatingCashFlow || 0;
        const capitalExpenditure = cashflowStatement.capitalExpenditure || 0;
        const accurateFCF = operatingCashFlow - capitalExpenditure;

        // --- UPDATED: Implement the revenue fallback ---
        const revenue = incomeStatement.revenue || cashflowStatement.revenue || 0;

        const combinedData = {
            profile: { ...profile, price: quote.price, sharesOutstanding: quote.sharesOutstanding },
            cashflow: [{
                freeCashFlow: accurateFCF,
                revenue: revenue, // Use our new robust revenue variable
                netIncome: incomeStatement.netIncome, // Get Net Income from Income Statement
            }],
            balanceSheet: balance,
            note: "FCF is calculated from the annual Cash Flow Statement."
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(combinedData)
        };

    } catch (error) {
        console.error('Error in function:', error);
        return {
            statusCode: 502, // 502 indicates a bad response from the upstream API
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};