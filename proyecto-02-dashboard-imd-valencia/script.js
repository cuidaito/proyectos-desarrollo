(function () {
    const $ = id => document.getElementById(id);
    const fmt = n => Math.round(n).toLocaleString('es-ES');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const STATE_ORDER = ['fluido', 'denso', 'congestionado', 'cortado', 'sin datos'];
    let all = [];
    let filtered = [];
    let base = [];
    let statusChart, intensityChart, topChart, historyChart, map, layer;
    let history = [];

    function parse(geojson) {
        const byId = new Map();
        geojson.features.forEach(f => {
            const p = f.properties;
            if (!p.idtramo) return;
            const imv = /^\d+$/.test(p.imv || '') ? parseInt(p.imv, 10) : null;
            byId.set(p.idtramo, {
                id: p.idtramo,
                name: p.des_tramo || p.idtramo,
                imv,
                state: imv === null ? 'sin datos' : (CONFIG.states[p.estado] || 'sin datos'),
                geometry: f.geometry
            });
        });
        return [...byId.values()];
    }

    async function load() {
        try {
            const res = await fetch(CONFIG.apiUrl);
            if (!res.ok) throw new Error(res.status);
            all = parse(await res.json());
            const now = new Date().toLocaleString('es-ES');
            $('liveUpdate').textContent = now;
            $('updatedAt').textContent = 'actualizado ' + now;
            fillTramoList();
            applyFilters();
        } catch (e) {
            console.error(e);
            $('liveUpdate').textContent = 'error al cargar datos: ' + e.message;
            $('updatedAt').textContent = 'error al cargar datos';
        }
    }

    function fillTramoList() {
        const sel = $('tramoSelect');
        const current = sel.value;
        const options = all.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`);
        sel.innerHTML = '<option value="all">Todos los tramos</option>' + options.join('');
        sel.value = all.some(r => r.id === current) ? current : 'all';
    }

    async function loadHistory() {
        const days = parseInt($('historyRange').value, 10);
        try {
            const res = await fetch('api/history', {
                method: 'POST',
                body: JSON.stringify({ days, tramo: $('tramoSelect').value, ids: filtered.map(r => r.id) })
            });
            if (!res.ok) throw new Error(res.status);
            history = await res.json();
        } catch (e) {
            history = [];
        }
        if (history.length) {
            $('historyUpdate').textContent = new Date(history[history.length - 1].t).toLocaleString('es-ES');
        }
        renderHistory();
    }

    function renderHistory() {
        const id = $('tramoSelect').value;
        const tramo = all.find(r => r.id === id);
        $('historyTitle').textContent = id === 'all' ? 'Histórico de intensidad (media de los tramos)' : `Histórico: ${tramo ? tramo.name : id}`;
        const points = history;
        $('historyNote').textContent = history.length
            ? `${history.length} ${history.length === 1 ? 'punto' : 'puntos'}.${history.length < 10 ? ' Aún hay pocos datos: la tendencia será fiable cuando se acumulen más capturas.' : ''}`
            : 'Aún no hay histórico disponible: solo existe cuando la web corre en el contenedor y ya ha capturado datos.';
        historyChart = replaceChart(historyChart, 'historyChart', {
            type: 'line',
            data: {
                labels: points.map(p => new Date(p.t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
                datasets: [{
                    label: 'Intensidad (veh/h)',
                    data: points.map(p => p.y),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.15)',
                    fill: true,
                    tension: 0.25,
                    spanGaps: true,
                    pointRadius: points.length > 100 ? 0 : 3
                }]
            },
            options: { scales: { y: { beginAtZero: true } } }
        });
    }

    function init() {
        map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        layer = L.layerGroup().addTo(map);

        $('applyFilters').addEventListener('click', applyFilters);
        $('resetFilters').addEventListener('click', resetFilters);
        $('exportBtn').addEventListener('click', exportCSV);
        $('themeToggle').addEventListener('click', toggleTheme);
        $('legend').addEventListener('click', e => {
            const chip = e.target.closest('.legend-chip');
            if (!chip) return;
            const set = hidden[mode];
            set.has(chip.dataset.key) ? set.delete(chip.dataset.key) : set.add(chip.dataset.key);
            applyFilters();
        });
        document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
            mode = b.dataset.mode;
            document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
            applyFilters();
        }));
        $('tramoSelect').addEventListener('change', () => { applyFilters(); zoomToSelected(); });
        $('historyRange').addEventListener('change', loadHistory);

        load().then(loadHistory);
        setInterval(load, CONFIG.refreshMs);
        setInterval(loadHistory, 10 * 60000);
    }

    function applyFilters() {
        const sel = $('tramoSelect').value;
        const min = parseInt($('minIntensity').value, 10) || 0;
        base = all.filter(r =>
            !hidden[mode].has(categoryOf(r)) &&
            (min === 0 || (r.imv !== null && r.imv >= min)));
        filtered = base.filter(r => sel === 'all' || r.id === sel);
        render();
    }

    function resetFilters() {
        $('tramoSelect').value = 'all';
        $('minIntensity').value = 0;
        hidden.intensidad.clear();
        hidden.estado.clear();
        applyFilters();
        zoomToSelected();
    }

    function zoomToSelected() {
        const r = all.find(x => x.id === $('tramoSelect').value);
        if (r && r.geometry && r.geometry.type === 'LineString') {
            map.fitBounds(r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), { maxZoom: 17, padding: [40, 40] });
            layer.eachLayer(l => { if (l.options.tramoId === r.id) l.openPopup(); });
        } else {
            map.setView(CONFIG.mapCenter, CONFIG.mapZoom);
        }
    }

    const withData = () => filtered.filter(r => r.imv !== null);

    function render() {
        renderKPIs();
        renderStatus();
        renderIntensity();
        renderLegend();
        renderMap();
        renderTop();
        renderTable();
        renderStats();
        loadHistory();
    }

    function renderKPIs() {
        const d = withData();
        const vals = d.map(r => r.imv);
        $('avgValue').textContent = vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length) : '-';
        const max = d.reduce((m, r) => (!m || r.imv > m.imv ? r : m), null);
        const min = d.reduce((m, r) => (!m || r.imv < m.imv ? r : m), null);
        $('maxValue').textContent = max ? fmt(max.imv) : '-';
        $('minValue').textContent = min ? fmt(min.imv) : '-';
        $('maxValue').title = max ? max.name : '';
        $('minValue').title = min ? min.name : '';
        $('statusValue').textContent = fmt(all.length);
    }

    function replaceChart(chart, id, config) {
        if (chart) chart.destroy();
        config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options);
        return new Chart($(id), config);
    }

    function renderStatus() {
        const counts = STATE_ORDER.map(s => filtered.filter(r => r.state === s).length);
        statusChart = replaceChart(statusChart, 'trendChart', {
            type: 'doughnut',
            data: {
                labels: STATE_ORDER,
                datasets: [{ data: counts, backgroundColor: STATE_ORDER.map(s => CONFIG.colors[s]) }]
            }
        });
    }

    function renderIntensity() {
        const bins = [[0, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, Infinity]];
        const labels = bins.map(([a, b]) => (b === Infinity ? `>${a}` : `${a}-${b}`));
        const d = withData();
        intensityChart = replaceChart(intensityChart, 'hourlyChart', {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Nº de tramos (veh/h)',
                    data: bins.map(([a, b]) => d.filter(r => r.imv >= a && r.imv < b).length),
                    backgroundColor: '#764ba2'
                }]
            }
        });
    }

    const SCHEMES = {
        intensidad: [
            { key: 'baja', label: 'Baja (<1000)', color: '#2ecc71' },
            { key: 'media', label: 'Media (1000-2000)', color: '#f1c40f' },
            { key: 'alta', label: 'Alta (2000-4000)', color: '#e67e22' },
            { key: 'muy alta', label: 'Muy alta (>4000)', color: '#e74c3c' },
            { key: 'sin datos', label: 'Sin datos', color: CONFIG.colors['sin datos'] }
        ],
        estado: STATE_ORDER.map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1), color: CONFIG.colors[k] }))
    };
    let mode = 'intensidad';
    const hidden = { intensidad: new Set(), estado: new Set() };

    function categoryOf(r, m = mode) {
        if (m === 'estado') return r.state;
        if (r.imv === null) return 'sin datos';
        return r.imv < 1000 ? 'baja' : r.imv < 2000 ? 'media' : r.imv < 4000 ? 'alta' : 'muy alta';
    }

    function colorFor(r) {
        return SCHEMES[mode].find(c => c.key === categoryOf(r)).color;
    }

    function renderLegend() {
        const min = parseInt($('minIntensity').value, 10) || 0;
        const pool = all.filter(r => min === 0 || (r.imv !== null && r.imv >= min));
        $('legend').innerHTML = SCHEMES[mode].map(c => {
            const n = pool.filter(r => categoryOf(r) === c.key).length;
            return `<button type="button" class="legend-chip${hidden[mode].has(c.key) ? ' off' : ''}" data-key="${c.key}">` +
                `<span class="dot" style="background:${c.color}"></span>${c.label} <span class="n">${n}</span></button>`;
        }).join('');
    }

    function renderMap() {
        layer.clearLayers();
        base.forEach(r => {
            if (!r.geometry || r.geometry.type !== 'LineString') return;
            const latlngs = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            L.polyline(latlngs, { color: colorFor(r), weight: r.id === $('tramoSelect').value ? 8 : 5, opacity: 0.85, tramoId: r.id })
                .bindPopup(`<strong>${esc(r.name)}</strong><br>Intensidad: ${r.imv === null ? 'sin datos' : fmt(r.imv) + ' veh/h'}<br>Estado: ${r.state}`)
                .addTo(layer);
        });
    }

    function renderTop() {
        const top = withData().slice().sort((a, b) => b.imv - a.imv).slice(0, 15);
        topChart = replaceChart(topChart, 'comparisonChart', {
            type: 'bar',
            data: {
                labels: top.map(r => r.name),
                datasets: [{ label: 'Intensidad (veh/h)', data: top.map(r => r.imv), backgroundColor: '#4facfe' }]
            },
            options: { indexAxis: 'y' }
        });
    }

    function renderTable() {
        const rows = filtered.slice().sort((a, b) => (b.imv ?? -1) - (a.imv ?? -1));
        $('tableBody').innerHTML = rows.map(r => `
            <tr>
                <td>${esc(r.id)}</td>
                <td>${esc(r.name)}</td>
                <td>${r.imv === null ? '-' : fmt(r.imv)}</td>
                <td><span class="badge" style="background:${CONFIG.colors[r.state]}">${r.state}</span></td>
            </tr>`).join('');
    }

    function renderStats() {
        const d = withData().map(r => r.imv).sort((a, b) => a - b);
        $('totalRecords').textContent = fmt(filtered.length);
        $('totalZones').textContent = fmt(d.length);
        $('weeklyAvg').textContent = d.length ? fmt(d[Math.floor(d.length / 2)]) : '-';
        const busy = filtered.filter(r => ['denso', 'congestionado', 'cortado'].includes(r.state)).length;
        $('variation').textContent = filtered.length ? `${(busy / filtered.length * 100).toFixed(1)}%` : '0%';
    }

    function exportCSV() {
        const header = 'id,tramo,intensidad_veh_h,estado';
        const lines = filtered.map(r => [r.id, `"${String(r.name).replace(/"/g, '""')}"`, r.imv ?? '', r.state].join(','));
        const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'trafico-valencia.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function toggleTheme() {
        document.body.classList.toggle('dark');
        $('themeToggle').innerHTML = `<i class="fas fa-${document.body.classList.contains('dark') ? 'sun' : 'moon'}"></i>`;
    }

    document.addEventListener('DOMContentLoaded', init);
})();

// La base SQLite solo existe cuando el dashboard corre en el contenedor.
if (!location.hostname.endsWith('github.io')) {
    fetch('api/health').then(r => r.json()).then(h => {
        if (h.ok) document.getElementById('dbLink').hidden = false;
    }).catch(() => {});
}
