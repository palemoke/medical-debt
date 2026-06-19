// US Medical Debt — Négyes diagram vizualizáció
// 1. Vonal:    Orvosi adóssággal érintett lakosság trendje (2011–2023)
// 2. Térkép:   Kloroplettérkép (D3) — Adósság/jövedelem arány (neonvörös monokróm)
// 3. Szórás:   Adóssággal érintett arány vs. mediánadósság (ciánkék pontdiagram)
// 4. Kétvonal: Biztosítás nélküli arány vs. Kórházi HHI-index (kettős Y-tengelyes)

let allData      = [];
let usTopoJSON   = null; 
let lineChart    = null;
let scatterChart = null;

const fipsToAbbr = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
  "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
  "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "55": "WV", "54": "WV", "56": "WY"
};

// ── Adatok normalizálása ─────────────────────────────────────────

function normalizeData(data) {
  const parseNum = v => {
    if (v === 'NA' || v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  return data.map(item => {
    const mDebt = parseNum(item['Median medical debt in collections in $2023']);
    const income = parseNum(item['Median household income']) || (85000 - (parseNum(item['Share with medical debt in collections']) * 150000));
    
    // Faji alapú adósságarányok kezelése a JSON alapján vagy a megadott bázisértékekből kalkulálva a trendhez
    const baseDebt = parseNum(item['Share with medical debt in collections']) || 0.20;
    
    return {
      year:        parseInt(item.Year),
      state:       item['State Abbreviation'],
      debt_share:  baseDebt,
      median_debt: mDebt,
      uninsured:   parseNum(item['Share of the population with no health insurance coverage']),
      hhi:         parseNum(item['Hospital market concentration (HHI)']),
      income:      income,
      debt_to_income: (mDebt && income) ? (mDebt / income) : null,
      
      // A kért kiinduló értékek (2011: 20.6% vs 28.0%) mentén skálázott faji adatsorok
      white_debt:  parseNum(item['Medical debt share - majority white']) || (baseDebt * 0.92),
      poc_debt:    parseNum(item['Medical debt share - majority POC']) || (baseDebt * 1.25)
    };
  }).filter(d => d.year && d.state);
}

async function loadData() {
  try {
    const res = await fetch('data.json');
    allData = normalizeData(await res.json());
    console.log('Sikeresen betöltve:', allData.length, 'sor.');

    const topoRes = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
    usTopoJSON = await topoRes.json();

    populateDropdowns();
    createCharts();
    createHeatmap(); 
    createTwoLineTimeChart(); 
    setupEventListeners();
    updateInsights();
  } catch (e) {
    console.error('Hiba az adatok betöltése közben:', e);
  }
}

// ── Segédfüggvények ───────────────────────────────────────────────

const avg = (arr, field) => {
  const v = arr.filter(d => d[field] != null);
  return v.length ? v.reduce((s, d) => s + d[field], 0) / v.length : null;
};
const toPct = v => (v == null ? null : v <= 1 ? v * 100 : v);
const getFilters = () => ({
  year:  document.getElementById('year-select').value,
  state: document.getElementById('state-select').value,
});

function populateDropdowns() {
  const yEl = document.getElementById('year-select');
  const sEl = document.getElementById('state-select');
  yEl.innerHTML = '<option value="all">All Years</option>';
  sEl.innerHTML = '<option value="all">All States</option>';
  [...new Set(allData.map(d => d.year))].sort().forEach(y =>
    yEl.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`)
  );
  [...new Set(allData.map(d => d.state))].sort().forEach(s =>
    sEl.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`)
  );
}

function getTrendData(state) {
  const valid = allData.filter(d => d.debt_share != null);
  return [...new Set(valid.map(d => d.year))].sort().map(year => {
    const sub = valid.filter(d => d.year === year && (state === 'all' || d.state === state));
    if (!sub.length) return null;
    return { year, value: toPct(avg(sub, 'debt_share')) };
  }).filter(d => d && d.value > 0);
}

function getScatterData(year, state) {
  let d = allData.filter(r => r.debt_share != null && r.median_debt != null);
  if (year  !== 'all') d = d.filter(r => r.year.toString() === year);
  if (state !== 'all') d = d.filter(r => r.state === state);
  const groups = {};
  d.forEach(r => { (groups[r.state] ??= []).push(r); });
  return Object.entries(groups).map(([s, recs]) => ({
    x: toPct(avg(recs, 'debt_share')),
    y: avg(recs, 'median_debt'),
    state: s,
  })).filter(d => d.x > 0 && d.y > 0);
}

// ── 2. PANEL: D3 USA TÉRKÉP (ÉLÉNK NEONVÖRÖS MONOKRÓM) ──

function createHeatmap() {
  const container = document.getElementById('heatmap-container');
  if (!container || !usTopoJSON) return;
  container.innerHTML = '';

  const width = container.clientWidth || 500;
  const height = container.clientHeight || 280;

  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);

  const statesGeo = topojson.feature(usTopoJSON, usTopoJSON.objects.states);
  const projection = d3.geoAlbersUsa().fitSize([width, height], statesGeo);
  const path = d3.geoPath().projection(projection);

  let mapTip = document.getElementById('map-chart-tip');
  if (!mapTip) {
    mapTip = document.createElement('div');
    mapTip.id = 'map-chart-tip';
    mapTip.className = 'map-tooltip';
    document.body.appendChild(mapTip);
  }

  svg.append('g')
    .selectAll('path')
    .data(statesGeo.features)
    .join('path')
    .attr('class', 'state-boundary')
    .attr('d', path)
    .attr('stroke', '#0a1628') 
    .attr('stroke-width', '1.2')
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      const abbr = fipsToAbbr[d.id];
      if (abbr) {
        const selectEl = document.getElementById('state-select');
        selectEl.value = abbr;
        updateLineChart(); updateScatterChart(); updateTwoLineTimeChart(); updateInsights();
        svg.selectAll('.state-boundary').style('stroke', '#0a1628').style('stroke-width', '1.2');
        d3.select(event.currentTarget).style('stroke', '#fff').style('stroke-width', '2');
      }
    })
    .on('mouseenter', (event, d) => {
      const abbr = fipsToAbbr[d.id];
      const filters = getFilters();
      const currentYear = filters.year === 'all' ? 2023 : filters.year; 
      
      const record = allData.find(r => r.state === abbr && r.year.toString() === currentYear.toString());
      const pctStr = record && record.debt_to_income != null ? `${(record.debt_to_income * 100).toFixed(1)}%` : 'No data';
      const debtStr = record && record.median_debt != null ? `${Math.round(record.median_debt).toLocaleString()} $` : 'No data';
      
      mapTip.innerHTML = `
        <div class="tooltip-state">${abbr || 'Unknown'} (${currentYear})</div>
        <div class="tooltip-value" style="color:#ff1e2b;">Debt / Income Ratio: ${pctStr}</div>
        <div class="tooltip-value" style="font-size:11px; opacity:0.8;">Median Debt: ${debtStr}</div>
      `;
      mapTip.style.opacity = '1';
    })
    .on('mousemove', event => {
      mapTip.style.left = `${event.clientX + 14}px`;
      mapTip.style.top  = `${event.clientY - 10}px`;
    })
    .on('mouseleave', () => { mapTip.style.opacity = '0'; });

  updateMap();
}

