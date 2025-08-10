// --- NEW: Global variables to hold our chart instances ---
let revenueChart = null;
let fcfChart = null;

// --- Smart automation using HISTORICAL data ---
function autoCalculateAssumptions() {
  const profile = window.lastFetchedData?.profile;
  const historicalData = window.lastFetchedData?.historicalData;
  
  if (!profile || !historicalData) {
    showStatus('Please fetch financial data first', 'error');
    return;
  }
  
  console.log('Auto-calculating assumptions using HISTORICAL data...');

  // --- NEW: Perform historical analysis ---
  const historicalAnalysis = analyzeHistoricalData(historicalData);

  // --- Get Sector-based growth as a baseline ---
  const sectorEstimates = getIndustryGrowthEstimates(profile.sector, profile.industry);
  
  // --- Use Beta for WACC calculation (no change here) ---
  const wacc = calculateWACCFromBeta(profile.beta);
  const sizeAdjustment = getSizeAdjustment(profile.mktCap);
  const adjustedWACC = Math.round((wacc * sizeAdjustment.risk) * 10) / 10;

  // --- RULE-BASED ASSUMPTIONS ---
  // 1. Growth Rate: Use the lower of the historical CAGR or the sector-based estimate
  const sectorGrowth = Math.round((sectorEstimates.nearTerm * sizeAdjustment.growth) * 10) / 10;
  const finalGrowth = Math.min(sectorGrowth, historicalAnalysis.revenueCAGR);

  // 2. Terminal Growth and Long-term growth remain standard
  const finalLongTermGrowth = Math.round((sectorEstimates.longTerm * sizeAdjustment.growth) * 10) / 10;
  const finalTerminalGrowth = 2.5;

  const finalAssumptions = {
    revenueGrowth15: finalGrowth,
    revenueGrowth610: finalLongTermGrowth,
    terminalGrowth: finalTerminalGrowth,
    discountRate: adjustedWACC
  };
  
  document.getElementById('revenue-growth-1-5').value = finalAssumptions.revenueGrowth15;
  document.getElementById('revenue-growth-6-10').value = finalAssumptions.revenueGrowth610;
  document.getElementById('terminal-growth').value = finalAssumptions.terminalGrowth;
  document.getElementById('discount-rate').value = finalAssumptions.discountRate;
  
  // --- UPDATED: More detailed explanation ---
  const explanation = `🤖 Auto-calculated: Using ${historicalAnalysis.revenueCAGR}% historical growth (more conservative than ${sectorGrowth}% sector projection).`;
  showStatus(explanation, 'success');
  
  console.log('Applied assumptions:', finalAssumptions);
}

