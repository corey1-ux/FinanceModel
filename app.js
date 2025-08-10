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
  const explanation = `🤖 Auto-calculated: ${profile.sector} sector, ${(profile.mktCap/1e9).toFixed(0)}B market cap, ${profile.beta} beta → ${finalAssumptions.revenueGrowth15}% near-term growth, ${finalAssumptions.discountRate}% WACC`;
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
// Utility Functions
function toNumber(v) { 
  return (v === null || v === undefined || v === '') ? NaN : Number(v); 
}

function convertToMillions(value, unit) {
  const num = toNumber(value);
  if (!isFinite(num)) return 0;
  return unit === 'billion' ? num * 1000 : num;
}

function isFiniteNumber(x) { 
  return Number.isFinite(x) && !Number.isNaN(x); 
}

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('fetch-status');
  statusDiv.className = type === 'error' ? 'error-message' : 'success-message';
  statusDiv.textContent = message;
  setTimeout(() => statusDiv.textContent = '', 5000);
}

// Store fetched data globally for automation
let lastFetchedData = null;

// Enhanced API Integration with stored data for automation
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
    // THIS IS THE CALL TO YOUR BACKEND NETLIFY FUNCTION
    const response = await fetch(`/.netlify/functions/fetch-financials?ticker=${ticker}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Store data globally for automation
    window.lastFetchedData = data;
    
    const { profile, cashflow, balanceSheet } = data;

    // Calculate TTM from the single object returned
    const ttmRevenue = cashflow[0].revenue || 0;
    const ttmFcf = cashflow[0].freeCashFlow || 0;

    // Populate UI fields
    document.getElementById('company-name').value = profile.companyName || 'N/A';
    document.getElementById('current-price').value = profile.price ? profile.price.toFixed(2) : '0';
    
    let sharesOutstanding = profile.sharesOutstanding || 0;
    
    const sharesInBillion = sharesOutstanding ? (sharesOutstanding / 1_000_000_000).toFixed(2) : '0';
    document.getElementById('shares-outstanding').value = sharesInBillion;
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

// UI Functions
function showScenario(scenario, el) {
  document.querySelectorAll('.scenario-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.scenario-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(scenario + '-scenario');
  if (target) target.classList.add('active');
}

// DCF Calculation
function performDCFCalculation(data) {
  const currentFCF = data.freeCashFlow;
  const fcfMargin = data.currentRevenue > 0 ? currentFCF / data.currentRevenue : 0;
  
  const projections = { revenues: [], fcf: [], pv: [] };
  let totalPVFCF = 0;
  let lastProjectedRevenue = data.currentRevenue;

  // Project 10 years of cash flows
  for (let year = 1; year <= 10; year++) {
    const growthRate = year <= 5 ? data.revenueGrowth15 : data.revenueGrowth610;
    const revenue = lastProjectedRevenue * (1 + growthRate);
    lastProjectedRevenue = revenue;
    
    const fcf = revenue * (fcfMargin + (year * 0.0005));
    
    const pvFactor = 1 / Math.pow(1 + data.discountRate, year);
    const pv = fcf * pvFactor;
    
    if (year <= 5) {
      projections.revenues.push(revenue);
      projections.fcf.push(fcf);
      projections.pv.push(pv);
    }
    totalPVFCF += pv;
  }

  // Terminal value calculation
  const lastYearFCF = lastProjectedRevenue * (fcfMargin + (10 * 0.0005));
  const terminalFCF = lastYearFCF * (1 + data.terminalGrowth);
  
  let terminalValue;
  const denom = data.discountRate - data.terminalGrowth;
  if (denom <= 0.001) {
    terminalValue = terminalFCF * 15;
    console.warn('Terminal growth rate too high. Using 15x exit multiple.');
  } else {
    terminalValue = terminalFCF / denom;
  }
  
  const pvTerminal = terminalValue / Math.pow(1 + data.discountRate, 10);
  const enterpriseValue = totalPVFCF + pvTerminal;
  const netDebt = data.totalDebt - data.cashEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const fairValuePerShare = data.sharesOutstanding !== 0 ? equityValue / data.sharesOutstanding : 0;
  
  projections.terminalFCF = terminalFCF;
  projections.pvTerminal = pvTerminal;

  return {
    currentFCF, enterpriseValue, netDebt, equityValue, fairValuePerShare,
    terminalValue, pvTerminal, totalPVFCF, projections
  };
}

// UI Update Functions
let currentData = {};

function updateResults(results) {
  document.getElementById('current-fcf').textContent = `$${Math.round(results.currentFCF).toLocaleString()}M`;
  document.getElementById('enterprise-value').textContent = `$${Math.round(results.enterpriseValue).toLocaleString()}M`;
  document.getElementById('net-debt').textContent = `$${Math.round(results.netDebt).toLocaleString()}M`;
  document.getElementById('equity-value').textContent = `$${Math.round(results.equityValue).toLocaleString()}M`;
  document.getElementById('fair-value').textContent = `$${results.fairValuePerShare.toFixed(2)}`;
  
  if (isFiniteNumber(currentData.currentPrice) && currentData.currentPrice > 0) {
    const upside = ((results.fairValuePerShare - currentData.currentPrice) / currentData.currentPrice * 100);
    const comparison = upside >= 0 ? `${upside.toFixed(1)}% upside` : `${Math.abs(upside).toFixed(1)}% downside`;
    const el = document.getElementById('vs-current-price');
    el.textContent = `vs Current $${currentData.currentPrice.toFixed(2)}: ${comparison}`;
    el.className = upside >= 0 ? 'positive' : 'negative';
  }
}

function updateScenarioResults(bear, base, bull) {
  document.getElementById('bear-value').textContent = `$${bear.toFixed(2)}`;
  document.getElementById('base-value').textContent = `$${base.toFixed(2)}`;
  document.getElementById('bull-value').textContent = `$${bull.toFixed(2)}`;
}

function updateSanityChecks(results, data) {
  const fcfPerShare = data.sharesOutstanding !== 0 ? (results.currentFCF / data.sharesOutstanding) : 0;
  const impliedPFCF = fcfPerShare !== 0 ? (results.fairValuePerShare / fcfPerShare) : NaN;
  const evRevenue = data.currentRevenue !== 0 ? (results.enterpriseValue / data.currentRevenue) : NaN;
  const marketCap = (data.currentPrice && data.sharesOutstanding) ? (data.currentPrice * data.sharesOutstanding) : NaN;
  const fcfYield = marketCap && marketCap !== 0 ? (results.currentFCF / marketCap) * 100 : NaN;
  const upside = isFiniteNumber(data.currentPrice) && data.currentPrice > 0 ? 
    ((results.fairValuePerShare - data.currentPrice) / data.currentPrice * 100) : NaN;
  
  document.getElementById('implied-pe').textContent = isFiniteNumber(impliedPFCF) ? `${impliedPFCF.toFixed(1)}x` : 'N/A';
  document.getElementById('ev-revenue').textContent = isFiniteNumber(evRevenue) ? `${evRevenue.toFixed(1)}x` : 'N/A';
  document.getElementById('fcf-yield').textContent = isFiniteNumber(fcfYield) ? `${fcfYield.toFixed(1)}%` : 'N/A';
  document.getElementById('upside-downside').textContent = isFiniteNumber(upside) ? `${upside.toFixed(1)}%` : 'N/A';
}

function updateCashFlowTable(projections) {
  const tbody = document.getElementById('cash-flow-body');
  tbody.innerHTML = '';
  
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:left">Year ${i + 1}</td>
      <td>$${Math.round(projections.revenues[i]).toLocaleString()}M</td>
      <td>$${Math.round(projections.fcf[i]).toLocaleString()}M</td>
      <td>${(1 / Math.pow(1 + currentData.discountRate, i + 1)).toFixed(3)}</td>
      <td>$${Math.round(projections.pv[i]).toLocaleString()}M</td>
    `;
    tbody.appendChild(tr);
  }
  
  const terminalRow = document.createElement('tr');
  terminalRow.style.backgroundColor = '#f1f2f6';
  terminalRow.style.fontWeight = 'bold';
  terminalRow.innerHTML = `
    <td style="text-align:left">Terminal Value</td>
    <td>-</td>
    <td>$${Math.round(projections.terminalFCF).toLocaleString()}M</td>
    <td>${(1 / Math.pow(1 + currentData.discountRate, 10)).toFixed(3)}</td>
    <td>$${Math.round(projections.pvTerminal).toLocaleString()}M</td>
  `;
  tbody.appendChild(terminalRow);
}