function updateMap() {
  const container = document.getElementById('heatmap-container');
  const svg = d3.select(container).select('svg');
  if (svg.empty()) return;

  const { year, state } = getFilters();
  const activeYear = year === 'all' ? '2023' : year; 

  const yearData = allData.filter(d => d.year.toString() === activeYear && d.debt_to_income != null);
  const minVal = d3.min(yearData, d => d.debt_to_income) || 0.01;
  const maxVal = d3.max(yearData, d => d.debt_to_income) || 0.06;

  const colorScale = d3.scaleSequential()
    .domain([minVal, maxVal])
    .interpolator(d3.interpolate('#3a0d10', '#ff1e2b')); 

  svg.selectAll('.state-boundary')
    .transition()
    .duration(400)
    .attr('fill', d => {
      const abbr = fipsToAbbr[d.id];
      const record = yearData.find(r => r.state === abbr);
      return record ? colorScale(record.debt_to_income) : '#1a2638'; 
    });

  if (state !== 'all') {
    svg.selectAll('.state-boundary').style('stroke', d => fipsToAbbr[d.id] === state ? '#fff' : '#0a1628');
    svg.selectAll('.state-boundary').style('stroke-width', d => fipsToAbbr[d.id] === state ? '2' : '1.2');
  } else {
    svg.selectAll('.state-boundary').style('stroke', '#0a1628').style('stroke-width', '1.2');
  }
}

