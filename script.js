// US Medical Debt - Two Chart Visualization
// 1. Line chart: Trends over time
// 2. Scatter plot: Debt rate vs median amount relationship

let allData = [];
let lineChart = null;
let scatterChart = null;

// Load JSON data
async function loadData() {
  try {
    const response = await fetch('data.json');
    allData = await response.json();
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

// Calculate average
function average(array, field) {
  if (array.length === 0) return 0;
  return array.reduce((sum, item) => sum + item[field], 0) / array.length;
}

// Get current filter values
function getFilters() {
  return {
    year: document.getElementById('year-select').value,
    state: document.getElementById('state-select').value
  };
}

// Filter data based on selections
function filterData(data) {
  const { year, state } = getFilters();
  
  return data.filter(item => {
    const yearMatch = year === 'all' || item.year.toString() === year;
    const stateMatch = state === 'all' || item.state === state;
    return yearMatch && stateMatch;
  });
}

// Calculate trend data for line chart
function getTrendData(data, selectedState) {
  const years = [...new Set(data.map(d => d.year))].sort();
  
  return years.map(year => {
    const yearData = data.filter(d => d.year === year);
    
    let avgShare;
    if (selectedState === 'all') {
      // National average = average of state averages
      const stateGroups = {};
      yearData.forEach(item => {
        if (!stateGroups[item.state]) stateGroups[item.state] = [];
        stateGroups[item.state].push(item);
      });
      const stateAvgs = Object.values(stateGroups).map(recs => average(recs, 'debt_share'));
      avgShare = stateAvgs.reduce((a, b) => a + b, 0) / stateAvgs.length;
    } else {
      const stateRecs = yearData.filter(d => d.state === selectedState);
      avgShare = average(stateRecs, 'debt_share');
    }
    
    return { year: year, avgShare: avgShare };
  });
}

// Calculate scatter data: state averages
function getScatterData(data) {
  const stateGroups = {};
  
  data.forEach(item => {
    if (!stateGroups[item.state]) stateGroups[item.state] = [];
    stateGroups[item.state].push(item);
  });
  
  return Object.entries(stateGroups).map(([state, records]) => ({
    x: average(records, 'debt_share') * 100,
    y: average(records, 'median_debt'),
    state: state
  }));
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
          min: 0
        }
      }
    }
  });
}

// Calculate insight for line chart
function getLineInsight(data, selectedState) {
  if (data.length < 2) return '';
  
  const years = [...new Set(data.map(d => d.year))].sort();
  if (years.length < 2) return '';
  
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  
  const firstData = getTrendData(data.filter(d => d.year === firstYear), selectedState);
  const lastData = getTrendData(data.filter(d => d.year === lastYear), selectedState);
  
  if (firstData.length === 0 || lastData.length === 0) return '';
  
  const firstVal = firstData[0].avgShare * 100;
  const lastVal = lastData[0].avgShare * 100;
  const change = ((lastVal - firstVal) / firstVal * 100).toFixed(0);
  
  if (Math.abs(change) < 5) return 'Medical debt rates remained relatively stable.';
  
  const direction = change > 0 ? 'increased' : 'decreased';
  const stateLabel = selectedState === 'all' ? 'National' : selectedState;
  
  return `<strong>${stateLabel}:</strong> ${Math.abs(change)}% ${direction} from ${firstYear} to ${lastYear}.`;
}

// Calculate insight for scatter chart
function getScatterInsight(data) {
  const stateGroups = {};
  data.forEach(item => {
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
  }));
  
  withAvg.sort((a, b) => b.debtShare - a.debtShare);
  
  const highest = withAvg[0];
  const lowest = withAvg[withAvg.length - 1];
  
  return `Highest: <strong>${highest.state}</strong> (${highest.debtShare.toFixed(0)}%). Lowest: <strong>${lowest.state}</strong> (${lowest.debtShare.toFixed(0)}%).`;
}

// Update insights
function updateInsights() {
  const { year, state } = getFilters();
  
  document.getElementById('line-insight').innerHTML = getLineInsight(allData, state);
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