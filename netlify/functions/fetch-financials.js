const fetch = require('node-fetch');

// No changes to PEER_MAP
const PEER_MAP = {
    'AAPL': ['MSFT', 'GOOGL'], 'MSFT': ['AAPL', 'GOOGL'], 'GOOGL': ['MSFT', 'META'],
    'META': ['GOOGL', 'SNAP'], 'AMZN': ['WMT', 'COST'], 'TSLA': ['F', 'GM'],
    'JNJ': ['PFE', 'MRK'], 'WMT': ['TGT', 'COST'], 'COST': ['WMT', 'TGT'],
    'TGT': ['WMT', 'COST'], 'PFE': ['JNJ', 'MRK'],
};

// --- NEW: This function fetches a rich dataset for comparison ---
async function getCompanyData(ticker, apiKey) {
    const baseUrl = 'https://financialmodelingprep.com/api';
    const urls = [
        `${baseUrl}/v3/profile/${ticker}?apikey=${apiKey}`,
        `${baseUrl}/v3/ratios-ttm/${ticker}?apikey=${apiKey}`,
        `${baseUrl}/v3/key-metrics-ttm/${ticker}?apikey=${apiKey}`,
        `${baseUrl}/v3/enterprise-values/${ticker}?limit=1&apikey=${apiKey}`,
        `${baseUrl}/v3/cash-flow-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`
    ];
    
    const [profileRes, ratiosRes, keyMetricsRes, enterpriseValueRes, cashflowRes] = await Promise.all(urls.map(url => fetch(url).then(res => res.json())));

    // Helper to safely access the first element if the API returns an array
    const getData = (res) => Array.isArray(res) ? res[0] : res;

    const profile = getData(profileRes);
    const ratios = getData(ratiosRes);
    const keyMetrics = getData(keyMetricsRes);
    const enterpriseValue = getData(enterpriseValueRes);
    const cashflow = getData(cashflowRes);

    if (!profile || !ratios || !keyMetrics || !enterpriseValue || !cashflow) {
        console.warn(`Incomplete data for ticker: ${ticker}`);
        return null;
    }
    
    const fcf = (cashflow.operatingCashFlow || 0) - (cashflow.capitalExpenditure || 0);
    const totalRevenue = (keyMetrics.revenuePerShareTTM * profile.sharesOutstanding) || 0;


    return {
        ticker: profile.symbol,
        peRatio: ratios.peRatioTTM,
        psRatio: ratios.priceToSalesRatioTTM,
        evToEbitda: keyMetrics.evToEbitdaTTM,
        fcfMargin: totalRevenue > 0 ? fcf / totalRevenue : 0,
        grossMargin: ratios.grossProfitMarginTTM,
        operatingMargin: ratios.operatingMarginTTM,
        roe: ratios.returnOnEquityTTM,
        debtToEquity: ratios.debtEquityRatioTTM,
        currentRatio: ratios.currentRatioTTM
    };
}


exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    const { ticker } = event.queryStringParameters || {};
    if (!ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker is required' }) };

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API Key not configured' }) };

    try {
        // --- Fetch all other necessary data for the main ticker (non-comparison parts) ---
        const baseUrl = 'https://financialmodelingprep.com/api/v3';
        const [profileRes, quoteRes, balanceSheetRes, incomeHistRes, cashflowHistRes] = await Promise.all([
            fetch(`${baseUrl}/profile/${ticker}?apikey=${apiKey}`).then(res => res.json()),
            fetch(`${baseUrl}/quote/${ticker}?apikey=${apiKey}`).then(res => res.json()),
            fetch(`${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`).then(res => res.json()),
            fetch(`${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`).then(res => res.json()),
            fetch(`${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`).then(res => res.json())
        ]);
        
        const getData = (res) => Array.isArray(res) ? res[0] : res;
        const profile = getData(profileRes);
        const quote = getData(quoteRes);
        const balanceSheet = getData(balanceSheetRes);
        const historicalIncomeData = incomeHistRes; // Already an array
        const historicalCashflowData = cashflowHistRes; // Already an array

        if (!profile || !balanceSheet || !historicalIncomeData || historicalIncomeData.length === 0) {
            throw new Error('Could not retrieve complete primary financial data for the ticker.');
        }

        // --- NEW: Rich comparison data fetching ---
        const primaryDataForComparison = await getCompanyData(ticker, apiKey);
        const peers = PEER_MAP[ticker.toUpperCase()] || [];
        const peerPromises = peers.map(peerTicker => getCompanyData(peerTicker, apiKey));
        const peerData = (await Promise.all(peerPromises)).filter(p => p !== null); // Filter out any peers that failed

        const latestIncome = historicalIncomeData[0];
        const latestCashflow = historicalCashflowData[0];
        const accurateFCF = (latestCashflow.operatingCashFlow || 0) - (latestCashflow.capitalExpenditure || 0);

        const combinedData = {
            profile: { ...profile, price: quote?.price || profile?.price, sharesOutstanding: quote?.sharesOutstanding || profile?.sharesOutstanding },
            currentFinancials: { revenue: latestIncome.revenue, freeCashFlow: accurateFCF },
            balanceSheet: balanceSheet,
            historicalData: { incomeStatements: historicalIncomeData, cashflowStatements: historicalCashflowData },
            // --- NEW: Attach the rich comparison data to the final payload ---
            comparisonData: {
                primary: primaryDataForComparison,
                peers: peerData
            }
        };

        return { statusCode: 200, headers, body: JSON.stringify(combinedData) };

    } catch (error) {
        console.error('Error in function:', error);
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Function error: ${error.message}` }) };
    }
};