// Main DCF Calculation Function
function calculateDCF() {
  const data = {
    companyName: document.getElementById('company-name').value.trim(),
    currentPrice: toNumber(document.getElementById('current-price').value),
    currentRevenue: convertToMillions(toNumber(document.getElementById('current-revenue').value), 
      document.getElementById('revenue-unit').value),
    freeCashFlow: convertToMillions(toNumber(document.getElementById('free-cash-flow').value), 
      document.getElementById('fcf-unit').value),
    totalDebt: convertToMillions(toNumber(document.getElementById('total-debt').value), 
      document.getElementById('debt-unit').value),
    cashEquivalents: convertToMillions(toNumber(document.getElementById('cash-equivalents').value), 
      document.getElementById('cash-unit').value),
    sharesOutstanding: convertToMillions(toNumber(document.getElementById('shares-outstanding').value), 
      document.getElementById('shares-unit').value),
    revenueGrowth15: toNumber(document.getElementById('revenue-growth-1-5').value) / 100,
    revenueGrowth610: toNumber(document.getElementById('revenue-growth-6-10').value) / 100,
    terminalGrowth: toNumber(document.getElementById('terminal-growth').value) / 100,
    discountRate: toNumber(document.getElementById('discount-rate').value) / 100
  };

  // Validation
  const required = [
    {k: 'currentRevenue', v: data.currentRevenue},
    {k: 'freeCashFlow', v: data.freeCashFlow},
    {k: 'discountRate', v: data.discountRate},
    {k: 'sharesOutstanding', v: data.sharesOutstanding},
    {k: 'revenueGrowth15', v: data.revenueGrowth15}
  ];
  
  const missing = required.filter(x => !isFiniteNumber(x.v) || x.v === 0);
  if (missing.length > 0) {
    showStatus(`Please fill required fields: ${missing.map(item => item.k).join(', ')}`, 'error');
    return;
  }
  
  if (data.discountRate <= data.terminalGrowth) {
    showStatus('Discount Rate must be greater than Terminal Growth Rate.', 'error');
    return;
  }

  currentData = data;
  
  // Calculate scenarios
  const base = performDCFCalculation(data);
  
  const bullInput = {
    ...data,
    revenueGrowth15: data.revenueGrowth15 * 1.25,
    revenueGrowth610: data.revenueGrowth610 * 1.25,
    discountRate: data.discountRate * 0.95
  };
  const bull = performDCFCalculation(bullInput);
  
  const bearInput = {
    ...data,
    revenueGrowth15: data.revenueGrowth15 * 0.75,
    revenueGrowth610: data.revenueGrowth610 * 0.75,
    discountRate: data.discountRate * 1.05
  };
  const bear = performDCFCalculation(bearInput);

  // Update UI
  updateResults(base);
  updateScenarioResults(bear.fairValuePerShare, base.fairValuePerShare, bull.fairValuePerShare);
  updateSanityChecks(base, data);
  updateCashFlowTable(base.projections);

  // Show results
  document.getElementById('valuation-summary').style.display = 'block';
  document.getElementById('scenarios-grid').style.display = 'grid';
  document.getElementById('sanity-checks').style.display = 'block';
  document.getElementById('cash-flow-table').style.display = 'table';
  
  showStatus('✅ DCF valuation completed successfully!', 'success');
}

// Load sample data on page load
function loadSampleData() {
  document.getElementById('ticker-input').value = 'AAPL';
  // Set default growth assumptions
  document.getElementById('revenue-growth-1-5').value = '8';
  document.getElementById('revenue-growth-6-10').value = '5';
  document.getElementById('terminal-growth').value = '2.5';
  document.getElementById('discount-rate').value = '9.0';
}

// Initialize page
window.onload = loadSampleData;

// Add Enter key support for ticker input
document.getElementById('ticker-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    fetchFinancialData();
  }
});
