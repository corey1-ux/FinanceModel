// Smart automation using ONLY existing API data (no extra calls)
function autoCalculateAssumptions() {
  const profile = window.lastFetchedData?.profile;
  
  if (!profile) {
    showStatus('Please fetch financial data first', 'error');
    return;
  }
  
  console.log('Auto-calculating assumptions using existing data...');
  
  // 1. Use Beta for WACC calculation
  const wacc = calculateWACCFromBeta(profile.beta);
  
  // 2. Use Sector/Industry for growth estimates
  const growthEstimates = getIndustryGrowthEstimates(profile.sector, profile.industry);
  
  // 3. Use Market Cap size for risk adjustment
  const sizeAdjustment = getSizeAdjustment(profile.mktCap);
  
  // 4. Apply adjustments
  const finalAssumptions = {
    revenueGrowth15: Math.round((growthEstimates.nearTerm * sizeAdjustment.growth) * 10) / 10,
    revenueGrowth610: Math.round((growthEstimates.longTerm * sizeAdjustment.growth) * 10) / 10,
    terminalGrowth: 2.5,
    discountRate: Math.round((wacc * sizeAdjustment.risk) * 10) / 10
  };
  
  // 5. Populate fields
  document.getElementById('revenue-growth-1-5').value = finalAssumptions.revenueGrowth15;
  document.getElementById('revenue-growth-6-10').value = finalAssumptions.revenueGrowth610;
  document.getElementById('terminal-growth').value = finalAssumptions.terminalGrowth;
  document.getElementById('discount-rate').value = finalAssumptions.discountRate;
  
  // 6. Show explanation
  const explanation = `🤖 Auto-calculated: ${profile.sector} sector, $${(profile.mktCap/1e9).toFixed(0)}B market cap, ${profile.beta} beta → ${finalAssumptions.revenueGrowth15}% near-term growth, ${finalAssumptions.discountRate}% WACC`;
  showStatus(explanation, 'success');
  
  console.log('Applied assumptions:', finalAssumptions);
}

// Calculate WACC using only Beta (no extra API calls)
function calculateWACCFromBeta(beta) {
  const riskFreeRate = 4.5; // Update this periodically (10-year Treasury)
  const marketRiskPremium = 5.5; // Historical average
  
  if (!beta || beta <= 0) beta = 1.0; // Default if missing
  
  const costOfEquity = riskFreeRate + (beta * marketRiskPremium);
  return Math.min(Math.max(costOfEquity, 7), 15); // Cap between 7-15%
}

// Industry growth estimates (no API needed)
function getIndustryGrowthEstimates(sector, industry) {
  const sectorGrowth = {
    'Technology': { nearTerm: 12, longTerm: 6 },
    'Healthcare': { nearTerm: 8, longTerm: 5 },
    'Financial Services': { nearTerm: 6, longTerm: 4 },
    'Consumer Cyclical': { nearTerm: 7, longTerm: 4 },
    'Consumer Defensive': { nearTerm: 4, longTerm: 3 },
    'Industrials': { nearTerm: 6, longTerm: 4 },
    'Energy': { nearTerm: 5, longTerm: 3 },
    'Utilities': { nearTerm: 3, longTerm: 2 },
    'Real Estate': { nearTerm: 4, longTerm: 3 },
    'Materials': { nearTerm: 5, longTerm: 3 },
    'Communication Services': { nearTerm: 8, longTerm: 5 }
  };
  
  // Fine-tune by specific industry if needed
  const industryAdjustments = {
    'Software': 1.3,
    'Semiconductors': 1.2,
    'Biotechnology': 1.4,
    'Airlines': 0.8,
    'Utilities': 0.7,
    'Banks': 0.9
  };
  
  const baseGrowth = sectorGrowth[sector] || { nearTerm: 6, longTerm: 4 };
  const industryMultiplier = industryAdjustments[industry] || 1.0;
  
  return {
    nearTerm: baseGrowth.nearTerm * industryMultiplier,
    longTerm: baseGrowth.longTerm * industryMultiplier
  };
}

// Adjust for company size (larger = more stable, lower growth)
function getSizeAdjustment(marketCap) {
  const capInBillions = marketCap / 1e9;
  
  if (capInBillions > 500) {
    // Mega cap (Apple, Microsoft, etc.)
    return { growth: 0.8, risk: 0.9 };
  } else if (capInBillions > 100) {
    // Large cap
    return { growth: 0.9, risk: 0.95 };
  } else if (capInBillions > 10) {
    // Mid cap
    return { growth: 1.0, risk: 1.0 };
  } else if (capInBillions > 2) {
    // Small cap
    return { growth: 1.1, risk: 1.1 };
  } else {
    // Micro cap
    return { growth: 1.2, risk: 1.2 };
  }
}

// Store fetched data globally for automation
let lastFetchedData = null;

// Modified fetch function to store data
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
  btnText.textContent = 'Fetching...';
  fetchButton.disabled = true;

  try {
    const response = await fetch(`/.netlify/functions/fetch-financials?ticker=${ticker}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Store data globally for automation
    window.lastFetchedData = data;
    
    const { profile, cashflow, balanceSheet } = data;

    // Debug: Log all available fields
    console.log('Profile data fields:', Object.keys(profile));
    console.log('Full profile data:', profile);

    // Calculate TTM
    const ttmRevenue = cashflow.reduce((acc, quarter) => acc + (quarter.revenue || 0), 0);
    const ttmFcf = cashflow.reduce((acc, quarter) => acc + (quarter.freeCashFlow || 0), 0);

    // Populate UI fields
    document.getElementById('company-name').value = profile.companyName || 'N/A';
    document.getElementById('current-price').value = profile.price ? profile.price.toFixed(2) : '0';
    
    // Try multiple possible field names for shares outstanding
    let sharesOutstanding = profile.sharesOutstanding || 
                           profile.weightedAverageShsOut || 
                           profile.weightedAverageShsOutDil || 
                           profile.shares || 
                           0;
    
    console.log('Shares outstanding found:', sharesOutstanding);
    
    const sharesInBillion = sharesOutstanding ? (sharesOutstanding / 1_000_000_000).toFixed(2) : '0';
    console.log('Shares in billion calculated:', sharesInBillion);
    document.getElementById('shares-outstanding').value = sharesInBillion;
    console.log('Shares outstanding field populated with:', document.getElementById('shares-outstanding').value);
    document.getElementById('shares-unit').value = 'billion';

    document.getElementById('current-revenue').value = (ttmRevenue / 1_000_000_000).toFixed(2);
    document.getElementById('revenue-unit').value = 'billion';
    
    document.getElementById('free-cash-flow').value = (ttmFcf / 1_000_000_000).toFixed(2);
    document.getElementById('fcf-unit').value = 'billion';

    document.getElementById('total-debt').value = (balanceSheet.totalDebt / 1_000_000_000).toFixed(2);
    document.getElementById('debt-unit').value = 'billion';

    document.getElementById('cash-equivalents').value = (balanceSheet.cashAndCashEquivalents / 1_000_000_000).toFixed(2);
    document.getElementById('cash-unit').value = 'billion';

    showStatus(`✅ Successfully loaded data for ${profile.companyName}. Click "Auto-Calculate Assumptions" for smart defaults.`, 'success');

  } catch (error) {
    console.error('Error fetching financial data:', error);
    showStatus(`❌ Failed to fetch data: ${error.message}`, 'error');
  } finally {
    loader.style.display = 'none';
    btnText.textContent = 'Fetch Financial Data';
    fetchButton.disabled = false;
  }
}
