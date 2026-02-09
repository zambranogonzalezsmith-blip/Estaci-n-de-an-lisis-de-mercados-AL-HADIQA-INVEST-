import streamlit as st
import yfinance as yf
import pandas_ta as ta
import plotly.graph_objects as go
import streamlit.components.v1 as components
import requests
from datetime import datetime

# 1. Configuración de pantalla (PC y Móvil)
st.set_page_config(layout="wide", page_title="Trading Station Pro")

# --- FUNCIÓN DE ALERTA SONORA Y POP-UP ---
def disparar_alarma(mensaje):
    st.toast(mensaje, icon='🚨')
    # Sonido de campana y alerta de navegador
    audio_url = "https://www.soundjay.com/buttons/sounds/beep-01a.mp3"
    component_code = f"""
        <script>
            var audio = new Audio("{audio_url}");
            audio.play();
            alert("{mensaje}");
        </script>
    """
    components.html(component_code, height=0)

# --- FUNCIÓN DE ENVÍO DE CORREO (Vía Webhook simplificado) ---
def enviar_correo_webhook(mensaje):
    # Aquí colocarás la URL de Zapier o servicio similar cuando la tengas
    webhook_url = st.secrets.get("WEBHOOK_URL", "")
    if webhook_url:
        payload = {"mensaje": mensaje, "email": "empresaalhadiqainvest@gmail.com"}
        requests.post(webhook_url, json=payload)

# --- BARRA LATERAL (Panel de Control) ---
st.sidebar.header("⚙️ Configuración")
symbol = st.sidebar.text_input("Activo (Ej: BTC-USD, EURUSD=X)", value="BTC-USD")
interval = st.sidebar.selectbox("Temporalidad", ['1h', '4h', '1d'], index=2)

st.sidebar.subheader("Parámetros de Estrategia")
ema_fast = st.sidebar.slider("EMA Rápida", 5, 50, 9)
ema_slow = st.sidebar.slider("EMA Lenta", 20, 200, 21)
rsi_period = st.sidebar.slider("Periodo RSI", 5, 30, 14)

enable_alerts = st.sidebar.checkbox("Activar Alertas Sonoras")

# --- MOTOR DE DATOS ---
@st.cache_data(ttl=300)
def load_data(ticker, timeframe):
    return yf.download(ticker, period="1y", interval=timeframe)

data = load_data(symbol, interval)

if not data.empty:
    # 2. Cálculo de Indicadores
    data['EMA_F'] = ta.ema(data['Close'], length=ema_fast)
    data['EMA_S'] = ta.ema(data['Close'], length=ema_slow)
    data['RSI'] = ta.rsi(data['Close'], length=rsi_period)

    # --- INTERFAZ PRINCIPAL ---
    st.title(f"📊 Dashboard: {symbol}")

    col_chart, col_stats = st.columns([3, 1])

    with col_chart:
        fig = go.Figure()
        fig.add_trace(go.Candlestick(
            x=data.index, open=data['Open'], high=data['High'],
            low=data['Low'], close=data['Close'], name='Precio'
        ))
        fig.add_trace(go.Scatter(x=data.index, y=data['EMA_F'], name=f'EMA {ema_fast}', line=dict(color='cyan', width=1)))
        fig.add_trace(go.Scatter(x=data.index, y=data['EMA_S'], name=f'EMA {ema_slow}', line=dict(color='orange', width=1)))
        
        fig.update_layout(height=600, template="plotly_dark", xaxis_rangeslider_visible=False)
        st.plotly_chart(fig, use_container_width=True)

    with col_stats:
        precio_actual = data['Close'].iloc[-1].item()
        st.metric("Precio Actual", f"${precio_actual:,.2f}")
        
        fig_rsi = go.Figure()
        fig_rsi.add_trace(go.Scatter(x=data.index, y=data['RSI'], line=dict(color='purple')))
        fig_rsi.add_hline(y=70, line_dash="dash", line_color="red")
        fig_rsi.add_hline(y=30, line_dash="dash", line_color="green")
        fig_rsi.update_layout(height=200, template="plotly_dark", margin=dict(l=0,r=0,t=0,b=0))
        st.plotly_chart(fig_rsi, use_container_width=True)

    # --- LÓGICA DE ALERTA Y VERDICTO ---
    st.divider()
    st.subheader("🧠 Análisis de Estrategia")
    
    current_rsi = data['RSI'].iloc[-1]
    last_ema_f = data['EMA_F'].iloc[-1]
    last_ema_s = data['EMA_S'].iloc[-1]
    
    # Lógica de señales
    if last_ema_f > last_ema_s and current_rsi < 70:
        mensaje = f"✅ SEÑAL ALCISTA en {symbol}: Precio ${precio_actual:,.2f}"
        st.success(mensaje)
        if enable_alerts:
            disparar_alarma(mensaje)
            enviar_correo_webhook(mensaje)
            
    elif last_ema_f < last_ema_s and current_rsi > 30:
        mensaje = f"⚠️ SEÑAL BAJISTA en {symbol}: Precio ${precio_actual:,.2f}"
        st.error(mensaje)
        if enable_alerts:
            disparar_alarma(mensaje)
            enviar_correo_webhook(mensaje)
    else:
        st.info("⌛ ESTADO NEUTRAL: Sin cruces claros de EMA.")

else:
    st.warning("No se encontraron datos. Verifica el símbolo en Yahoo Finance.")
