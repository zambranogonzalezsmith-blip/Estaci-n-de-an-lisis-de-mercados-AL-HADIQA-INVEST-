// --- SISTEMA DE AUTO-RECUPERACIÓN DE LIBRERÍA ---
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

// --- CONFIGURACIÓN GLOBAL ---
let CONFIG = { 
    ema_20: 20, ema_50: 50, ema_80: 80, sma_100: 100, rsi_period: 14,
    risk_percent: 0.01 
};

let GLOBAL = {
    asset: 'BTC', type: 'crypto', tf: '15m',
    socket: null, velas: [],
    symbol_map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt', 'EURUSD': 'eurusdt' }
};

let chart, candleSeries, ema20Series, ema50Series, ema80Series, sma100Series;

// --- 1. MOTOR GRÁFICO (FIX DE VISIBILIDAD) ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    // Crear gráfico con dimensiones del contenedor
    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.clientWidth,
        height: chartElement.clientHeight,
        layout: { background: { type: 'solid', color: '#010409' }, textColor: '#d1d4dc', fontSize: 12 },
        grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
        timeScale: { timeVisible: true, borderColor: '#30363d' },
    });

    // Series
    candleSeries = chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderVisible: false });
    ema20Series = chart.addLineSeries({ color: '#2962ff', lineWidth: 1 });
    ema50Series = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1 });
    ema80Series = chart.addLineSeries({ color: '#ff9800', lineWidth: 1 });
    sma100Series = chart.addLineSeries({ color: '#f44336', lineWidth: 2 });

    setupEventListeners();
    cargarActivo();

    // Fix: Redimensionar cuando cambia el tamaño de la ventana o el menú
    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({ 
            width: chartElement.clientWidth, 
            height: chartElement.clientHeight 
        });
    });
    resizeObserver.observe(chartElement);
}

// --- 2. LÓGICA DE DATOS ---
async function cargarActivo() {
    const selector = document.getElementById('asset-selector');
    if(!selector) return;

    GLOBAL.asset = selector.value;
    document.getElementById('asset-name').innerText = selector.options[selector.selectedIndex].text;
    
    if (GLOBAL.socket) GLOBAL.socket.close();
    await fetchHistoricalData();
    iniciarBinanceSocket();
}

async function fetchHistoricalData() {
    try {
        const symbol = GLOBAL.symbol_map[GLOBAL.asset].toUpperCase();
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${GLOBAL.tf}&limit=200`);
        const data = await res.json();
        
        GLOBAL.velas = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));

        candleSeries.setData(GLOBAL.velas);
        actualizarIndicadores(GLOBAL.velas);
    } catch (e) { console.error("Error de conexión:", e); }
}

function iniciarBinanceSocket() {
    const symbol = GLOBAL.symbol_map[GLOBAL.asset];
    GLOBAL.socket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${GLOBAL.tf}`);
    
    GLOBAL.socket.onmessage = (msg) => {
        const k = JSON.parse(msg.data).k;
        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o), high: parseFloat(k.h),
            low: parseFloat(k.l), close: parseFloat(k.c)
        };

        candleSeries.update(candle);
        document.getElementById('current-price').innerText = `$${candle.close.toLocaleString()}`;

        if (k.x) {
            GLOBAL.velas.push(candle);
            actualizarIndicadores(GLOBAL.velas);
        }
    };
}

// --- 3. KIRA PAY (MOTOR BLOCKCHAIN) ---
const KIRA_PAY = {
    wallet: "0xTU_BILLETERA_AQUI", // Cambia esto por tu dirección real

    abrir() {
        const modal = document.getElementById('crypto-modal');
        modal.style.display = 'flex';
        document.getElementById('qr-deposit').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${this.wallet}`;
        document.getElementById('wallet-addr').innerText = this.wallet;
    }
};

async function conectarMetaMask() {
    if (window.ethereum) {
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        alert("Billetera vinculada: " + accounts[0].substring(0, 10) + "...");
    } else {
        alert("MetaMask no detectado");
    }
}

// --- FUNCIONES MATEMÁTICAS ---
function actualizarIndicadores(candles) {
    if (candles.length < 100) return;
    ema20Series.setData(calculateEMA(candles, 20));
    ema50Series.setData(calculateEMA(candles, 50));
    ema80Series.setData(calculateEMA(candles, 80));
    sma100Series.setData(calculateSMA(candles, 100));
}

function calculateEMA(data, p) {
    let k = 2 / (p + 1), emaArr = [], ema = data[0].close;
    data.forEach((d, i) => {
        ema = (d.close * k) + (ema * (1 - k));
        if (i >= p) emaArr.push({ time: d.time, value: ema });
    });
    return emaArr;
}

function calculateSMA(data, p) {
    let smaArr = [];
    for (let i = p; i < data.length; i++) {
        let sum = data.slice(i - p, i).reduce((a, b) => a + b.close, 0);
        smaArr.push({ time: data[i].time, value: sum / p });
    }
    return smaArr;
}

function setupEventListeners() {
    window.KIRA_PAY = KIRA_PAY; // Exponer al HTML
}