// --- NEW: Helper function to calculate Compound Annual Growth Rate ---
function calculateCAGR(beginningValue, endingValue, years) {
    if (beginningValue <= 0) return 0; // Cannot calculate CAGR if starting value is zero or negative
    const cagr = (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
    return Math.round(cagr * 10) / 10; // Round to one decimal place
}

// --- NEW: Main historical analysis function ---
function analyzeHistoricalData(historicalData) {
    const incomes = [...historicalData.incomeStatements].reverse(); // oldest to newest
    const cashflows = [...historicalData.cashflowStatements].reverse(); // oldest to newest

    if (incomes.length < 2) {
        return { revenueCAGR: 5, averageFcfMargin: 0.1 }; // Default if not enough data
    }

    // 1. Calculate Revenue CAGR
    const beginningRevenue = incomes[0].revenue;
    const endingRevenue = incomes[incomes.length - 1].revenue;
    const years = incomes.length - 1;
    const revenueCAGR = calculateCAGR(beginningRevenue, endingRevenue, years);

    // 2. Calculate Average FCF Margin
    let totalFcf = 0;
    let totalRevenue = 0;
    cashflows.forEach((cf, index) => {
        const fcf = (cf.operatingCashFlow || 0) - (cf.capitalExpenditure || 0);
        totalFcf += fcf;
        totalRevenue += incomes[index]?.revenue || 0;
    });
    const averageFcfMargin = totalRevenue > 0 ? totalFcf / totalRevenue : 0;

    return {
        revenueCAGR,
        averageFcfMargin: Math.round(averageFcfMargin * 1000) / 1000 // round to 3 decimal places
    };
}


// --- NEW: Function to render charts ---
function renderCharts(historicalData) {
    const chartsContainer = document.getElementById('charts-container');
    if (!historicalData || !historicalData.incomeStatements?.length) {
        chartsContainer.style.display = 'none';
        return;
    }

    // Destroy previous charts if they exist
    if (revenueChart) revenueChart.destroy();
    if (fcfChart) fcfChart.destroy();

    const incomes = [...historicalData.incomeStatements].reverse();
    const cashflows = [...historicalData.cashflowStatements].reverse();
    
    const labels = incomes.map(item => item.calendarYear);
    const revenueData = incomes.map(item => item.revenue / 1e9); // in billions
    const fcfData = cashflows.map(item => ((item.operatingCashFlow - item.capitalExpenditure) / 1e9)); // in billions

    const revenueCtx = document.getElementById('revenue-chart').getContext('2d');
    revenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Annual Revenue ($B)',
                data: revenueData,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });

    const fcfCtx = document.getElementById('fcf-chart').getContext('2d');
    fcfChart = new Chart(fcfCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Free Cash Flow ($B)',
                data: fcfData,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });

    chartsContainer.style.display = 'block';
}


