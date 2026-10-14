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
    const dayCache = {};

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

    async function getJSON(file) {
        const res = await fetch(CONFIG.historyBase + file);
        if (!res.ok) throw new Error(res.status);
        return res.json();
    }

    async function loadHistory() {
        const days = parseInt($('historyRange').value, 10);
        try {
            const index = await getJSON('index.json');
            const wanted = index.slice(-(days + 1));
            await Promise.all(wanted.map(async d => {
                if (!dayCache[d] || d === index[index.length - 1]) dayCache[d] = await getJSON(`history/${d}.json`);
            }));
            const since = Date.now() - days * 86400000;
            history = wanted.flatMap(d => dayCache[d]).filter(s => Date.parse(s.t) >= since);
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
        const ids = new Set(filtered.map(r => r.id));
        const points = history.map(s => {
            let vals;
            if (id === 'all') vals = Object.entries(s.v).filter(([k]) => ids.has(k)).map(([, v]) => v[0]);
            else vals = s.v[id] ? [s.v[id][0]] : [];
            return { t: s.t, y: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
        });
        $('historyNote').textContent = history.length
            ? `${history.length} capturas (una cada 30 min).`
            : 'Aún no hay histórico disponible: las capturas se acumulan automáticamente cada 30 minutos.';
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
            }
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
        $('tramoSelect').addEventListener('change', () => { applyFilters(); zoomToSelected(); });
        $('historyRange').addEventListener('change', loadHistory);

        load().then(loadHistory);
        setInterval(load, CONFIG.refreshMs);
        setInterval(loadHistory, 10 * 60000);
    }

    function applyFilters() {
        const sel = $('tramoSelect').value;
        const min = parseInt($('minIntensity').value, 10) || 0;
        const states = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(c => c.value);
        base = all.filter(r =>
            states.includes(r.state) &&
            (min === 0 || (r.imv !== null && r.imv >= min)));
        filtered = base.filter(r => sel === 'all' || r.id === sel);
        render();
    }

    function resetFilters() {
        $('tramoSelect').value = 'all';
        $('minIntensity').value = 0;
        document.querySelectorAll('.checkbox-group input').forEach(c => (c.checked = true));
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
        renderMap();
        renderTop();
        renderTable();
        renderStats();
        renderHistory();
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
