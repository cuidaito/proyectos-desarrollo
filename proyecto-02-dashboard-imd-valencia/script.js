(function () {
    const $ = id => document.getElementById(id);
    const fmt = n => Math.round(n).toLocaleString('es-ES');
    let filtered = TRAFFIC_DATA.slice();
    let trendChart, hourlyChart, comparisonChart, map, markersLayer;

    function init() {
        const dates = TRAFFIC_DATA.map(r => r.date).sort();
        $('startDate').value = dates[0];
        $('endDate').value = dates[dates.length - 1];

        map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);

        $('applyFilters').addEventListener('click', applyFilters);
        $('resetFilters').addEventListener('click', resetFilters);
        $('exportBtn').addEventListener('click', exportCSV);
        $('themeToggle').addEventListener('click', toggleTheme);
        $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });

        render();
    }

    function selectedStates() {
        return Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(c => c.value);
    }

    function applyFilters() {
        const q = $('searchInput').value.trim().toLowerCase();
        const start = $('startDate').value;
        const end = $('endDate').value;
        const states = selectedStates();
        filtered = TRAFFIC_DATA.filter(r =>
            (!q || r.street.toLowerCase().includes(q)) &&
            (!start || r.date >= start) &&
            (!end || r.date <= end) &&
            states.includes(r.status));
        render();
    }

    function resetFilters() {
        $('searchInput').value = '';
        $('vehicleType').value = 'all';
        document.querySelectorAll('.checkbox-group input').forEach(c => (c.checked = true));
        const dates = TRAFFIC_DATA.map(r => r.date).sort();
        $('startDate').value = dates[0];
        $('endDate').value = dates[dates.length - 1];
        applyFilters();
    }

    function value(r) {
        switch ($('vehicleType').value) {
            case 'cars': return r.cars;
            case 'trucks': return r.trucks;
            case 'motorcycles': return r.motorcycles;
            default: return r.imd;
        }
    }

    function groupBy(rows, keyFn) {
        const m = new Map();
        rows.forEach(r => {
            const k = keyFn(r);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        });
        return m;
    }

    const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    function render() {
        renderKPIs();
        renderTrend();
        renderHourly();
        renderMap();
        renderComparison();
        renderTable();
        renderStats();
    }

    function renderKPIs() {
        const vals = filtered.map(value);
        $('avgValue').textContent = vals.length ? fmt(avg(vals)) : '-';
        $('maxValue').textContent = vals.length ? fmt(Math.max(...vals)) : '-';
        $('minValue').textContent = vals.length ? fmt(Math.min(...vals)) : '-';
        const last = filtered.length ? filtered[filtered.length - 1].status : '-';
        $('statusValue').textContent = last.charAt(0).toUpperCase() + last.slice(1);
    }

    function replaceChart(chart, id, config) {
        if (chart) chart.destroy();
        return new Chart($(id), config);
    }

    function renderTrend() {
        const byDate = [...groupBy(filtered, r => r.date)].sort((a, b) => a[0].localeCompare(b[0]));
        trendChart = replaceChart(trendChart, 'trendChart', {
            type: 'line',
            data: {
                labels: byDate.map(([d]) => d),
                datasets: [{
                    label: 'IMD medio',
                    data: byDate.map(([, rows]) => Math.round(avg(rows.map(value)))),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.15)',
                    fill: true,
                    tension: 0.3
                }]
            }
        });
    }

    // Perfil horario ilustrativo: reparte la media diaria con una curva típica de tráfico urbano
    function renderHourly() {
        const profile = [1, 0.6, 0.4, 0.4, 0.8, 2, 5, 8, 7, 5, 4.5, 5, 5.5, 5.5, 5, 5, 5.5, 7, 8, 6, 4, 3, 2, 1.5];
        const total = profile.reduce((a, b) => a + b, 0);
        const dailyAvg = avg(filtered.map(value));
        hourlyChart = replaceChart(hourlyChart, 'hourlyChart', {
            type: 'bar',
            data: {
                labels: profile.map((_, h) => `${String(h).padStart(2, '0')}h`),
                datasets: [{
                    label: 'Vehículos (estimado)',
                    data: profile.map(p => Math.round(dailyAvg * p / total)),
                    backgroundColor: '#764ba2'
                }]
            }
        });
    }

    function renderMap() {
        markersLayer.clearLayers();
        const byStreet = groupBy(filtered, r => r.street);
        byStreet.forEach(rows => {
            const m = avg(rows.map(value));
            const worst = rows[rows.length - 1].status;
            L.circleMarker([rows[0].lat, rows[0].lng], {
                radius: Math.max(6, m / 250),
                color: CONFIG.colors[worst],
                fillColor: CONFIG.colors[worst],
                fillOpacity: 0.6
            }).bindPopup(`<strong>${rows[0].street}</strong><br>IMD medio: ${fmt(m)}<br>Estado: ${worst}`)
                .addTo(markersLayer);
        });
    }

    function renderComparison() {
        const byStreet = [...groupBy(filtered, r => r.street)]
            .map(([s, rows]) => [s, avg(rows.map(value))])
            .sort((a, b) => b[1] - a[1]);
        comparisonChart = replaceChart(comparisonChart, 'comparisonChart', {
            type: 'bar',
            data: {
                labels: byStreet.map(([s]) => s),
                datasets: [{ label: 'IMD medio', data: byStreet.map(([, v]) => Math.round(v)), backgroundColor: '#4facfe' }]
            },
            options: { indexAxis: 'y' }
        });
    }

    function renderTable() {
        const rows = filtered.slice().reverse().slice(0, 200);
        $('tableBody').innerHTML = rows.map(r => `
            <tr>
                <td>${r.date}</td>
                <td>${r.street}</td>
                <td>${fmt(r.imd)}</td>
                <td><span class="badge" style="background:${CONFIG.colors[r.status]}">${r.status}</span></td>
                <td>${fmt(r.cars)}</td>
                <td>${fmt(r.trucks)}</td>
                <td>${fmt(r.motorcycles)}</td>
            </tr>`).join('');
    }

    function renderStats() {
        $('totalRecords').textContent = fmt(filtered.length);
        $('totalZones').textContent = new Set(filtered.map(r => r.street)).size;
        const byDate = [...groupBy(filtered, r => r.date)].sort((a, b) => a[0].localeCompare(b[0]));
        const daily = byDate.map(([, rows]) => avg(rows.map(value)));
        $('weeklyAvg').textContent = fmt(avg(daily.slice(-7)) * 7);
        const half = Math.floor(daily.length / 2);
        const a = avg(daily.slice(0, half));
        const b = avg(daily.slice(half));
        $('variation').textContent = a ? `${((b - a) / a * 100).toFixed(1)}%` : '0%';
    }

    function exportCSV() {
        const header = 'fecha,calle,imd,estado,automoviles,camiones,motos';
        const lines = filtered.map(r => [r.date, `"${r.street}"`, r.imd, r.status, r.cars, r.trucks, r.motorcycles].join(','));
        const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'imd-valencia.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function toggleTheme() {
        document.body.classList.toggle('dark');
        $('themeToggle').innerHTML = `<i class="fas fa-${document.body.classList.contains('dark') ? 'sun' : 'moon'}"></i>`;
    }

    document.addEventListener('DOMContentLoaded', init);
})();