// --- UPDATED fetchFinancialData function ---
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
  document.getElementById('charts-container').style.display = 'none'; // Hide charts during fetch

  try {
    const response = await fetch(`/.netlify/functions/fetch-financials?ticker=${ticker}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    window.lastFetchedData = data;
    
    const { profile, currentFinancials, balanceSheet, historicalData } = data;

    // Populate UI fields with CURRENT data
    document.getElementById('company-name').value = profile.companyName || 'N/A';
    document.getElementById('current-price').value = profile.price ? profile.price.toFixed(2) : '0';
    const sharesInBillion = profile.sharesOutstanding ? (profile.sharesOutstanding / 1e9).toFixed(2) : '0';
    document.getElementById('shares-outstanding').value = sharesInBillion;
    document.getElementById('shares-unit').value = 'billion';

    document.getElementById('current-revenue').value = (currentFinancials.revenue / 1e9).toFixed(2);
    document.getElementById('revenue-unit').value = 'billion';
    document.getElementById('free-cash-flow').value = (currentFinancials.freeCashFlow / 1e9).toFixed(2);
    document.getElementById('fcf-unit').value = 'billion';
    document.getElementById('total-debt').value = (balanceSheet.totalDebt / 1e9).toFixed(2);
    document.getElementById('debt-unit').value = 'billion';
    document.getElementById('cash-equivalents').value = (balanceSheet.cashAndCashEquivalents / 1e9).toFixed(2);
    document.getElementById('cash-unit').value = 'billion';

    // --- NEW: Render the historical data charts ---
    renderCharts(historicalData);

    showStatus(`✅ Successfully loaded data for ${profile.companyName}. Click "Auto-Calculate" for smart, history-based assumptions.`, 'success');

  } catch (error) {
    console.error('Error fetching financial data:', error);
    showStatus(`❌ Failed to fetch data: ${error.message}`, 'error');
  } finally {
    loader.style.display = 'none';
    btnText.textContent = 'Fetch Financial Data';
    fetchButton.disabled = false;
  }
}


// --- UPDATED calculateDCF to use normalized FCF ---
function calculateDCF() {
    const historicalData = window.lastFetchedData?.historicalData;
    if (!historicalData) {
        showStatus('Please fetch and analyze data first.', 'error');
        return;
    }
    
    // --- NEW: Use average margin for a more stable projection ---
    const { averageFcfMargin } = analyzeHistoricalData(historicalData);
    
    const data = {
        // ... (get all other data from form fields as before)
        companyName: document.getElementById('company-name').value.trim(),
        currentPrice: toNumber(document.getElementById('current-price').value),
        currentRevenue: convertToMillions(toNumber(document.getElementById('current-revenue').value), 
            document.getElementById('revenue-unit').value),
        totalDebt: convertToMillions(toNumber(document.getElementById('total-debt').value), 
            document.getElementById('debt-unit').value),
        cashEquivalents: convertToMillions(toNumber(document.getElementById('cash-equivalents').value), 
            document.getElementById('cash-unit').value),
        sharesOutstanding: convertToMillions(toNumber(document.getElementById('shares-outstanding').value), 
            document.getElementById('shares-unit').value),
        revenueGrowth15: toNumber(document.getElementById('revenue-growth-1-5').value) / 100,
        revenueGrowth610: toNumber(document.getElementById('revenue-growth-6-10').value) / 100,
        terminalGrowth: toNumber(document.getElementById('terminal-growth').value) / 100,
        discountRate: toNumber(document.getElementById('discount-rate').value) / 100,
        // --- PASS THE NORMALIZED MARGIN ---
        fcfMargin: averageFcfMargin 
    };

    // --- (Validation logic remains the same) ---
    const required = [
        {k: 'currentRevenue', v: data.currentRevenue},
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
  
    const base = performDCFCalculation(data);
    
    // Scenarios can now be more intelligent, e.g., by adjusting the margin
    const bullInput = { ...data, revenueGrowth15: data.revenueGrowth15 * 1.2, fcfMargin: data.fcfMargin * 1.1 };
    const bull = performDCFCalculation(bullInput);
  
    const bearInput = { ...data, revenueGrowth15: data.revenueGrowth15 * 0.8, fcfMargin: data.fcfMargin * 0.9 };
    const bear = performDCFCalculation(bearInput);

    updateResults(base, data.currentRevenue * data.fcfMargin);
    updateScenarioResults(bear.fairValuePerShare, base.fairValuePerShare, bull.fairValuePerShare);
    updateSanityChecks(base, data);
    updateCashFlowTable(base.projections);

    document.getElementById('valuation-summary').style.display = 'block';
    document.getElementById('scenarios-grid').style.display = 'grid';
    document.getElementById('sanity-checks').style.display = 'block';
    document.getElementById('cash-flow-table').style.display = 'table';
  
    showStatus('✅ DCF valuation completed successfully!', 'success');
}


// --- UPDATED performDCFCalculation to accept FCF Margin ---
function performDCFCalculation(data) {
    const fcfMargin = data.fcfMargin; // Use the passed-in margin
    const currentFCF = data.currentRevenue * fcfMargin;

    const projections = { revenues: [], fcf: [], pv: [] };
    let totalPVFCF = 0;
    let lastProjectedRevenue = data.currentRevenue;

    for (let year = 1; year <= 10; year++) {
        const growthRate = year <= 5 ? data.revenueGrowth15 : data.revenueGrowth610;
        const revenue = lastProjectedRevenue * (1 + growthRate);
        lastProjectedRevenue = revenue;
        
        // FCF is now based on a stable margin
        const fcf = revenue * fcfMargin;
        
        const pvFactor = 1 / Math.pow(1 + data.discountRate, year);
        const pv = fcf * pvFactor;
        
        if (year <= 10) { // Let's track all 10 years for the table now
            projections.revenues.push(revenue);
            projections.fcf.push(fcf);
            projections.pv.push(pv);
        }
        totalPVFCF += pv;
    }

    // --- (Terminal value calculation is largely the same, but uses stable margin) ---
    const lastYearFCF = lastProjectedRevenue * fcfMargin;
    const terminalFCF = lastYearFCF * (1 + data.terminalGrowth);
  
    const denom = data.discountRate - data.terminalGrowth;
    const terminalValue = (denom <= 0.001) ? terminalFCF * 15 : terminalFCF / denom;
  
    const pvTerminal = terminalValue / Math.pow(1 + data.discountRate, 10);
    const enterpriseValue = totalPVFCF + pvTerminal;
    const netDebt = data.totalDebt - data.cashEquivalents;
    const equityValue = enterpriseValue - netDebt;
    const fairValuePerShare = data.sharesOutstanding > 0 ? equityValue / data.sharesOutstanding : 0;
  
    projections.terminalFCF = terminalFCF;
    projections.pvTerminal = pvTerminal;

    return { enterpriseValue, netDebt, equityValue, fairValuePerShare, projections };
}

// --- UPDATED updateResults to show the normalized FCF ---
function updateResults(results, normalizedFcf) {
    document.getElementById('current-fcf').textContent = `$${Math.round(normalizedFcf).toLocaleString()}M (Normalized)`;
    // ... (rest of the function is the same)
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

// --- (Other utility functions like toNumber, showStatus, etc., remain unchanged) ---
function toNumber(v) { return (v === null || v === undefined || v === '') ? NaN : Number(v); }
function convertToMillions(value, unit) { const num = toNumber(value); if (!isFinite(num)) return 0; return unit === 'billion' ? num * 1000 : num; }
function isFiniteNumber(x) { return Number.isFinite(x) && !Number.isNaN(x); }
function showStatus(message, type = 'info') { const statusDiv = document.getElementById('fetch-status'); statusDiv.className = type === 'error' ? 'error-message' : 'success-message'; statusDiv.textContent = message; setTimeout(() => statusDiv.textContent = '', 8000); }
let lastFetchedData = null;
let currentData = {};
function showScenario(scenario, el) { document.querySelectorAll('.scenario-tab').forEach(t => t.classList.remove('active')); if (el) el.classList.add('active'); document.querySelectorAll('.scenario-content').forEach(c => c.classList.remove('active')); const target = document.getElementById(scenario + '-scenario'); if (target) target.classList.add('active'); }
function loadSampleData() { document.getElementById('ticker-input').value = 'AAPL'; document.getElementById('revenue-growth-1-5').value = '8'; document.getElementById('revenue-growth-6-10').value = '5'; document.getElementById('terminal-growth').value = '2.5'; document.getElementById('discount-rate').value = '9.0'; }
window.onload = loadSampleData;
document.getElementById('ticker-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') { fetchFinancialData(); } });
// --- (Dummy functions for functions not shown fully)
function getIndustryGrowthEstimates(sector, industry) {
    const sectorGrowth = { 'Technology': { nearTerm: 12, longTerm: 6 }, 'Healthcare': { nearTerm: 8, longTerm: 5 }, 'Financial Services': { nearTerm: 6, longTerm: 4 }, 'Consumer Cyclical': { nearTerm: 7, longTerm: 4 }, 'Consumer Defensive': { nearTerm: 4, longTerm: 3 }, 'Industrials': { nearTerm: 6, longTerm: 4 },'Energy': { nearTerm: 5, longTerm: 3 }, 'Utilities': { nearTerm: 3, longTerm: 2 }, 'Real Estate': { nearTerm: 4, longTerm: 3 }, 'Materials': { nearTerm: 5, longTerm: 3 }, 'Communication Services': { nearTerm: 8, longTerm: 5 } };
    const industryAdjustments = { 'Software': 1.3, 'Semiconductors': 1.2, 'Biotechnology': 1.4, 'Airlines': 0.8, 'Banks': 0.9 };
    const baseGrowth = sectorGrowth[sector] || { nearTerm: 6, longTerm: 4 };
    const industryMultiplier = industryAdjustments[industry] || 1.0;
    return { nearTerm: baseGrowth.nearTerm * industryMultiplier, longTerm: baseGrowth.longTerm * industryMultiplier };
}
function calculateWACCFromBeta(beta) {
    const riskFreeRate = 4.5;
    const marketRiskPremium = 5.5;
    if (!beta || beta <= 0) beta = 1.0;
    const costOfEquity = riskFreeRate + (beta * marketRiskPremium);
    return Math.min(Math.max(costOfEquity, 7), 15);
}
function getSizeAdjustment(marketCap) {
    const capInBillions = marketCap / 1e9;
    if (capInBillions > 500) return { growth: 0.8, risk: 0.9 };
    if (capInBillions > 100) return { growth: 0.9, risk: 0.95 };
    if (capInBillions > 10) return { growth: 1.0, risk: 1.0 };
    if (capInBillions > 2) return { growth: 1.1, risk: 1.1 };
    return { growth: 1.2, risk: 1.2 };
}
function updateScenarioResults(bear, base, bull) { document.getElementById('bear-value').textContent = `$${bear.toFixed(2)}`; document.getElementById('base-value').textContent = `$${base.toFixed(2)}`; document.getElementById('bull-value').textContent = `$${bull.toFixed(2)}`; }
function updateSanityChecks(results, data) { const fcfPerShare = data.sharesOutstanding !== 0 ? ((data.currentRevenue * data.fcfMargin) / data.sharesOutstanding) : 0; const impliedPFCF = fcfPerShare !== 0 ? (results.fairValuePerShare / fcfPerShare) : NaN; const evRevenue = data.currentRevenue !== 0 ? (results.enterpriseValue / data.currentRevenue) : NaN; const marketCap = (data.currentPrice && data.sharesOutstanding) ? (data.currentPrice * data.sharesOutstanding) : NaN; const fcfYield = marketCap && marketCap !== 0 ? ((data.currentRevenue * data.fcfMargin) / marketCap) * 100 : NaN; const upside = isFiniteNumber(data.currentPrice) && data.currentPrice > 0 ? ((results.fairValuePerShare - data.currentPrice) / data.currentPrice * 100) : NaN; document.getElementById('implied-pe').textContent = isFiniteNumber(impliedPFCF) ? `${impliedPFCF.toFixed(1)}x` : 'N/A'; document.getElementById('ev-revenue').textContent = isFiniteNumber(evRevenue) ? `${evRevenue.toFixed(1)}x` : 'N/A'; document.getElementById('fcf-yield').textContent = isFiniteNumber(fcfYield) ? `${fcfYield.toFixed(1)}%` : 'N/A'; document.getElementById('upside-downside').textContent = isFiniteNumber(upside) ? `${upside.toFixed(1)}%` : 'N/A'; }
function updateCashFlowTable(projections) {
    const tbody = document.getElementById('cash-flow-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 10; i++) { // Show all 10 years now
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="text-align:left">Year ${i + 1}</td><td>$${Math.round(projections.revenues[i]).toLocaleString()}M</td><td>$${Math.round(projections.fcf[i]).toLocaleString()}M</td><td>${(1 / Math.pow(currentData.discountRate, i + 1)).toFixed(3)}</td><td>$${Math.round(projections.pv[i]).toLocaleString()}M</td>`;
        tbody.appendChild(tr);
    }
    const terminalRow = document.createElement('tr');
    terminalRow.style.backgroundColor = '#f1f2f6';
    terminalRow.style.fontWeight = 'bold';
    terminalRow.innerHTML = `<td style="text-align:left">Terminal Value</td><td>-</td><td>$${Math.round(projections.terminalFCF).toLocaleString()}M</td><td>${(1 / Math.pow(currentData.discountRate, 10)).toFixed(3)}</td><td>$${Math.round(projections.pvTerminal).toLocaleString()}M</td>`;
    tbody.appendChild(terminalRow);
}