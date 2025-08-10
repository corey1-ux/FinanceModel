const fetch = require('node-fetch');

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
    
    // --- UPDATED: Fetch 5 years for historical statements ---
    const profileUrl = `${baseUrl}/profile/${ticker}?apikey=${apiKey}`;
    const balanceSheetUrl = `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const quoteUrl = `${baseUrl}/quote/${ticker}?apikey=${apiKey}`;
    const cashflowUrl = `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const incomeUrl = `${baseUrl}/income-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`;
    const historicalIncomeUrl = `${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`;
    const historicalCashflowUrl = `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`;

    try {
        const apiCalls = [
            fetch(profileUrl),
            fetch(balanceSheetUrl),
            fetch(quoteUrl),
            fetch(cashflowUrl),
            fetch(incomeUrl),
            fetch(historicalIncomeUrl), // --- NEW ---
            fetch(historicalCashflowUrl) // --- NEW ---
        ];
        
        const responses = await Promise.all(apiCalls);
        
        for (const response of responses) {
            if (!response.ok) {
                throw new Error(`API call failed with status ${response.status}`);
            }
        }

        const [
            profileData, 
            balanceSheetData, 
            quoteData, 
            cashflowData, 
            incomeData,
            historicalIncomeData, // --- NEW ---
            historicalCashflowData // --- NEW ---
        ] = await Promise.all(responses.map(r => r.json()));

        // --- (Validation remains the same) ---
        if (!profileData?.[0]) throw new Error('No profile data found.');
        if (!balanceSheetData?.[0]) throw new Error('No balance sheet data found.');
        if (!quoteData?.[0]) throw new Error('No quote data found.');
        if (!cashflowData?.[0]) throw new Error('No cash flow statement data found.');
        if (!incomeData?.[0]) throw new Error('No income statement data found.');

        // --- (Current data extraction remains the same) ---
        const profile = profileData[0];
        const balance = balanceSheetData[0];
        const quote = quoteData[0];
        const cashflowStatement = cashflowData[0];
        const incomeStatement = incomeData[0];

        const operatingCashFlow = cashflowStatement.operatingCashFlow || 0;
        const capitalExpenditure = cashflowStatement.capitalExpenditure || 0;
        const accurateFCF = operatingCashFlow - capitalExpenditure;
        const revenue = incomeStatement.revenue || cashflowStatement.revenue || 0;

        const combinedData = {
            profile: { ...profile, price: quote.price, sharesOutstanding: quote.sharesOutstanding },
            currentFinancials: { // --- UPDATED: Nest current financials for clarity ---
                freeCashFlow: accurateFCF,
                revenue: revenue,
                netIncome: incomeStatement.netIncome,
            },
            balanceSheet: balance,
            // --- NEW: Add the historical data object ---
            historicalData: {
                incomeStatements: historicalIncomeData,
                cashflowStatements: historicalCashflowData
            },
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
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};