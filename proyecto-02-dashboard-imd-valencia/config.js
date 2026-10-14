const CONFIG = {
    apiUrl: 'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/188/query?where=1%3D1&outFields=idtramo,des_tramo,estado,imv&outSR=4326&resultRecordCount=2000&f=geojson',
    refreshMs: 60000,
    historyBase: ['localhost', '127.0.0.1'].includes(location.hostname) ? 'data/' : 'https://raw.githubusercontent.com/cuidaito/proyectos-desarrollo/main/proyecto-02-dashboard-imd-valencia/data/',
    mapCenter: [39.4699, -0.3763],
    mapZoom: 13,
    states: { '0': 'fluido', '1': 'denso', '2': 'congestionado', '3': 'cortado' },
    colors: {
        fluido: '#2ecc71',
        denso: '#f1c40f',
        congestionado: '#e67e22',
        cortado: '#e74c3c',
        'sin datos': '#a0aec0'
    }
};
