// US Medical Debt - Two Chart Visualization
// 1. Line chart: Trends over time
// 2. Scatter plot: Debt rate vs median amount relationship

let allData = [];
let lineChart = null;
let scatterChart = null;

// Normalize JSON data field names
function normalizeData(data) {
  return data.map(item => {
    const normalized = {};
    normalized.year = parseInt(item.Year);
    normalized.state = item['State Abbreviation'];
    
    // Parse percentage strings like ".223" or "NA" to decimal
    const parsePercent = (val) => {
      if (val === 'NA' || val === undefined || val === null) return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    };
    
    normalized.debt_share = parsePercent(item['Share with medical debt in collections']);
    normalized.median_debt = parseInt(item['Median medical debt in collections in $2023']) || null;
    
    return normalized;
  }).filter(item => item.year && item.state);
}

// Load JSON data
async function loadData() {
  try {
    const response = await fetch('data.json');
    const rawData = await response.json();
    allData = normalizeData(rawData);
    console.log('Loaded', allData.length, 'records');
    
    populateDropdowns();
    createCharts();
    setupEventListeners();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Populate year/state dropdowns from data
function populateDropdowns() {
  const yearSelect = document.getElementById('year-select');
  const stateSelect = document.getElementById('state-select');
  
  const uniqueYears = [...new Set(allData.map(d => d.year))].sort();
  const uniqueStates = [...new Set(allData.map(d => d.state))].sort();
  
  yearSelect.innerHTML = '<option value="all">All Years</option>';
  uniqueYears.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  });
  
  stateSelect.innerHTML = '<option value="all">All States</option>';
  uniqueStates.forEach(state => {
    const option = document.createElement('option');
    option.value = state;
    option.textContent = state;
    stateSelect.appendChild(option);
  });
}

// Calculate average (skip null values)
function average(array, field) {
  const valid = array.filter(item => item[field] != null);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, item) => sum + item[field], 0) / valid.length;
}

// Get current filter values
function getFilters() {
  return {
    year: document.getElementById('year-select').value,
    state: document.getElementById('state-select').value
  };
}

// Filter data based on selections (exclude null values)
function filterData(data) {
  const { year, state } = getFilters();
  
  return data.filter(item => {
    if (item.debt_share == null || item.median_debt == null) return false;
    const yearMatch = year === 'all' || item.year.toString() === year;
    const stateMatch = state === 'all' || item.state === state;
    return yearMatch && stateMatch;
  });
}

// Calculate trend data for line chart (filter out null values)
function getTrendData(data, selectedState) {
  const validData = data.filter(d => d.debt_share != null);
  const years = [...new Set(validData.map(d => d.year))].sort();
  
  return years.map(year => {
    const yearData = validData.filter(d => d.year === year);
    if (yearData.length === 0) return null;
    
    let avgShare;
    if (selectedState === 'all') {
      const stateGroups = {};
      yearData.forEach(item => {
        if (!stateGroups[item.state]) stateGroups[item.state] = [];
        stateGroups[item.state].push(item);
      });
      const stateAvgs = Object.values(stateGroups).map(recs => average(recs, 'debt_share')).filter(v => v > 0);
      avgShare = stateAvgs.length > 0 ? stateAvgs.reduce((a, b) => a + b, 0) / stateAvgs.length : 0;
    } else {
      const stateRecs = yearData.filter(d => d.state === selectedState);
      avgShare = average(stateRecs, 'debt_share');
    }
    
    return { year: year, avgShare: avgShare };
  }).filter(d => d && d.avgShare > 0);
}

// Calculate scatter data: state averages (filter nulls)
function getScatterData(data) {
  const validData = data.filter(d => d.debt_share != null && d.median_debt != null);
  const stateGroups = {};
  
  validData.forEach(item => {
    if (!stateGroups[item.state]) stateGroups[item.state] = [];
    stateGroups[item.state].push(item);
  });
  
  return Object.entries(stateGroups).map(([state, records]) => ({
    x: average(records, 'debt_share') * 100,
    y: average(records, 'median_debt'),
    state: state
  })).filter(d => d.x > 0 && d.y > 0);
}