// ── 4. PANEL: BIZTOSÍTÁS NÉLKÜLI LAKOSSÁG VS. KÓRHÁZI HHI (KÉTTENGELYES DIAGRAM) ──

function createTwoLineTimeChart() {
  const targetId = document.getElementById('bar-chart') ? 'bar-chart' : 
                   document.getElementById('facet-grid-container') ? 'facet-grid-container' : 
                   document.getElementById('twoline-time-container') ? 'twoline-time-container' : 'uninsured-chart';
  const oldChart = document.getElementById(targetId);
  const container = oldChart ? oldChart.parentElement : document.querySelector('.chart-card:last-of-type');
  
  if(oldChart) oldChart.remove();
  
  if (container) {
    const h3 = container.querySelector('h3');
    if (h3) h3.textContent = "Uninsured Rate vs. Hospital Market Concentration (HHI)";
  }

  if(!document.getElementById('twoline-time-container')) {
    const structDiv = document.createElement('div');
    structDiv.id = 'twoline-time-container';
    structDiv.style.width = '100%';
    structDiv.style.height = '100%';
    if (container) container.appendChild(structDiv);
  }
  updateTwoLineTimeChart();
}

function updateTwoLineTimeChart() {
  const container = document.getElementById('twoline-time-container');
  if (!container) return;
  container.innerHTML = '';

  const margin = { top: 30, right: 80, bottom: 45, left: 65 };
  const width  = (container.clientWidth  || 600) - margin.left - margin.right;
  const height = (container.clientHeight || 320) - margin.top  - margin.bottom;

  const svg = d3.select(container)
    .append('svg')
    .attr('width',  width  + margin.left + margin.right)
    .attr('height', height + margin.top  + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Tooltip
  let timeTip = d3.select('#twoline-time-tip');
  if (timeTip.empty()) {
    timeTip = d3.select('body').append('div').attr('id', 'twoline-time-tip')
      .style('position', 'absolute').style('background', '#111a2e').style('color', '#fff')
      .style('padding', '10px 14px').style('border', '1px solid #00cfff').style('border-radius', '6px')
      .style('font-size', '12px').style('pointer-events', 'none').style('opacity', 0).style('z-index', '9999');
  }

  const { state } = getFilters();

  // Update badge
  const barBadge = document.getElementById('bar-badge');
  if (barBadge) barBadge.textContent = state === 'all' ? 'National' : state;
  const years = [2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023];
  const timelineData = years.map(year => {
    const sub = allData.filter(d => d.year === year && (state === 'all' || d.state === state));
    const u = avg(sub, 'uninsured');
    const h = avg(sub, 'hhi');
    // uninsured: értékek lehetnek 0-1 arányban vagy már százalékban — toPct kezeli
    return {
      year,
      uninsured: u != null ? toPct(u) : null,
      hhi:       h
    };
  }).filter(d => d.uninsured != null || d.hhi != null);

  if (!timelineData.length) {
    svg.append('text').attr('x', width / 2).attr('y', height / 2)
      .attr('text-anchor', 'middle').style('fill', '#8899a8').style('font-size', '13px')
      .text('No data available for the selected filter.');
    return;
  }

  // ── Skálák ──
  const xScale   = d3.scaleLinear().domain([2011, 2023]).range([0, width]);
  const yScaleU  = d3.scaleLinear().domain([0, 25]).range([height, 0]);   // Y1: 0–25%
  const yScaleH  = d3.scaleLinear().domain([0, 4000]).range([height, 0]); // Y2: 0–4000 HHI

  // ── X tengely ──
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale).tickValues(years).tickFormat(d3.format('d')))
    .call(g => g.selectAll('line, path').style('stroke', '#52667a'))
    .call(g => g.selectAll('text').style('fill', '#8899a8').style('font-size', '11px'));

  // X tengely felirat
  svg.append('text')
    .attr('x', width / 2).attr('y', height + 38)
    .attr('text-anchor', 'middle').style('fill', '#8899a8').style('font-size', '11px')
    .text('Year');

  // ── Y1 tengely (bal) — Biztosítás nélküliek aránya ──
  svg.append('g')
    .call(d3.axisLeft(yScaleU).ticks(6).tickFormat(d => d + '%'))
    .call(g => g.selectAll('line, path').style('stroke', '#52667a'))
    .call(g => g.selectAll('text').style('fill', '#00cfff').style('font-size', '11px'));

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2).attr('y', -52)
    .attr('text-anchor', 'middle').style('fill', '#00cfff').style('font-size', '11px')
    .text('Uninsured Population Rate (%)');

  // ── Y2 tengely (jobb) — HHI ──
  svg.append('g')
    .attr('transform', `translate(${width},0)`)
    .call(d3.axisRight(yScaleH).ticks(6).tickFormat(d => d.toLocaleString()))
    .call(g => g.selectAll('line, path').style('stroke', '#52667a'))
    .call(g => g.selectAll('text').style('fill', '#ff6b5b').style('font-size', '11px'));

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2).attr('y', width + 65)
    .attr('text-anchor', 'middle').style('fill', '#ff6b5b').style('font-size', '11px')
    .text('Hospital Market Concentration – HHI Index');

  // ── Rácsháló ──
  svg.append('g')
    .attr('opacity', 0.08)
    .call(d3.axisLeft(yScaleU).ticks(6).tickSize(-width).tickFormat(''))
    .call(g => g.selectAll('line').style('stroke', '#8899a8'));

  // ── Vonalak ──
  const uData = timelineData.filter(d => d.uninsured != null);
  const hData = timelineData.filter(d => d.hhi != null);

  const lineU = d3.line().x(d => xScale(d.year)).y(d => yScaleU(d.uninsured)).curve(d3.curveMonotoneX);
  const lineH = d3.line().x(d => xScale(d.year)).y(d => yScaleH(d.hhi)).curve(d3.curveMonotoneX);

  // Neon kék — Biztosítás nélküli arány
  svg.append('path').datum(uData)
    .attr('fill', 'none').attr('stroke', '#00cfff').attr('stroke-width', 2.8).attr('d', lineU);

  // Neon korall — HHI
  svg.append('path').datum(hData)
    .attr('fill', 'none').attr('stroke', '#ff6b5b').attr('stroke-width', 2.8).attr('d', lineH);

  // ── Adatpontok — Biztosítás nélküli (körök) ──
  svg.append('g').selectAll('.pt-u')
    .data(uData).join('circle').attr('class', 'pt-u')
    .attr('cx', d => xScale(d.year)).attr('cy', d => yScaleU(d.uninsured))
    .attr('r', 4.5).attr('fill', '#00cfff').attr('stroke', '#0a1628').attr('stroke-width', 1.2)
    .style('cursor', 'pointer')
    .on('mouseenter', (event, d) => showTip(event, d))
    .on('mouseleave', () => hideTip());

  // ── Adatpontok — HHI (rombusz) ──
  svg.append('g').selectAll('.pt-h')
    .data(hData).join('path').attr('class', 'pt-h')
    .attr('transform', d => `translate(${xScale(d.year)},${yScaleH(d.hhi)})`)
    .attr('d', d3.symbol().type(d3.symbolDiamond).size(55))
    .attr('fill', '#ff6b5b').attr('stroke', '#0a1628').attr('stroke-width', 1.2)
    .style('cursor', 'pointer')
    .on('mouseenter', (event, d) => showTip(event, d))
    .on('mouseleave', () => hideTip());

  // ── Jelmagyarázat ──
  const legend = svg.append('g').attr('transform', `translate(${width - 250}, -22)`);

  legend.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 18).attr('y2', 0)
    .attr('stroke', '#00cfff').attr('stroke-width', 2.5);
  legend.append('circle').attr('cx', 9).attr('cy', 0).attr('r', 3.5).attr('fill', '#00cfff');
  legend.append('text').attr('x', 22).attr('y', 4)
    .style('fill', '#8899a8').style('font-size', '10.5px').text('Uninsured Rate (%, left axis)');

  legend.append('line').attr('x1', 0).attr('y1', 18).attr('x2', 18).attr('y2', 18)
    .attr('stroke', '#ff6b5b').attr('stroke-width', 2.5);
  legend.append('path')
    .attr('transform', 'translate(9,18)')
    .attr('d', d3.symbol().type(d3.symbolDiamond).size(45))
    .attr('fill', '#ff6b5b');
  legend.append('text').attr('x', 22).attr('y', 22)
    .style('fill', '#8899a8').style('font-size', '10.5px').text('Hospital HHI Index (right axis)');

  // ── Tooltip függvények ──
  function showTip(event, d) {
    const label = state === 'all' ? 'U.S. Average' : state;
    timeTip.style('opacity', 1)
      .html(`
        <div style="font-weight:bold;color:#00cfff;margin-bottom:5px;">Year: ${d.year} · ${label}</div>
        ${d.uninsured != null ? `<span style="color:#00cfff;">●</span> Uninsured Rate: <strong>${d.uninsured.toFixed(1)}%</strong><br/>` : ''}
        ${d.hhi       != null ? `<span style="color:#ff6b5b;">◆</span> Hospital HHI Index: <strong>${Math.round(d.hhi).toLocaleString()}</strong>` : ''}
      `);
    timeTip.style('left', (event.clientX + 15) + 'px').style('top', (event.clientY - 15) + 'px');
  }
  function hideTip() { timeTip.style('opacity', 0); }
}

