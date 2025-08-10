// Enhanced API Integration with Automated Assumptions
async function fetchFinancialData() {
  const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
  if (!ticker) {
    showStatus('Please enter a stock ticker.', 'error');
    return;
  }

  const loader = document.getElementById('api-loader');
  const btnText = document.querySelector('.fetch-btn .btn-text');
  const fetchButton = document.getElementById('fetch-button');
  
  loader.style.display = 'block';
  btnText.textContent = 'Fetching & Analyzing...';
  fetchButton.disabled = true;

  try {
    // Fetch current data + 5 years of historical data
    const response = await fetch(`/.netlify/functions/fetch-financials?ticker=${ticker}&historical=true`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const { profile, cashflow, balanceSheet, historicalIncome } = data;

    // Populate basic financial data (existing code)
    populateBasicFinancialData(profile, cashflow, balanceSheet);
    
    // NEW: Auto-calculate growth assumptions
    const assumptions = calculateAutomatedAssumptions(profile, historicalIncome);
    populateGrowthAssumptions(assumptions);

    showStatus(`✅ Successfully loaded data and calculated assumptions for ${profile.companyName}`, 'success');

  } catch (error) {
    console.error('Error fetching financial data:', error);
    showStatus(`❌ Failed to fetch data: ${error.message}`, 'error');
  } finally {
    loader.style.display = 'none';
    btnText.textContent = 'Fetch Financial Data';
    fetchButton.disabled = false;
  }
}

// Calculate intelligent growth assumptions
function calculateAutomatedAssumptions(profile, historicalIncome) {
  console.log('Calculating automated assumptions...');
  
  // 1. Calculate Historical Revenue Growth
  const revenueGrowthRates = calculateHistoricalGrowth(historicalIncome);
  console.log('Historical revenue growth rates:', revenueGrowthRates);
  
  // 2. Industry-based adjustments
  const industryAdjustments = getIndustryAdjustments(profile.sector, profile.industry);
  console.log('Industry adjustments:', industryAdjustments);
  
  // 3. Calculate WACC using Beta
  const wacc = calculateWACC(profile.beta);
  console.log('Calculated WACC:', wacc);
  
  // 4. Apply smoothing and reasonableness checks
  const smoothedGrowth = applyGrowthSmoothing(revenueGrowthRates, industryAdjustments);
  
  return {
    revenueGrowth15: Math.min(Math.max(smoothedGrowth.nearTerm, 0), 50), // Cap between 0-50%
    revenueGrowth610: Math.min(Math.max(smoothedGrowth.longTerm, 0), 15), // Cap between 0-15%
    terminalGrowth: 2.5, // Conservative default
    discountRate: wacc,
    confidence: smoothedGrowth.confidence, // How reliable the estimates are
    rationale: smoothedGrowth.rationale // Explanation for user
  };
}

// Calculate historical revenue growth rates
function calculateHistoricalGrowth(historicalIncome) {
  if (!historicalIncome || historicalIncome.length < 3) {
    return { average: 5, median: 5, recent: 5, trend: 'insufficient_data' };
  }
  
  // Sort by date (most recent first)
  const sortedData = historicalIncome
    .filter(item => item.revenue && item.revenue > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5); // Last 5 years max
  
  if (sortedData.length < 2) {
    return { average: 5, median: 5, recent: 5, trend: 'insufficient_data' };
  }
  
  // Calculate year-over-year growth rates
  const growthRates = [];
  for (let i = 0; i < sortedData.length - 1; i++) {
    const currentRevenue = sortedData[i].revenue;
    const previousRevenue = sortedData[i + 1].revenue;
    const growthRate = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    growthRates.push(growthRate);
  }
  
  // Calculate statistics
  const averageGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
  const medianGrowth = growthRates.sort((a, b) => a - b)[Math.floor(growthRates.length / 2)];
  const recentGrowth = growthRates[0]; // Most recent year
  
  // Determine trend
  const isAccelerating = growthRates.length >= 3 && growthRates[0] > growthRates[1] && growthRates[1] > growthRates[2];
  const isDecelerating = growthRates.length >= 3 && growthRates[0] < growthRates[1] && growthRates[1] < growthRates[2];
  
  return {
    rates: growthRates,
    average: averageGrowth,
    median: medianGrowth,
    recent: recentGrowth,
    trend: isAccelerating ? 'accelerating' : isDecelerating ? 'decelerating' : 'stable',
    volatility: calculateVolatility(growthRates)
  };
}

// Industry-based growth expectations
function getIndustryAdjustments(sector, industry) {
  const sectorDefaults = {
    'Technology': { growth: 12, maturity: 6, volatility: 'high' },
    'Healthcare': { growth: 8, maturity: 5, volatility: 'medium' },
    'Financial Services': { growth: 6, maturity: 4, volatility: 'medium' },
    'Consumer Cyclical': { growth: 7, maturity: 4, volatility: 'high' },
    'Consumer Defensive': { growth: 4, maturity: 3, volatility: 'low' },
    'Industrials': { growth: 6, maturity: 4, volatility: 'medium' },
    'Energy': { growth: 5, maturity: 3, volatility: 'very_high' },
    'Utilities': { growth: 3, maturity: 2, volatility: 'low' },
    'Real Estate': { growth: 4, maturity: 3, volatility: 'medium' },
    'Materials': { growth: 5, maturity: 3, volatility: 'high' },
    'Communication Services': { growth: 8, maturity: 5, volatility: 'medium' }
  };
  
  // Default to moderate growth if sector not found
  return sectorDefaults[sector] || { growth: 6, maturity: 4, volatility: 'medium' };
}

// Calculate WACC using beta and market assumptions
function calculateWACC(beta) {
  const riskFreeRate = 4.5; // Current 10-year Treasury (update periodically)
  const marketRiskPremium = 5.5; // Historical equity risk premium
  const costOfEquity = riskFreeRate + (beta * marketRiskPremium);
  
  // Add small company premium if needed
  let wacc = costOfEquity;
  if (wacc < 8) wacc = 8; // Minimum for equity investments
  if (wacc > 15) wacc = 15; // Cap for very risky companies
  
  return Math.round(wacc * 10) / 10; // Round to 1 decimal
}

// Apply smoothing and create final recommendations
function applyGrowthSmoothing(historical, industry) {
  const confidence = historical.trend === 'insufficient_data' ? 'low' : 
                    historical.volatility > 20 ? 'medium' : 'high';
  
  let nearTermGrowth, longTermGrowth;
  let rationale = [];
  
  if (historical.trend === 'insufficient_data') {
    // Use pure industry defaults
    nearTermGrowth = industry.growth;
    longTermGrowth = industry.maturity;
    rationale.push(`Using industry defaults due to limited historical data`);
  } else {
    // Blend historical with industry expectations
    const historicalWeight = confidence === 'high' ? 0.7 : 0.5;
    const industryWeight = 1 - historicalWeight;
    
    nearTermGrowth = (historical.median * historicalWeight) + (industry.growth * industryWeight);
    longTermGrowth = (historical.median * 0.6 * historicalWeight) + (industry.maturity * industryWeight);
    
    rationale.push(`Blended historical (${(historicalWeight*100).toFixed(0)}%) and industry estimates`);
    rationale.push(`Historical median growth: ${historical.median.toFixed(1)}%`);
    rationale.push(`Trend: ${historical.trend}, Volatility: ${historical.volatility.toFixed(1)}%`);
  }
  
  // Apply conservatism
  nearTermGrowth *= 0.9; // 10% haircut for conservatism
  longTermGrowth *= 0.9;
  
  rationale.push(`Applied 10% conservatism discount`);
  
  return {
    nearTerm: Math.round(nearTermGrowth * 10) / 10,
    longTerm: Math.round(longTermGrowth * 10) / 10,
    confidence,
    rationale: rationale.join('; ')
  };
}

// Populate the growth assumptions in the UI
function populateGrowthAssumptions(assumptions) {
  document.getElementById('revenue-growth-1-5').value = assumptions.revenueGrowth15.toFixed(1);
  document.getElementById('revenue-growth-6-10').value = assumptions.revenueGrowth610.toFixed(1);
  document.getElementById('terminal-growth').value = assumptions.terminalGrowth.toFixed(1);
  document.getElementById('discount-rate').value = assumptions.discountRate.toFixed(1);
  
  // Show explanation to user
  showStatus(`🤖 Auto-calculated assumptions (${assumptions.confidence} confidence): ${assumptions.rationale}`, 'success');
  
  // Log for debugging
  console.log('Applied assumptions:', assumptions);
}

// Utility function
function calculateVolatility(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}