// Update line chart
function updateLineChart() {
  const { state } = getFilters();
  const trendData = getTrendData(allData, state);
  
  lineChart.data.labels = trendData.map(d => d.year);
  lineChart.data.datasets[0].data = trendData.map(d => d.avgShare);
  
  const label = state === 'all' ? 'National' : state;
  document.getElementById('trend-badge').textContent = label;
  
  lineChart.update('active');
}

// Update scatter chart
function updateScatterChart() {
  const filteredData = filterData(allData);
  const scatterData = getScatterData(filteredData);
  
  scatterChart.data.datasets[0].data = scatterData;
  
  // Dynamic axis scaling
  if (scatterData.length > 0) {
    const maxY = Math.max(...scatterData.map(d => d.y)) * 1.1;
    scatterChart.options.scales.y.max = maxY;
  }
  
  const { year } = getFilters();
  const badgeText = year === 'all' ? 'All Years' : year;
  document.getElementById('scatter-badge').textContent = badgeText;
  
  scatterChart.update('active');
}

// Create both charts
function createCharts() {
  // LINE CHART
  const lineCtx = document.getElementById('line-chart').getContext('2d');
  const trendData = getTrendData(allData, 'all');
  
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: trendData.map(d => d.year),
      datasets: [{
        label: 'National Average (%)',
        data: trendData.map(d => d.avgShare),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: '#00d4ff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#162236',
          callbacks: { label: c => `${(c.raw * 100).toFixed(1)}%` }
        }
      },
      scales: {
        x: { ticks: { color: '#8899a8', font: { size: 11 } }, grid: { color: 'rgba(42,58,77,0.5)' } },
        y: { 
          ticks: { color: '#8899a8', font: { size: 11 }, callback: v => (v * 100).toFixed(0) + '%' }, 
          grid: { color: 'rgba(42,58,77,0.5)' },
          min: 0
        }
      }
    }
  });
  
  // SCATTER CHART
  const scatterCtx = document.getElementById('scatter-chart').getContext('2d');
  const scatterData = getScatterData(allData);
  const maxY = scatterData.length > 0 ? Math.max(...scatterData.map(d => d.y)) * 1.1 : 2000;
  
  scatterChart = new Chart(scatterCtx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'States',
        data: scatterData,
        backgroundColor: 'rgba(0, 212, 255, 0.7)',
        borderColor: '#00d4ff',
        pointRadius: 8,
        pointHoverRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#162236',
          callbacks: { label: c => `${c.raw.state}: ${c.raw.x.toFixed(1)}% / $${c.raw.y}` }
        }
      },
      scales: {
        x: { 
          title: { display: true, text: '% with debt', color: '#8899a8', font: { size: 11 } },
          grid: { color: 'rgba(42,58,77,0.5)' },
          ticks: { color: '#8899a8', font: { size: 11 } },
          min: 0, max: 30
        },
        y: { 
          title: { display: true, text: 'Median ($)', color: '#8899a8', font: { size: 11 } },
          grid: { color: 'rgba(42,58,77,0.5)' },
          ticks: { color: '#8899a8', font: { size: 11 }, callback: v => '$' + v },
          min: 0, max: maxY
        }
      }
    }
  });
}