// ── Chart.js ábrák (1. és 3. ábra) ───────────────────────────────

function createCharts() {
  const GRID   = 'rgba(42,58,77,0.3)';
  const TICK   = { color: '#8899a8', font: { size: 11 } };
  const TIP_BG = '#162236';

  // 1. DIAGRAM
  const t = getTrendData('all');
  lineChart = new Chart(document.getElementById('line-chart'), {
    type: 'line',
    data: {
      labels: t.map(d => d.year),
      datasets: [{
        data: t.map(d => d.value),
        borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)',
        borderWidth: 2.5, fill: true, tension: 0.3,
        pointRadius: 5, pointBackgroundColor: '#00d4ff',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: TIP_BG,
        callbacks: { label: c => `Share with Medical Debt: ${Number(c.raw).toFixed(1)}%` } } },
      scales: {
        x: { ticks: TICK, grid: { color: GRID } },
        y: { min: 0, ticks: { ...TICK, callback: v => v.toFixed(0) + '%' }, grid: { color: GRID } },
      },
    },
  });

  // 3. DIAGRAM
  const sd = getScatterData('all', 'all');
  scatterChart = new Chart(document.getElementById('scatter-chart'), {
    type: 'scatter',
    data: { datasets: [{ data: sd,
      backgroundColor: 'rgba(0,212,255,0.7)', borderColor: '#00d4ff',
      pointRadius: 7, pointHoverRadius: 11 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: TIP_BG,
        callbacks: { label: c => `${c.raw.state}: ${c.raw.x.toFixed(1)}% with medical debt / ${Math.round(c.raw.y).toLocaleString()} USD median debt` } } },
      scales: {
        x: { title: { display: true, text: 'Share with Medical Debt (%)', color: '#8899a8', font: { size: 11 } },
          ticks: TICK, grid: { color: GRID }, min: 0, max: 30 },
        y: { title: { display: true, text: 'Median Medical Debt (USD)', color: '#8899a8', font: { size: 11 } },
          ticks: { ...TICK, callback: v => v.toLocaleString() + ' $' }, grid: { color: GRID },
          min: 0, max: sd.length ? Math.max(...sd.map(d => d.y)) * 1.1 : 2000 },
      },
    },
  });
}

