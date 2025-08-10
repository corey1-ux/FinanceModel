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

        // --- UPDATED: "No Shortcuts" Peer Data Fetching ---
        if (peers.length > 0) {
            const peerPromises = peers.flatMap(peerTicker => [
                fetch(`${baseUrl}/profile/${peerTicker}?apikey=${apiKey}`).then(res => res.json()),
                fetch(`${baseUrl}/cash-flow-statement/${peerTicker}?period=annual&limit=1&apikey=${apiKey}`).then(res => res.json())
            ]);

            const allPeerData = await Promise.all(peerPromises);

            peerData = peers.map((peerTicker, i) => {
                const peerProfile = allPeerData[i * 2]?.[0];
                const peerCashflow = allPeerData[i * 2 + 1]?.[0];

                if (!peerProfile || !peerCashflow) {
                    return { ticker: peerTicker, peRatio: null, fcfMargin: 0 };
                }

                // Calculate FCF Margin from raw statement data
                const revenue = peerCashflow.revenue || 0;
                const fcf = (peerCashflow.operatingCashFlow || 0) - (peerCashflow.capitalExpenditure || 0);
                const fcfMargin = revenue > 0 ? fcf / revenue : 0;

                return {
                    ticker: peerTicker,
                    peRatio: peerProfile.pe,
                    fcfMargin: fcfMargin
                };
            });
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
            peers: peerData
        };

        return { statusCode: 200, headers, body: JSON.stringify(combinedData) };

    } catch (error) {
        console.error('Error in function:', error);
        return { statusCode: 502, headers, body: JSON.stringify({ error: error.message }) };
    }
};