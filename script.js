// --- SISTEMA DE AUTO-RECUPERACIÓN ---
(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        const backupScript = document.createElement('script');
        backupScript.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
        backupScript.onload = () => { initTerminal(); };
        document.head.appendChild(backupScript);
    } else {
        window.onload = initTerminal;
    }
})();

// --- CONFIGURACIÓN GLOBAL KIRA 1.0 ---
let CONFIG = { 
    ema_20: 20, ema_50: 50, ema_80: 80, sma_100: 100, rsi_period: 14,
    risk_percent: 0.01 // 1% de riesgo por operación
};

let GLOBAL = {
    asset: 'BTC', type: 'crypto', tf: '15m',
    socket: null, interval: null,
    symbol_map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt' }
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

    // Series de Datos (Configuración Visual Sniper)
    candleSeries = chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderVisible: false });
    
    // Indicadores Kira
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

// --- 2. GESTIÓN DE DATOS EN VIVO ---
async function cargarActivo() {
    const selector = document.getElementById('asset-selector');
    GLOBAL.asset = selector.value;
    GLOBAL.type = selector.options[selector.selectedIndex].parentElement.label.includes('CRIPTO') ? 'crypto' : 'forex';
    
    document.getElementById('asset-name').innerText = GLOBAL.asset;
    
    if (GLOBAL.socket) GLOBAL.socket.close();
    if (GLOBAL.interval) clearInterval(GLOBAL.interval);

    await fetchHistoricalData();

    if (GLOBAL.type === 'crypto') {
        iniciarBinanceSocket();
    } else {
        iniciarForexPolling();
    }
}

// --- 3. MOTOR DE ANÁLISIS SMC + KIRA ---
function actualizarIndicadores(candles) {
    if (candles.length < 100) return;

    // A. Cálculos Técnicos
    const e20 = calculateEMA(candles, CONFIG.ema_20);
    const e50 = calculateEMA(candles, CONFIG.ema_50);
    const e80 = calculateEMA(candles, CONFIG.ema_80);
    const s100 = calculateSMA(candles, CONFIG.sma_100);
    const rsi = calculateRSI(candles, CONFIG.rsi_period);

    // B. Actualizar Gráfico
    ema20Series.setData(e20);
    ema50Series.setData(e50);
    ema80Series.setData(e80);
    sma100Series.setData(s100);

    // C. Ejecutar Algoritmo SMC (LuxAlgo Logic)
    const smcMarkers = SMC_ENGINE.analyze(candles);
    candleSeries.setMarkers(smcMarkers);

    // D. Detección Sniper de Kira 1.0
    const lastPrice = candles[candles.length - 1].close;
    const lastRSI = rsi[rsi.length - 1].value;
    
    // UI Updates
    document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);
    document.getElementById('rsi-fill').style.width = `${lastRSI}%`;
    actualizarSesion();
    
    // Lógica de Señal
    ejecutarLogicaKira(lastPrice, e20, e50, e80, s100, smcMarkers);
}

function ejecutarLogicaKira(price, e20, e50, e80, s100, markers) {
    const l = e20.length - 1;
    const actionBox = document.getElementById('kira-signal-box');
    const actionText = document.getElementById('kira-action');
    
    // Condición Sniper: Abanico de EMAs + Precio sobre SMA 100 + Señal SMC
    const isBullish = e20[l].value > e50[l].value && e50[l].value > e80[l].value && price > s100[l].value;
    const isBearish = e20[l].value < e50[l].value && e50[l].value < e80[l].value && price < s100[l].value;
    
    const lastSMC = markers[markers.length - 1];

    if (isBullish && lastSMC?.text.includes('BUY')) {
        actionBox.className = 'kira-signal-box kira-buy';
        actionText.innerText = "🚀 ENTRADA SNIPER: COMPRA";
        calcularLotaje();
    } else if (isBearish && lastSMC?.text.includes('SELL')) {
        actionBox.className = 'kira-signal-box kira-sell';
        actionText.innerText = "📉 ENTRADA SNIPER: VENTA";
        calcularLotaje();
    } else {
        actionBox.className = 'kira-wait';
        actionText.innerText = "ESCANEANDO CONFLUENCIA...";
    }
}

// --- FUNCIONES MATEMÁTICAS ---
function calculateSMA(data, p) {
    let smaArr = [];
    for (let i = p; i <= data.length; i++) {
        const slice = data.slice(i - p, i);
        const sum = slice.reduce((a, b) => a + b.close, 0);
        smaArr.push({ time: data[i-1].time, value: sum / p });
    }
    return smaArr;
}

function calculateEMA(data, p) {
    let k = 2/(p+1), emaArr = [], ema = data[0].close;
    data.forEach((d, i) => {
        ema = (d.close * k) + (ema * (1-k));
        if (i >= p) emaArr.push({ time: d.time, value: ema });
    });
    return emaArr;
}

function calculateRSI(data, p) {
    let rsiArr = []; if (data.length <= p) return rsiArr;
    let g = 0, l = 0;
    for (let i=1; i<=p; i++) {
        let diff = data[i].close - data[i-1].close;
        diff >= 0 ? g += diff : l -= diff;
    }
    let avgG = g/p, avgL = l/p;
    for (let i=p+1; i<data.length; i++) {
        let diff = data[i].close - data[i-1].close;
        avgG = (avgG*(p-1) + (diff>0?diff:0))/p;
        avgL = (avgL*(p-1) + (diff<0?-diff:0))/p;
        rsiArr.push({ time: data[i].time, value: 100 - (100/(1 + avgG/avgL)) });
    }
    return rsiArr;
}

// --- UTILS UI ---
function actualizarSesion() {
    const h = new Date().getUTCHours();
    const b = document.getElementById('session-indicator');
    const isActive = (h >= 8 && h <= 12) || (h >= 13 && h <= 17);
    b.innerText = isActive ? "NY/LDN ACTIVE" : "MARKET CLOSED";
    b.className = isActive ? "session-badge active" : "session-badge";
}

function calcularLotaje() {
    const bal = parseFloat(document.getElementById('kira-balance').value) || 1000;
    const lot = (bal * CONFIG.risk_percent) / 150; // SL estimado de 15 pips
    document.getElementById('suggested-lot').innerText = Math.max(0.01, lot).toFixed(2);
}

// Implementación de WebSocket y Fetch (Igual a la anterior pero conectada a actualizarIndicadores)
async function fetchHistoricalData() {
    // ... (Tu lógica de fetch previa pero al final llama a:)
    // actualizarIndicadores(candles);
}

function iniciarBinanceSocket() {
    // ... (Tu lógica de socket previa pero en cada tick llama a:)
    // actualizarIndicadores(todasLasVelas);
}

function setupEventListeners() {
    document.getElementById('asset-selector').addEventListener('change', cargarActivo);
    }
