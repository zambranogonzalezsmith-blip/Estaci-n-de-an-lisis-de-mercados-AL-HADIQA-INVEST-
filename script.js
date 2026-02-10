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

// --- CONFIGURACIÓN GLOBAL ---
let CONFIG = { ema_fast: 9, ema_slow: 21, rsi_period: 14, update_ms: 30000 };
let currentAssetKey = 'BTC';
let currentTimeframe = '15m'; 
let terminalMode = 'normal';
let chart, candleSeries, emaFastSeries, emaSlowSeries;

// --- INICIALIZACIÓN DEL MOTOR ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight,
        layout: { background: { type: 'solid', color: '#010409' }, textColor: '#d1d4dc', fontSize: 12 },
        grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
        // --- MEJORA DE MOVIMIENTO TIPO TRADINGVIEW ---
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        timeScale: { timeVisible: true, borderColor: '#30363d', rightOffset: 10, barSpacing: 8 },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#39d353', downColor: '#ff3e3e',
        borderVisible: false, wickUpColor: '#39d353', wickDownColor: '#ff3e3e',
    });

    emaFastSeries = chart.addLineSeries({ color: '#00bcd4', lineWidth: 2 });
    emaSlowSeries = chart.addLineSeries({ color: '#ffa726', lineWidth: 2 });

    // Eventos
    document.getElementById('asset-selector').addEventListener('change', (e) => {
        currentAssetKey = e.target.value;
        fetchMarketData();
    });

    document.getElementById('nav-forex-smc')?.addEventListener('click', (e) => {
        e.preventDefault();
        activarModoSMC();
    });

    fetchMarketData();
    setInterval(fetchMarketData, CONFIG.update_ms);

    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartElement.offsetWidth, height: chartElement.offsetHeight });
    });
}

// --- GESTIÓN DE TIEMPO Y MODO ---
function cambiarTF(tf) {
    currentTimeframe = tf;
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.toLowerCase() === tf) btn.classList.add('active');
    });
    fetchMarketData();
}

function activarModoSMC() {
    terminalMode = 'smc';
    document.getElementById('smc-info-card').style.display = 'block';
    emaFastSeries.applyOptions({ visible: false });
    emaSlowSeries.applyOptions({ visible: false });
    fetchMarketData();
}

// --- OBTENCIÓN DE DATOS ---
async function fetchMarketData() {
    const ASSETS = {
        'BTC': { type: 'crypto', id: 'bitcoin', symbol: 'BTC-USD', name: 'Bitcoin' },
        'ETH': { type: 'crypto', id: 'ethereum', symbol: 'ETH-USD', name: 'Ethereum' },
        'GOLD': { type: 'yahoo', symbol: 'GC=F', name: 'Oro' },
        'US30': { type: 'yahoo', symbol: '^DJI', name: 'US30' },
        'EURUSD': { type: 'yahoo', symbol: 'EURUSD=X', name: 'EUR/USD' },
        'GBPUSD': { type: 'yahoo', symbol: 'GBPUSD=X', name: 'GBP/USD' },
        'USDJPY': { type: 'yahoo', symbol: 'USDJPY=X', name: 'USD/JPY' }
    };

    const asset = ASSETS[currentAssetKey];
    document.getElementById('asset-name').innerText = asset.name;

    try {
        let candles = [];
        if (asset.type === 'crypto') {
            const r = await fetch(`https://api.coingecko.com/api/v3/coins/${asset.id}/ohlc?vs_currency=usd&days=1`);
            const d = await r.json();
            candles = d.map(x => ({ time: x[0]/1000, open: x[1], high: x[2], low: x[3], close: x[4] }));
        } else {
            const u = `https://query1.finance.yahoo.com/v8/finance/chart/${asset.symbol}?interval=${currentTimeframe}&range=2d`;
            const p = `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;
            const r = await fetch(p);
            const j = await r.json();
            const res = j.chart.result[0];
            candles = res.timestamp.map((t, i) => ({
                time: t, open: res.indicators.quote[0].open[i], high: res.indicators.quote[0].high[i],
                low: res.indicators.quote[0].low[i], close: res.indicators.quote[0].close[i]
            })).filter(c => c.open != null);
        }

        if (candles.length > 0) {
            candleSeries.setData(candles);
            procesarIndicadores(candles);
        }
    } catch (e) { console.error("Error en plataforma:", e); }
}

// --- LÓGICA DE INDICADORES ---
function procesarIndicadores(candles) {
    const rsiV = calculateRSI(candles, CONFIG.rsi_period);
    const lastRSI = rsiV.length > 0 ? rsiV[rsiV.length - 1].value : 50;
    const lastPrice = candles[candles.length - 1].close;

    document.getElementById('current-price').innerText = `$${lastPrice.toLocaleString()}`;
    document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);

    if (terminalMode === 'normal') {
        const emaF = calculateEMA(candles, CONFIG.ema_fast);
        const emaS = calculateEMA(candles, CONFIG.ema_slow);
        emaFastSeries.setData(emaF);
        emaSlowSeries.setData(emaS);
        actualizarBanner(emaF, emaS, lastRSI);
    } else {
        const estructura = detectarSMC(candles);
        document.getElementById('smc-status').innerText = estructura;
        document.getElementById('signal-text').innerText = `MODO SMC: ${estructura}`;
    }
}

// --- MATEMÁTICAS ---
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

function detectarSMC(candles) {
    if (candles.length < 10) return "Analizando...";
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 5];
    if (last.close > prev.high) return "BOS ALCISTA 🚀";
    if (last.close < prev.low) return "BOS BAJISTA 📉";
    return "CONSOLIDACIÓN";
}

function actualizarBanner(f, s, r) {
    const banner = document.getElementById('status-banner');
    const txt = document.getElementById('signal-text');
    const lF = f[f.length-1].value, lS = s[s.length-1].value;
    if (lF > lS && r < 70) { banner.className = 'buy'; txt.innerText = "🟢 COMPRA SUGERIDA"; }
    else if (lF < lS && r > 30) { banner.className = 'sell'; txt.innerText = "🔴 VENTA SUGERIDA"; }
    else { banner.className = 'neutral'; txt.innerText = "⚪ ESPERANDO SEÑAL"; }
}

function actualizarParametros() {
    CONFIG.ema_fast = parseInt(document.getElementById('input-ema-fast').value);
    CONFIG.ema_slow = parseInt(document.getElementById('input-ema-slow').value);
    CONFIG.rsi_period = parseInt(document.getElementById('input-rsi').value);
}

function ejecutarDiagnostico() {
    alert(`ALHADIQA OK\nActivo: ${currentAssetKey}\nTF: ${currentTimeframe}\nModo: ${terminalMode}`);
}