// Calculate insight for line chart
function getLineInsight(data, selectedState) {
  const validData = data.filter(d => d.debt_share != null);
  if (validData.length < 2) return '';
  
  const years = [...new Set(validData.map(d => d.year))].sort();
  if (years.length < 2) return '';
  
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  
  const firstData = getTrendData(validData.filter(d => d.year === firstYear), selectedState);
  const lastData = getTrendData(validData.filter(d => d.year === lastYear), selectedState);
  
  if (firstData.length === 0 || lastData.length === 0) return '';
  
  const firstVal = firstData[0].avgShare * 100;
  const lastVal = lastData[0].avgShare * 100;
  if (firstVal === 0) return '';
  const change = ((lastVal - firstVal) / firstVal * 100).toFixed(0);
  
  if (Math.abs(change) < 5) return 'Medical debt rates remained relatively stable.';
  
  const direction = change > 0 ? 'increased' : 'decreased';
  const stateLabel = selectedState === 'all' ? 'National' : selectedState;
  
  return `<strong>${stateLabel}:</strong> ${Math.abs(change)}% ${direction} from ${firstYear} to ${lastYear}.`;
}

// Calculate insight for scatter chart
function getScatterInsight(data) {
  const validData = data.filter(d => d.debt_share != null && d.median_debt != null);
  const stateGroups = {};
  validData.forEach(item => {
    if (!stateGroups[item.state]) stateGroups[item.state] = [];
    stateGroups[item.state].push(item);
  });
  
  const states = Object.entries(stateGroups);
  if (states.length < 2) return '';
  
  // Find highest and lowest
  const withAvg = states.map(([state, records]) => ({
    state,
    debtShare: average(records, 'debt_share') * 100,
    medianDebt: average(records, 'median_debt')
  })).filter(d => d.debtShare > 0);
  
  if (withAvg.length < 2) return '';
  
  withAvg.sort((a, b) => b.debtShare - a.debtShare);
  
  const highest = withAvg[0];
  const lowest = withAvg[withAvg.length - 1];
  
  return `Highest: <strong>${highest.state}</strong> (${highest.debtShare.toFixed(0)}%). Lowest: <strong>${lowest.state}</strong> (${lowest.debtShare.toFixed(0)}%).`;
}

// Update insights
function updateInsights() {
  const { year, state } = getFilters();
  const filteredForLine = state === 'all' ? allData : allData.filter(d => d.state === state);
  
  document.getElementById('line-insight').innerHTML = getLineInsight(filteredForLine, state);
  document.getElementById('scatter-insight').innerHTML = getScatterInsight(filterData(allData));
}

// Event listeners
function setupEventListeners() {
  document.getElementById('year-select').addEventListener('change', () => {
    updateLineChart();
    updateScatterChart();
    updateInsights();
  });
  document.getElementById('state-select').addEventListener('change', () => {
    updateLineChart();
    updateScatterChart();
    updateInsights();
  });
}

// Start
loadData().then(() => updateInsights());

/*
=============================================================================
WHAT THIS SCATTER PLOT REVEALS
=============================================================================

CHART PURPOSE:
Shows the RELATIONSHIP between two key metrics:
  X-axis: % of population with medical debt
  Y-axis: Median debt amount ($)

This answers: "Do places with more people in debt also have higher amounts?"


KEY INSIGHTS:
-------------

1. POSITIVE CORRELATION (upward diagonal):
   More people have debt → they also owe MORE per person
   This indicates a SEVERE debt problem in those areas
   
2. WEAK/NO CORRELATION (scattered cloud):
   Debt rates don't predict debt amounts
   Other factors (cost of living, healthcare access) matter more
   
3. QUADRANT ANALYSIS:
   
   TOP-RIGHT: High rate + High amount = CRITICAL states
   TOP-LEFT:  Low rate + High amount = Concentrated problem
   BOTTOM-RIGHT: High rate + Low amount = Broad but manageable
   BOTTOM-LEFT: Healthy/low concern areas


EXAMPLE FROM OUR DATA:
----------------------
TX (24%, $1,100): High rate + High amount → Double problem
CA (16%, $850):   Low rate + Low amount    → Better off
FL (22%, $1,050): High rate + High amount   → Double problem
NY (16%, $860):   Low rate + Low amount    → Better off


FILTER INTERACTIONS:
--------------------
- Select a year: See if the pattern changes over time
- Select a state: Highlights that specific state's position
This helps identify WHICH states need attention most.
*/
