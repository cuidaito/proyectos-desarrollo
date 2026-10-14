// Datos sintéticos de demostración (generador determinista)
function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function trafficStatus(imd, base) {
    const ratio = imd / base;
    if (ratio < 0.9) return 'fluido';
    if (ratio < 1.1) return 'denso';
    if (ratio < 1.25) return 'congestionado';
    return 'cortado';
}

function generateData() {
    const rand = seededRandom(42);
    const rows = [];
    const today = new Date();
    for (let d = CONFIG.days - 1; d >= 0; d--) {
        const date = new Date(today);
        date.setDate(today.getDate() - d);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        CONFIG.streets.forEach(street => {
            const factor = (weekend ? 0.75 : 1) * (0.8 + rand() * 0.5);
            const imd = Math.round(street.base * factor);
            const trucks = Math.round(imd * (0.06 + rand() * 0.04));
            const motorcycles = Math.round(imd * (0.08 + rand() * 0.05));
            rows.push({
                date: date.toISOString().slice(0, 10),
                street: street.name,
                lat: street.lat,
                lng: street.lng,
                imd,
                status: trafficStatus(imd, street.base),
                cars: imd - trucks - motorcycles,
                trucks,
                motorcycles
            });
        });
    }
    return rows;
}

const TRAFFIC_DATA = generateData();
