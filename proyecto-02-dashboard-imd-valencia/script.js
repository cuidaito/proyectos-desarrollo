(() => {
  const config = window.IMD_CONFIG || {};
  const numberFormat = new Intl.NumberFormat('es-ES');
  const dateFormat = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const state = { stations: [], readings: [], vehicleTypeShares: [], liveRows: [], map: null, markers: [], charts: {} };
  const $ = (selector) => document.querySelector(selector);

  async function loadDashboard() {
    try {
      const response = await fetch('data/imd-demo.json');
      if (!response.ok) throw new Error('No se pudieron cargar los datos de demostración');
      const data = await response.json();
      state.stations = data.stations;
      state.readings = data.readings;
      state.vehicleTypeShares = data.vehicleTypeShares || [];
      populateZones();
      renderDashboard();
      setUpdatedAt('Datos de demostración');
      initializeMap();
      await loadLiveData();
    } catch (error) {
      $('#live-message').textContent = error.message;
      $('#map-status').textContent = 'No se pudieron cargar los datos.';
      $('#updated-at').textContent = 'Datos no disponibles';
    }
  }

  function populateZones() {
    const zones = [...new Set(state.stations.map((station) => station.zone))].sort((a, b) => a.localeCompare(b, 'es'));
    ['#zone-filter', '#trend-zone'].forEach((selector) => {
      const select = $(selector);
      zones.forEach((zone) => {
        const option = document.createElement('option');
        option.value = zone;
        option.textContent = zone;
        select.append(option);
      });
    });
  }

  function selectedReadings() {
    const zone = $('#zone-filter').value;
    const from = $('#date-from').value;
    const to = $('#date-to').value;
    const search = $('#search-input').value.trim().toLocaleLowerCase('es');
    const stations = new Map(state.stations.map((station) => [station.id, station]));
    return state.readings.map((reading) => ({ ...reading, station: stations.get(reading.stationId), source: 'Muestra' }))
      .filter((reading) => reading.station)
      .filter((reading) => !zone || reading.station.zone === zone)
      .filter((reading) => !from || reading.date >= from)
      .filter((reading) => !to || reading.date <= to)
      .filter((reading) => {
        const target = `${reading.station.name} ${reading.station.zone}`.toLocaleLowerCase('es');
        return !search || target.includes(search);
      });
  }

  function filteredStations() {
    const zone = $('#zone-filter').value;
    const search = $('#search-input').value.trim().toLocaleLowerCase('es');
    return state.stations.filter((station) => (!zone || station.zone === zone)
      && (!search || `${station.name} ${station.zone}`.toLocaleLowerCase('es').includes(search)));
  }

  function renderDashboard() {
    const stations = filteredStations();
    const readings = selectedReadings();
    renderKpis(stations);
    renderTable(readings);
    renderCharts(readings, stations);
    updateMap(stations);
  }

  function renderKpis(stations) {
    const values = stations.map((station) => station.imd).filter(Number.isFinite);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const maximum = stations.reduce((result, station) => (!result || station.imd > result.imd ? station : result), null);
    const minimum = stations.reduce((result, station) => (!result || station.imd < result.imd ? station : result), null);
    $('#kpi-average').textContent = average === null ? '—' : numberFormat.format(Math.round(average));
    $('#kpi-maximum').textContent = maximum ? numberFormat.format(maximum.imd) : '—';
    $('#maximum-location').textContent = maximum ? maximum.name : 'Sin puntos de medición';
    $('#kpi-minimum').textContent = minimum ? numberFormat.format(minimum.imd) : '—';
    $('#minimum-location').textContent = minimum ? minimum.name : 'Sin puntos de medición';
    $('#kpi-live').textContent = state.liveRows.length ? 'Conectado' : 'Sin conexión';
    $('#feed-caption').textContent = state.liveRows.length ? `${numberFormat.format(state.liveRows.length)} registros recibidos` : 'Feed municipal no disponible';
  }

  function renderTable(readings) {
    const tbody = $('#readings-table');
    tbody.replaceChildren();
    const live = filteredLiveRows();
    const rows = [...live, ...readings].sort((a, b) => b.date.localeCompare(a.date) || a.station.name.localeCompare(b.station.name, 'es'));
    rows.forEach((reading) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.className = 'street-name';
      name.textContent = reading.station.name;
      const zone = document.createElement('td');
      zone.textContent = reading.station.zone;
      const date = document.createElement('td');
      date.textContent = formatDate(reading.date);
      const imd = document.createElement('td');
      imd.className = 'imd-cell';
      imd.textContent = Number.isFinite(reading.imd) ? numberFormat.format(reading.imd) : '—';
      const source = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `source-badge${reading.source === 'Tiempo real' ? ' live-badge' : ''}`;
      badge.textContent = reading.source;
      source.append(badge);
      tr.append(name, zone, date, imd, source);
      tbody.append(tr);
    });
    $('#empty-state').hidden = rows.length > 0;
    $('#table-count').textContent = `${numberFormat.format(rows.length)} registros`;
  }

  function renderCharts(readings, stations) {
    if (!window.Chart) return;
    const trendZone = $('#trend-zone').value;
    const zoneStations = trendZone ? stations.filter((station) => station.zone === trendZone) : stations;
    const ids = new Set(zoneStations.map((station) => station.id));
    const history = readings.filter((reading) => ids.has(reading.stationId));
    const dates = [...new Set(history.map((reading) => reading.date))].sort();
    const values = dates.map((date) => {
      const dayReadings = history.filter((reading) => reading.date === date);
      return dayReadings.length ? Math.round(dayReadings.reduce((sum, row) => sum + row.imd, 0) / dayReadings.length) : null;
    });
    const axesColor = getComputedStyle(document.body).getPropertyValue('--muted').trim();
    const gridColor = getComputedStyle(document.body).getPropertyValue('--line').trim();
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: axesColor, font: { family: 'DM Sans', size: 11 } }, border: { display: false } },
        y: { grid: { color: gridColor }, ticks: { color: axesColor, font: { family: 'DM Sans', size: 11 }, callback: (value) => `${numberFormat.format(value / 1000)}k` }, border: { display: false } }
      }
    };
    const trendCanvas = $('#trend-chart');
    if (state.charts.trend) state.charts.trend.destroy();
    state.charts.trend = new Chart(trendCanvas, {
      type: 'line',
      data: { labels: dates.map(formatShortDate), datasets: [{ data: values, borderColor: '#31c7a0', backgroundColor: 'rgba(49, 199, 160, .14)', borderWidth: 2.5, fill: true, tension: .38, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#31c7a0' }] },
      options: { ...commonOptions, interaction: { intersect: false, mode: 'index' } }
    });
    const topStations = [...stations].sort((a, b) => b.imd - a.imd).slice(0, 5);
    if (state.charts.compare) state.charts.compare.destroy();
    state.charts.compare = new Chart($('#compare-chart'), {
      type: 'bar',
      data: { labels: topStations.map((station) => shortName(station.name)), datasets: [{ data: topStations.map((station) => station.imd), backgroundColor: topStations.map((_, index) => index === 0 ? '#31c7a0' : 'rgba(49, 199, 160, .42)'), borderRadius: 5, barThickness: 15 }] },
      options: { ...commonOptions, indexAxis: 'y', scales: { x: { ...commonOptions.scales.x, beginAtZero: true }, y: { ...commonOptions.scales.y, grid: { display: false } } } }
    });
    if (state.charts.vehicles) state.charts.vehicles.destroy();
    state.charts.vehicles = new Chart($('#vehicle-chart'), {
      type: 'doughnut',
      data: {
        labels: state.vehicleTypeShares.map((item) => item.type),
        datasets: [{ data: state.vehicleTypeShares.map((item) => item.share), backgroundColor: ['#31c7a0', '#6b93d7', '#f2b35e', '#a88be8'], borderColor: getComputedStyle(document.body).getPropertyValue('--surface').trim(), borderWidth: 3, hoverOffset: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${context.raw}% (demostración)` } } } }
    });
  }

  function initializeMap() {
    if (!window.L) {
      $('#map-status').textContent = 'Biblioteca cartográfica no disponible.';
      return;
    }
    state.map = L.map('traffic-map', { scrollWheelZoom: false, zoomControl: true }).setView([39.4699, -0.3763], 12);
    state.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19
    }).addTo(state.map);
    $('#map-status').textContent = 'València · OpenStreetMap';
    updateMap(filteredStations());
  }

  function updateMap(stations) {
    if (!state.map) return;
    state.markers.forEach((marker) => marker.remove());
    state.markers = [];
    stations.forEach((station) => {
      const ratio = station.imd / 33000;
      const color = ratio > .8 ? '#f26d70' : ratio > .62 ? '#f2b35e' : '#31c7a0';
      const heat = L.circle([station.lat, station.lng], { radius: 360, color, weight: 0, fillColor: color, fillOpacity: .16, interactive: false }).addTo(state.map);
      const marker = L.circleMarker([station.lat, station.lng], { radius: 7, color: '#101923', weight: 2, fillColor: color, fillOpacity: .95 })
        .bindPopup(`<strong>${escapeHtml(station.name)}</strong><br>${numberFormat.format(station.imd)} vehículos/día · demostración`)
        .addTo(state.map);
      state.markers.push(heat, marker);
    });
  }

  async function loadLiveData() {
    if (!config.apiUrl) {
      setFeedUnavailable('La API municipal no está configurada.');
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), config.requestTimeoutMs || 10000);
    try {
      const response = await fetch(config.apiUrl, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`La API respondió con estado ${response.status}`);
      const payload = await response.json();
      const records = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.records) ? payload.records : [];
      state.liveRows = records.map(normalizeLiveRecord).filter(Boolean);
      $('#live-count').textContent = numberFormat.format(state.liveRows.length);
      $('#live-message').textContent = state.liveRows.length
        ? `${numberFormat.format(state.liveRows.length)} registros recibidos. El feed informa del estado del tráfico; no necesariamente contiene aforos IMD.`
        : 'La API respondió, pero no devolvió registros con una ubicación reconocible.';
      $('#kpi-live').textContent = 'Conectado';
      $('#feed-caption').textContent = `${numberFormat.format(state.liveRows.length)} registros recibidos`;
      $('#updated-at').textContent = `Actualizado ${new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
      renderTable(selectedReadings());
    } catch (error) {
      setFeedUnavailable(error.name === 'AbortError' ? 'La conexión con la API ha superado el tiempo de espera.' : 'No se pudo consultar el feed municipal. Puede estar temporalmente inaccesible o bloquear solicitudes desde el navegador.');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalizeLiveRecord(record) {
    const fields = record && typeof record === 'object' ? record : {};
    const name = firstValue(fields, ['nom', 'name', 'via', 'carrer', 'calle', 'ubicacio', 'ubicación', 'description', 'descripcio', 'titulo', 'title']);
    if (!name) return null;
    const point = fields.geo_point_2d || fields.geo_point || fields.coordinates;
    const lat = Number(point && (point.lat ?? point.latitude));
    const lng = Number(point && (point.lon ?? point.lng ?? point.longitude));
    const imdValue = Object.entries(fields).find(([key, value]) => /(^imd$|intensitat|intensidad|aforo|traffic_count|vehicle_count)/i.test(key) && Number.isFinite(parseNumber(value)));
    return {
      name: String(name),
      zone: String(firstValue(fields, ['zona', 'district', 'districte', 'barrio', 'barri']) || '—'),
      date: new Date().toISOString().slice(0, 10),
      imd: imdValue ? parseNumber(imdValue[1]) : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }

  function filteredLiveRows() {
    const term = $('#search-input').value.trim().toLocaleLowerCase('es');
    const zone = $('#zone-filter').value;
    const from = $('#date-from').value;
    const to = $('#date-to').value;
    return state.liveRows.filter((row) => {
      const textMatches = !term || `${row.name} ${row.zone}`.toLocaleLowerCase('es').includes(term);
      return textMatches && (!zone || row.zone === zone) && (!from || row.date >= from) && (!to || row.date <= to);
    }).map((row) => ({
      date: row.date,
      imd: row.imd,
      station: { name: row.name, zone: row.zone || '—' },
      source: 'Tiempo real'
    }));
  }

  function firstValue(object, keys) {
    const entries = Object.entries(object);
    for (const key of keys) {
      const match = entries.find(([candidate]) => candidate.toLocaleLowerCase('es') === key);
      if (match && match[1] !== null && match[1] !== undefined && String(match[1]).trim()) {
        const value = match[1];
        if (typeof value === 'string' || typeof value === 'number') return value;
      }
    }
    return null;
  }

  function parseNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function setFeedUnavailable(message) {
    state.liveRows = [];
    $('#live-count').textContent = '—';
    $('#live-message').textContent = message;
    $('#kpi-live').textContent = 'Sin conexión';
    $('#feed-caption').textContent = 'Feed municipal no disponible';
  }

  function setUpdatedAt(text) {
    $('#updated-at').textContent = text;
  }

  function formatDate(value) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.valueOf()) ? '—' : dateFormat.format(date);
  }

  function formatShortDate(value) {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
  }

  function shortName(name) {
    return name.replace(/^Avenida\s+/i, 'Av. ').replace(/^Avinguda\s+/i, 'Av. ').replace(/^Gran Via/i, 'Gran Via');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function downloadFile(contents, filename, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportRows() {
    return [...filteredLiveRows(), ...selectedReadings()].map((reading) => ({
      calle: reading.station.name,
      zona: reading.station.zone,
      fecha: reading.date,
      imd_vehiculos_dia: Number.isFinite(reading.imd) ? reading.imd : null,
      fuente: reading.source === 'Tiempo real' ? 'Valencia Open Data' : 'Datos demostrativos no oficiales'
    }));
  }

  $('#zone-filter').addEventListener('change', renderDashboard);
  $('#trend-zone').addEventListener('change', renderDashboard);
  ['#date-from', '#date-to', '#search-input'].forEach((selector) => $(selector).addEventListener('input', renderDashboard));
  $('#download-csv').addEventListener('click', () => {
    const rows = exportRows();
    const header = ['calle', 'zona', 'fecha', 'imd_vehiculos_dia', 'fuente'];
    const csv = [header, ...rows.map((row) => header.map((key) => row[key]))]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadFile(`\uFEFF${csv}`, 'imd-valencia.csv', 'text/csv;charset=utf-8');
  });
  $('#download-json').addEventListener('click', () => downloadFile(JSON.stringify(exportRows(), null, 2), 'imd-valencia.json', 'application/json'));
  $('#notice-dismiss').addEventListener('click', () => $('#data-notice').remove());
  $('#theme-toggle').addEventListener('click', () => {
    const dark = document.body.classList.toggle('dark-theme');
    $('#theme-toggle').setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    $('#theme-toggle').title = dark ? 'Activar modo claro' : 'Activar modo oscuro';
    if (state.tileLayer && state.map) {
      state.tileLayer.setUrl(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`);
    }
    renderCharts(selectedReadings(), filteredStations());
  });

  loadDashboard();
})();
