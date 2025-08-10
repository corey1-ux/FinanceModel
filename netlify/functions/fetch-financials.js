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
        const primaryUrls = [
            `${baseUrl}/profile/${ticker}?apikey=${apiKey}`,
            `${baseUrl}/quote/${ticker}?apikey=${apiKey}`,
            `${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${apiKey}`,
            `${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`,
            `${baseUrl}/cash-flow-statement/${ticker}?period=annual&limit=5&apikey=${apiKey}`
        ];
        const primaryPromises = primaryUrls.map(url => fetch(url).then(res => res.json()));
        
        const [
            profileData,
            quoteData,
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
        const quote = quoteData[0];
        const latestIncome = historicalIncomeData[0];
        const latestCashflow = historicalCashflowData[0];

        const operatingCashFlow = latestCashflow.operatingCashFlow || 0;
        const capitalExpenditure = latestCashflow.capitalExpenditure || 0;
        const accurateFCF = operatingCashFlow - capitalExpenditure;
        
        const combinedProfile = {
            ...profile,
            price: quote?.price || profile?.price,
            sharesOutstanding: quote?.sharesOutstanding || profile?.sharesOutstanding || profile?.weightedAverageShsOut || 0
        };

        const combinedData = {
            profile: combinedProfile,
            currentFinancials: {
                revenue: latestIncome.revenue,
                freeCashFlow: accurateFCF
            },
            balanceSheet: balanceSheetData[0],
            historicalData: {
                incomeStatements: historicalIncomeData,
                cashflowStatements: historicalCashflowData
            },
            // --- UPDATED: More robust peer data processing ---
            peers: peerData.map((p, i) => {
                const metrics = p[0]; // The API returns an array with one object
                if (!metrics) {
                    // If API fails for a peer, return empty data
                    return { ticker: peers[i], peRatio: null, fcfMargin: 0, growth: 0 };
                }

                // Safely calculate FCF Margin
                const fcfYield = metrics.freeCashFlowYieldTTM || 0;
                const marketCap = metrics.marketCapTTM || 0;
                const revenue = metrics.revenueTTM || 0;
                const fcfMargin = revenue > 0 ? (fcfYield * marketCap) / revenue : 0;
                
                return {
                    ticker: peers[i],
                    peRatio: metrics.peRatioTTM,
                    fcfMargin: fcfMargin,
                    growth: (metrics.revenueGrowthTTM || 0) * 100 // Use 0 if growth is not provided
                };
            })
        };

        return { statusCode: 200, headers, body: JSON.stringify(combinedData) };

    } catch (error) {
        console.error('Error in function:', error);
        return { statusCode: 502, headers, body: JSON.stringify({ error: error.message }) };
    }
};