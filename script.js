// --- ALHADIQA SYSTEM ENGINE v4.5 ---
let chart, candleSeries, currentSocket;
let GLOBAL = { 
    asset: 'BTC', 
    tf: '15m', 
    map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt', 'EURUSD': 'eurusdt', 'GBPUSD': 'gbpusdt' } 
};

// 1. INICIALIZACIÓN CON FIX DE DIMENSIONES
function initTerminal() {
    const container = document.getElementById('main-chart');
    if (!container) return;

    // Limpieza de instancia previa si existe
    if (chart) { chart.remove(); }

    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { 
            background: { type: 'solid', color: '#000000' }, 
            textColor: '#7982a9',
            fontFamily: 'JetBrains Mono' 
        },
        grid: { 
            vertLines: { color: '#0f111a' }, 
            horzLines: { color: '#0f111a' } 
        },
        timeScale: { borderColor: '#1f2335', timeVisible: true, barSpacing: 10 },
        crosshair: { mode: 0, vertLine: { color: '#1fd1ed' }, horzLine: { color: '#1fd1ed' } }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00ff9d', downColor: '#ff4a4a', 
        borderVisible: false, wickUpColor: '#00ff9d', wickDownColor: '#ff4a4a'
    });

    // Fix de redimensión para el Sidebar
    window.addEventListener('resize', () => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });

    cargarActivo();
}

// 2. MOTOR DE DATOS (HISTORIAL + WEBSOCKET)
async function cargarActivo() {
    const assetKey = document.getElementById('asset-selector').value;
    const symbol = GLOBAL.map[assetKey];
    GLOBAL.asset = assetKey;
    
    document.getElementById('asset-name').innerText = assetKey === 'BTC' ? 'BITCOIN / USDT' : assetKey;
    
    if (currentSocket) currentSocket.close();
    document.getElementById('kira-action').innerText = "FETCHING_DATA...";

    try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${GLOBAL.tf}&limit=250`);
        const data = await res.json();
        const processedData = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));
        
        candleSeries.setData(processedData);
        actualizarIndicadores(processedData);
        conectarStream(symbol);
    } catch (err) {
        console.error("DATA_ERR:", err);
        document.getElementById('kira-action').innerText = "CONNECTION_ERROR";
    }
}

function conectarStream(symbol) {
    currentSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${GLOBAL.tf}`);
    
    currentSocket.onmessage = (msg) => {
        const k = JSON.parse(msg.data).k;
        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o), high: parseFloat(k.h),
            low: parseFloat(k.l), close: parseFloat(k.c)
        };

        candleSeries.update(candle);
        document.getElementById('current-price').innerText = `$${candle.close.toLocaleString()}`;
        
        if (k.x) { // Al cerrar vela, recalculamos Kira
            document.getElementById('kira-action').innerText = "SCANNING_LIQUIDITY...";
        }
    };
}

// 3. LÓGICA DE INDICADORES (RSI Y LOTAJE)
function actualizarIndicadores(data) {
    const lastClose = data[data.length - 1].close;
    // Cálculo simple de RSI para la UI
    const rsiMock = (Math.random() * (70 - 30) + 30).toFixed(2); // Aquí integrarías tu calculateRSI()
    document.getElementById('rsi-value').innerText = rsiMock;
    
    calcularLotaje(lastClose);
}

function calcularLotaje(precio) {
    const balance = 1000; // Puedes vincularlo a un input
    const lot = (balance / precio * 0.1).toFixed(3);
    document.getElementById('suggested-lot').innerText = lot > 0.001 ? lot : "0.01";
}

// 4. UI CONTROLS
function toggleMenu() {
    document.body.classList.toggle('menu-collapsed');
    // Forzamos al gráfico a esperar la animación del CSS
    setTimeout(() => {
        const container = document.getElementById('main-chart');
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    }, 350);
}

function cambiarTF(tf) {
    GLOBAL.tf = tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase() === tf));
    cargarActivo();
}

// BOOT SYSTEM
window.onload = initTerminal;
