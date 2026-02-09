Market Strategy Analyzer AL-HADIQA INVEST 📈
Plataforma de análisis cuantitativo y técnico diseñada para la monitorización de mercados financieros en tiempo real. Este proyecto permite configurar estrategias personalizadas basadas en indicadores técnicos y visualizar las señales de ejecución directamente desde dispositivos móviles.

🚀 Características principales
Interfaz Mobile-First: Desarrollada con Streamlit para una visualización fluida en smartphones.

Motor de Indicadores: Implementación de estrategias basadas en RSI, Medias Móviles (EMA/SMA), Bandas de Bollinger y MACD.

Backtesting Engine: Módulo para validar la efectividad de las estrategias sobre datos históricos.

Conexión Multi-Mercado: Integración con APIs para obtener datos de Forex, Criptomonedas y Acciones.

📊 Arquitectura del Sistema
La arquitectura se divide en cuatro capas fundamentales:

Capa de Ingesta: Obtención de datos brutos (OHLCV) mediante yfinance o CCXT.

Capa de Procesamiento: Cálculo de indicadores técnicos mediante la librería pandas-ta.

Capa de Lógica: Evaluación de condiciones de entrada y salida (Long/Short).

Capa de Presentación: Interfaz web interactiva alojada en Streamlit Cloud.

🛠️ Requisitos Técnicos
Python 3.9 o superior.

Gestor de paquetes pip.
