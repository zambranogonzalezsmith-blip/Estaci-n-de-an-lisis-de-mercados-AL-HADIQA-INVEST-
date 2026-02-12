// --- SISTEMA DE AUTO-RECUPERACIÓN ---
(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        const backupScript = document.createElement('script');
        backupScript.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
        backupScript.onload = () => { initTerminal(); };
        document.head.appendChild(backupScript);
    } else {
        if (document.readyState === 'complete') initTerminal();
        else window.onload = initTerminal;
    }
})();

// --- CONFIGURACIÓN GLOBAL KIRA 1.0 ---
let CONFIG = { 
    ema_20: 20, ema_50: 50, ema_80: 80, sma_100: 100, rsi_period: 14,
    risk_percent: 0.01 
};

let GLOBAL = {
    asset: 'BTC', type: 'crypto', tf: '15m',
    socket: null, interval: null,
    symbol_map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt' },
    velas: [] // Almacén de datos para cálculos
};

let chart, candleSeries, ema20Series, ema50Series, ema80Series, sma100Series;

// --- 1. INICIALIZACIÓN DEL MOTOR ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight,
        layout: { background: { type: 'solid', color: '#010409' }, textColor: '#d1d4dc', fontSize: 12 },
        grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
        timeScale: { timeVisible: true, borderColor: '#30363d', rightOffset: 5 },
    });

    candleSeries = chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderVisible: false });
    ema20Series = chart.addLineSeries({ color: '#2962ff', lineWidth: 1, title: 'EMA 20' });
    ema50Series = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1, title: 'EMA 50' });
    ema80Series = chart.addLineSeries({ color: '#ff9800', lineWidth: 1, title: 'EMA 80' });
    sma100Series = chart.addLineSeries({ color: '#f44336', lineWidth: 2, title: 'SMA 100' });

    setupEventListeners();
    cargarActivo();

    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartElement.offsetWidth, height: chartElement.offsetHeight });
    });
}

// --- 2. GESTIÓN DE DATOS (HISTORIAL Y SOCKET) ---
async function cargarActivo() {
    const selector = document.getElementById('asset-selector');
    GLOBAL.asset = selector.value;
    
    // Corregido: Detección de tipo más robusta
    const label = selector.options[selector.selectedIndex].parentElement.label || "";
    GLOBAL.type = label.includes('CRIPTO') ? 'crypto' : 'forex';
    
    document.getElementById('asset-name').innerText = selector.options[selector.selectedIndex].text;
    
    if (GLOBAL.socket) { GLOBAL.socket.close(); GLOBAL.socket = null; }
    if (GLOBAL.interval) { clearInterval(GLOBAL.interval); GLOBAL.interval = null; }

    await fetchHistoricalData();

    if (GLOBAL.type === 'crypto') {
        iniciarBinanceSocket();
    } else {
        iniciarForexPolling();
    }
}

async function fetchHistoricalData() {
    try {
        const symbol = GLOBAL.symbol_map[GLOBAL.asset].toUpperCase();
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${GLOBAL.tf}&limit=300`);
        const data = await res.json();
        
        GLOBAL.velas = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));

        candleSeries.setData(GLOBAL.velas);
        actualizarIndicadores(GLOBAL.velas);
    } catch (e) { console.error("Error historial:", e); }
}

function iniciarBinanceSocket() {
    const symbol = GLOBAL.symbol_map[GLOBAL.asset];
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${GLOBAL.tf}`;
    
    GLOBAL.socket = new WebSocket(wsUrl);
    GLOBAL.socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        const k = data.k;
        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o), high: parseFloat(k.h),
            low: parseFloat(k.l), close: parseFloat(k.c)
        };

        candleSeries.update(candle);
        document.getElementById('current-price').innerText = `$${candle.close.toFixed(2)}`;

        // Si la vela cierra, actualizamos todo el array de velas para los indicadores
        if (k.x) {
            GLOBAL.velas.push(candle);
            if (GLOBAL.velas.length > 500) GLOBAL.velas.shift();
            actualizarIndicadores(GLOBAL.velas);
        }
    };
}

// --- 3. MOTOR DE ANÁLISIS ---
function actualizarIndicadores(candles) {
    if (candles.length < 100) return;

    const e20 = calculateEMA(candles, CONFIG.ema_20);
    const e50 = calculateEMA(candles, CONFIG.ema_50);
    const e80 = calculateEMA(candles, CONFIG.ema_80);
    const s100 = calculateSMA(candles, CONFIG.sma_100);
    const rsi = calculateRSI(candles, CONFIG.rsi_period);

    ema20Series.setData(e20);
    ema50Series.setData(e50);
    ema80Series.setData(e80);
    sma100Series.setData(s100);

    // Integración con SMC Engine (asegúrate de que SMC_ENGINE esté definido)
    if (typeof SMC_ENGINE !== 'undefined') {
        const smcMarkers = SMC_ENGINE.analyze(candles);
        candleSeries.setMarkers(smcMarkers);
        
        const lastPrice = candles[candles.length - 1].close;
        const lastRSI = rsi[rsi.length - 1].value;
        
        document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);
        document.getElementById('rsi-fill').style.width = `${lastRSI}%`;
        actualizarSesion();
        ejecutarLogicaKira(lastPrice, e20, e50, e80, s100, smcMarkers);
    }
}

// --- CORRECCIÓN EN CÁLCULOS MATEMÁTICOS ---
function calculateEMA(data, p) {
    let k = 2 / (p + 1);
    let emaArr = [];
    let ema = data[0].close;
    data.forEach((d, i) => {
        ema = (d.close * k) + (ema * (1 - k));
        if (i >= p) emaArr.push({ time: d.time, value: ema });
    });
    return emaArr;
}

function calculateSMA(data, p) {
    let smaArr = [];
    for (let i = p; i < data.length; i++) {
        const slice = data.slice(i - p, i);
        const sum = slice.reduce((a, b) => a + b.close, 0);
        smaArr.push({ time: data[i].time, value: sum / p });
    }
    return smaArr;
}

function calculateRSI(data, p) {
    let rsiArr = [];
    if (data.length <= p) return rsiArr;
    let gains = 0, losses = 0;

    for (let i = 1; i <= p; i++) {
        let diff = data[i].close - data[i - 1].close;
        if (diff >= 0) gains += diff; else losses -= diff;
    }

    let avgG = gains / p;
    let avgL = losses / p;

    for (let i = p + 1; i < data.length; i++) {
        let diff = data[i].close - data[i - 1].close;
        avgG = (avgG * (p - 1) + (diff > 0 ? diff : 0)) / p;
        avgL = (avgL * (p - 1) + (diff < 0 ? -diff : 0)) / p;
        rsiArr.push({ time: data[i].time, value: 100 - (100 / (1 + avgG / avgL)) });
    }
    return rsiArr;
}

function setupEventListeners() {
    const selector = document.getElementById('asset-selector');
    if (selector) selector.addEventListener('change', cargarActivo);
}

// El resto de tus funciones UI (actualizarSesion, calcularLotaje) están correctas.
