(function () {
    const $ = id => document.getElementById(id);
    const fmt = n => Math.round(n).toLocaleString('es-ES');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const STATE_ORDER = ['fluido', 'denso', 'congestionado', 'cortado', 'sin datos'];
    let all = [];
    let filtered = [];
    let statusChart, intensityChart, topChart, map, layer;

    function parse(geojson) {
        return geojson.features.map(f => {
            const p = f.properties;
            const imv = /^\d+$/.test(p.imv || '') ? parseInt(p.imv, 10) : null;
            const state = CONFIG.states[p.estado] || 'sin datos';
            return {
                id: p.idtramo,
                name: p.des_tramo || p.idtramo,
                imv,
                state: imv === null ? 'sin datos' : state,
                geometry: f.geometry
            };
        });
    }

    async function load() {
        try {
            const res = await fetch(CONFIG.apiUrl);
            if (!res.ok) throw new Error(res.status);
            all = parse(await res.json());
            $('updatedAt').textContent = 'actualizado ' + new Date().toLocaleTimeString('es-ES');
            applyFilters();
        } catch (e) {
            $('updatedAt').textContent = 'error al cargar datos';
        }
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
        $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });

        load();
        setInterval(load, CONFIG.refreshMs);
    }

    function applyFilters() {
        const q = $('searchInput').value.trim().toLowerCase();
        const min = parseInt($('minIntensity').value, 10) || 0;
        const states = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(c => c.value);
        filtered = all.filter(r =>
            (!q || r.name.toLowerCase().includes(q)) &&
            states.includes(r.state) &&
            (min === 0 || (r.imv !== null && r.imv >= min)));
        render();
    }

    function resetFilters() {
        $('searchInput').value = '';
        $('minIntensity').value = 0;
        document.querySelectorAll('.checkbox-group input').forEach(c => (c.checked = true));
        applyFilters();
    }

    const withData = () => filtered.filter(r => r.imv !== null);

    function render() {
        renderKPIs();
        renderStatus();
        renderIntensity();
        renderMap();
        renderTop();
        renderTable();
        renderStats();
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

    function colorFor(r) {
        if (r.imv === null) return CONFIG.colors['sin datos'];
        if (r.state !== 'fluido') return CONFIG.colors[r.state];
        return r.imv > 2000 ? '#e67e22' : r.imv > 1000 ? '#f1c40f' : CONFIG.colors.fluido;
    }

    function renderMap() {
        layer.clearLayers();
        filtered.forEach(r => {
            if (!r.geometry || r.geometry.type !== 'LineString') return;
            const latlngs = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            L.polyline(latlngs, { color: colorFor(r), weight: 5, opacity: 0.85 })
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
