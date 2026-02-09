import streamlit as st
import yfinance as yf
import pandas_ta as ta
import plotly.graph_objects as go
from datetime import datetime

# 1. Configuración de pantalla (PC y Móvil)
st.set_page_config(layout="wide", page_title="Trading Station Pro")

# --- BARRA LATERAL (Panel de Control) ---
st.sidebar.header("⚙️ Configuración")
symbol = st.sidebar.text_input("Activo (Ej: BTC-USD, EURUSD=X, AAPL)", value="BTC-USD")
interval = st.sidebar.selectbox("Temporalidad", ['1h', '4h', '1d'], index=2)

st.sidebar.subheader("Parámetros de Estrategia")
ema_fast = st.sidebar.slider("EMA Rápida", 5, 50, 9)
ema_slow = st.sidebar.slider("EMA Lenta", 20, 200, 21)
rsi_period = st.sidebar.slider("Periodo RSI", 5, 30, 14)

# --- MOTOR DE DATOS ---
@st.cache_data(ttl=300) # Actualiza cada 5 minutos
def load_data(ticker, timeframe):
    return yf.download(ticker, period="1y", interval=timeframe)

data = load_data(symbol, interval)

if not data.empty:
    # 2. Cálculo de Indicadores con pandas-ta
    data['EMA_F'] = ta.ema(data['Close'], length=ema_fast)
    data['EMA_S'] = ta.ema(data['Close'], length=ema_slow)
    data['RSI'] = ta.rsi(data['Close'], length=rsi_period)

    # --- INTERFAZ PRINCIPAL ---
    st.title(f"📊 Dashboard: {symbol}")

    # Layout de Columnas (En PC se ven lado a lado, en móvil una bajo otra)
    col_chart, col_stats = st.columns([3, 1])

    with col_chart:
        # Gráfico de Velas Japonesas
        fig = go.Figure()
        fig.add_trace(go.Candlestick(
            x=data.index, open=data['Open'], high=data['High'],
            low=data['Low'], close=data['Close'], name='Precio'
        ))
        # Añadir Medias Móviles
        fig.add_trace(go.Scatter(x=data.index, y=data['EMA_F'], name=f'EMA {ema_fast}', line=dict(color='cyan', width=1)))
        fig.add_trace(go.Scatter(x=data.index, y=data['EMA_S'], name=f'EMA {ema_slow}', line=dict(color='orange', width=1)))
        
        fig.update_layout(height=600, template="plotly_dark", xaxis_rangeslider_visible=False)
        st.plotly_chart(fig, use_container_width=True)

    with col_stats:
        # Métricas rápidas
        precio_actual = data['Close'].iloc[-1]
        st.metric("Precio Actual", f"${precio_actual:,.2f}")
        
        # Gráfico de RSI pequeño
        fig_rsi = go.Figure()
        fig_rsi.add_trace(go.Scatter(x=data.index, y=data['RSI'], line=dict(color='purple')))
        fig_rsi.add_hline(y=70, line_dash="dash", line_color="red")
        fig_rsi.add_hline(y=30, line_dash="dash", line_color="green")
        fig_rsi.update_layout(height=200, template="plotly_dark", margin=dict(l=0,r=0,t=0,b=0))
        st.plotly_chart(fig_rsi, use_container_width=True)

    # --- LÓGICA DE EFECTIVIDAD (El Veredicto) ---
    st.divider()
    st.subheader("🧠 Análisis de Estrategia")
    
    current_rsi = data['RSI'].iloc[-1]
    cross_up = data['EMA_F'].iloc[-1] > data['EMA_S'].iloc[-1]
    
    if cross_up and current_rsi < 70:
        st.success("✅ SEÑAL ALCISTA: Cruce de medias positivo y RSI con espacio de subida.")
    elif not cross_up and current_rsi > 30:
        st.error("⚠️ SEÑAL BAJISTA: Cruce de medias negativo.")
    else:
        st.info("⌛ ESTADO NEUTRAL: Esperando confirmación de indicadores.")
else:
    st.warning("No se encontraron datos. Verifica el símbolo.")