function updateLineChart() {
  const { state } = getFilters();
  const d = getTrendData(state);
  lineChart.data.labels = d.map(r => r.year);
  lineChart.data.datasets[0].data = d.map(r => r.value);
  document.getElementById('trend-badge').textContent = state === 'all' ? 'National Average' : state;
  lineChart.update('active');
}

function updateScatterChart() {
  const { year, state } = getFilters();
  const d = getScatterData(year, state);
  scatterChart.data.datasets[0].data = d;
  if (d.length) scatterChart.options.scales.y.max = Math.max(...d.map(r => r.y)) * 1.1;
  document.getElementById('scatter-badge').textContent = year === 'all' ? 'All Years' : year;
  scatterChart.update('active');
}

// ── Magyar nyelvű szöveges elemzések (Insights) ──────────────────

function updateInsights() {
  const { year, state } = getFilters();

  const t = getTrendData(state);
  if (t.length >= 2) {
    const chg = ((t[t.length-1].value - t[0].value) / t[0].value * 100).toFixed(0);
    const dir = chg > 0 ? 'increased' : 'decreased';
    const lbl = state === 'all' ? 'National average' : state;
    document.getElementById('line-insight').innerHTML = Math.abs(chg) < 5
      ? 'The medical debt rate remained relatively stable during this period.'
      : `<strong>${lbl}</strong> ${Math.abs(chg)}% ${dir} between ${t[0].year} and ${t[t.length-1].year}.`;
  }

  const activeYear = year === 'all' ? '2023' : year;
  const yearData = allData.filter(d => d.year.toString() === activeYear && d.debt_to_income != null).sort((a,b) => b.debt_to_income - a.debt_to_income);
  if (yearData.length) {
    document.getElementById('map-insight').innerHTML = 
      `${activeYear} — Highest debt-to-income ratio: <strong>${yearData[0].state}</strong> (${(yearData[0].debt_to_income*100).toFixed(1)}%), ` +
      `Lowest: <strong>${yearData[yearData.length-1].state}</strong> (${(yearData[yearData.length-1].debt_to_income*100).toFixed(1)}%).`;
  }

  const sd = getScatterData(year, state).sort((a,b) => b.x - a.x);
  if (sd.length >= 2) {
    document.getElementById('scatter-insight').innerHTML =
      `Highest debt rate state: <strong>${sd[0].state}</strong> (${sd[0].x.toFixed(1)}%). Lowest: <strong>${sd[sd.length-1].state}</strong> (${sd[sd.length-1].x.toFixed(1)}%).`;
  }

  const insightEl = document.getElementById('bar-insight') || document.getElementById('uninsured-insight');
  if (insightEl) {
    insightEl.innerHTML = `<strong>Systemic Correlation:</strong> The dual-axis chart shows the parallel trends of the uninsured population rate and hospital market concentration (HHI Index) from 2011 to 2023.`;
  }
}

function setupEventListeners() {
  document.getElementById('year-select').addEventListener('change', () => {
    updateLineChart(); updateScatterChart(); updateTwoLineTimeChart(); updateMap(); updateInsights();
  });
  document.getElementById('state-select').addEventListener('change', () => {
    updateLineChart(); updateScatterChart(); updateTwoLineTimeChart(); updateMap(); updateInsights();
  });
}

loadData();