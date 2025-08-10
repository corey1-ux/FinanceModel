const fetch = require('node-fetch');

const PEER_MAP = {
    'AAPL': ['MSFT', 'GOOGL'],
    'MSFT': ['AAPL', 'GOOGL'],
    'GOOGL': ['MSFT', 'META'],
    'META': ['GOOGL', 'SNAP'],
    'AMZN': ['WMT', 'COST'],
    'TSLA': ['F', 'GM'],
    'JNJ': ['PFE', 'MRK'],
    'WMT': ['TGT', 'COST'],
    'COST': ['WMT', 'TGT'],
    'TGT': ['WMT', 'COST'],
    'PFE': ['JNJ', 'MRK'],
};

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };

    const { ticker } = event.queryStringParameters || {};
    if (!ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ticker is required' }) };

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API Key not configured' }) };

    const baseUrl = 'https://financialmodelingprep.com/api/v3';

    try {
        // --- UPDATED: Re-add the /quote endpoint for more robust data ---
        const primaryUrls = [
            `${baseUrl}/profile/${ticker}?apikey=${apiKey}`,
            `${baseUrl}/quote/${ticker}?apikey=${apiKey}`, // --- RE-ADDED ---
            `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`,
            `${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`,
            `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`
        ];
        const primaryPromises = primaryUrls.map(url => fetch(url).then(res => res.json()));
        
        // --- UPDATED: Handle the new quote data ---
        const [
            profileData,
            quoteData, // --- RE-ADDED ---
            balanceSheetData,
            historicalIncomeData,
            historicalCashflowData
        ] = await Promise.all(primaryPromises);
        
        const peers = PEER_MAP[ticker.toUpperCase()] || [];
        let peerData = [];
        if (peers.length > 0) {
            const peerPromises = peers.map(peerTicker => {
                const url = `${baseUrl}/key-metrics-ttm/${peerTicker}?apikey=${apiKey}`;
                return fetch(url).then(res => res.json());
            });
            peerData = await Promise.all(peerPromises);
        }

        const profile = profileData[0];
        const quote = quoteData[0]; // --- RE-ADDED ---
        const latestIncome = historicalIncomeData[0];
        const latestCashflow = historicalCashflowData[0];

        const operatingCashFlow = latestCashflow.operatingCashFlow || 0;
        const capitalExpenditure = latestCashflow.capitalExpenditure || 0;
        const accurateFCF = operatingCashFlow - capitalExpenditure;
        
        // --- UPDATED: Intelligently combine profile and quote data ---
        const combinedProfile = {
            ...profile,
            price: quote?.price || profile?.price,
            sharesOutstanding: quote?.sharesOutstanding || profile?.sharesOutstanding || profile?.weightedAverageShsOut || 0
        };

        const combinedData = {
            profile: combinedProfile, // Use our new combined profile
            currentFinancials: {
                revenue: latestIncome.revenue,
                freeCashFlow: accurateFCF
            },
            balanceSheet: balanceSheetData[0],
            historicalData: {
                incomeStatements: historicalIncomeData,
                cashflowStatements: historicalCashflowData
            },
            peers: peerData.map((p, i) => ({
                ticker: peers[i],
                peRatio: p[0]?.peRatioTTM,
                fcfMargin: (p[0]?.freeCashFlowYieldTTM * p[0]?.marketCapTTM) / p[0]?.revenueTTM,
                growth: p[0]?.revenueGrowthTTM * 100
            }))
        };

        return { statusCode: 200, headers, body: JSON.stringify(combinedData) };

    } catch (error) {
        console.error('Error in function:', error);
        return { statusCode: 502, headers, body: JSON.stringify({ error: error.message }) };
    }
};