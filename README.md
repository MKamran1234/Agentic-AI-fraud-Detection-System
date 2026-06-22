# 🛡️ Agentic AI Fraud Detection System

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**A full-stack blockchain fraud intelligence platform powered by agentic AI.**  
Real-time transaction monitoring · Multi-chain support · LLM-powered explanations · WebSocket live feed

</div>

---

## 📌 Overview

The **Agentic AI Fraud Detection System** is an intelligent, production-ready platform that monitors blockchain transactions in real-time and automatically classifies them as `SAFE`, `SUSPICIOUS`, or `FRAUD` using a multi-agent AI pipeline.

It integrates with **Etherscan** and **BSCScan** APIs for live on-chain data, uses **Google Gemini** for natural language explanations, supports optional **Hugging Face** ML models, and falls back gracefully to deterministic mock events when API keys are not provided — making it fully runnable offline or in demo mode.

### ✨ Key Highlights

- 🤖 **Multi-Agent Architecture** — Dedicated agents for fraud detection, wallet reputation scoring, and LLM explanation generation, coordinated by an orchestrator.
- 🔴 **Real-Time Live Feed** — WebSocket-based streaming of blockchain transactions with per-network filtering.
- 🧠 **AI-Powered Analysis** — Rule-based detection enriched with Gemini LLM explanations and optional Hugging Face GNN/BERT models.
- 🗄️ **MongoDB Persistence** — All analysis results and alerts are stored and retrievable via REST APIs.
- 🌐 **Multi-Chain Support** — Ethereum (mainnet) and Binance Smart Chain (BSC) via pluggable adapters.
- 🐳 **Docker Ready** — One command to spin up the entire stack (backend + frontend + MongoDB).
- 🔁 **Mock Fallback Mode** — Works without any paid API keys using simulated blockchain events.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                 │
│   Dashboard · Live Feed · Wallet Lookup · Alert Table   │
└────────────────────────┬────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│                  FastAPI Backend                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Fraud Det. │  │  Wallet Rep. │  │  Explanation  │  │
│  │   Agent     │  │    Agent     │  │    Agent      │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         └────────────────┼──────────────────┘           │
│                  ┌───────▼────────┐                     │
│                  │  Orchestrator  │                     │
│                  └───────┬────────┘                     │
│                          │                              │
│  ┌────────────┐  ┌───────▼────────┐  ┌──────────────┐  │
│  │ Stream Mgr │  │  Blockchain    │  │   MongoDB    │  │
│  │ (WebSocket)│  │  Service       │  │  Repository  │  │
│  └────────────┘  │(Etherscan/BSC) │  └──────────────┘  │
│                  └────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🧩 Project Structure

```
New project/
├── docker-compose.yml          # Full stack orchestration
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── api/
│   │   │   └── routes.py       # REST & WebSocket endpoints
│   │   ├── agents/
│   │   │   ├── orchestrator.py       # Agent coordinator
│   │   │   ├── fraud_detection.py    # Core fraud detection agent
│   │   │   ├── wallet_reputation.py  # Wallet scoring agent
│   │   │   └── explanation.py        # LLM explanation agent
│   │   ├── services/
│   │   │   ├── blockchain.py         # Etherscan/BSCScan + mock
│   │   │   └── stream_manager.py     # WebSocket live stream
│   │   ├── db/
│   │   │   ├── mongo.py              # MongoDB connection
│   │   │   └── repositories.py       # Data access layer
│   │   ├── ml/
│   │   │   └── elliptic_baseline.py  # Elliptic ML baseline model
│   │   ├── models/
│   │   │   └── schemas.py            # Pydantic schemas
│   │   └── core/
│   │       └── config.py             # Settings & env vars
│   ├── requirements.txt
│   ├── requirements-ml.txt     # Optional ML dependencies
│   ├── Dockerfile
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx             # Main dashboard component
    │   ├── index.css           # Global styles
    │   ├── main.jsx            # React entry point
    │   └── api/
    │       └── client.js       # API client (REST + WebSocket)
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── netlify.toml            # Netlify deployment config
    ├── vercel.json             # Vercel deployment config
    └── Dockerfile
```

---

## 🚀 Quick Start

### Option 1 — Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/MKamran1234/Agentic-AI-fraud-Detection-System.git
cd Agentic-AI-fraud-Detection-System

# Copy and configure environment
cp backend/.env.example backend/.env

# Start everything
docker-compose up --build
```

- Frontend: http://localhost:5173  
- Backend API: http://localhost:8000  
- API Docs (Swagger): http://localhost:8000/docs

---

### Option 2 — Manual Setup

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.\.venv\Scripts\Activate.ps1

# Activate (Linux/Mac)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Optional: ML model support
pip install -r requirements-ml.txt

# Configure environment
copy .env.example .env   # Windows
cp .env.example .env     # Linux/Mac

# Run the server
uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend

npm install
npm run dev
```

Open the Vite URL shown in terminal (default: http://localhost:5173)

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DATABASE` | `agentic_fraud_detection` | Database name |
| `ETHERSCAN_API_KEY` | _(empty)_ | Enables live Ethereum data |
| `BSCSCAN_API_KEY` | _(empty)_ | Enables live BSC data |
| `BLOCKCHAIN_NETWORK` | `ethereum` | Default network |
| `USE_MOCK_STREAM` | `false` | Force mock-only streaming |
| `ALLOW_MOCK_FALLBACK` | `false` | Auto-fallback to mock if live fails |
| `GEMINI_API_KEY` | _(empty)_ | Enables LLM explanations via Gemini |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model to use |
| `ENABLE_HF_MODELS` | `false` | Load Hugging Face local models |
| `HF_FRAUD_MODEL` | `uyen1109/eth-fraud-gnn-uyenuyen-v3` | HF fraud model |
| `HF_SCAM_MODEL` | `Digvijay05/SCAMBERT` | HF scam detection model |
| `STREAM_POLL_SECONDS` | `4.0` | Polling interval for blockchain |
| `FRONTEND_ORIGINS` | `http://localhost:5173` | CORS allowed origins |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend REST API URL |
| `VITE_WS_URL` | `ws://localhost:8000/live-stream` | WebSocket stream URL |

---

## 📡 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health, DB status, stream mode |
| `GET` | `/networks` | List supported blockchain networks |
| `POST` | `/analyze-transaction` | Analyze a single transaction |
| `GET` | `/wallet/{address}` | Wallet history + reputation report |
| `GET` | `/fraud-score/{txHash}` | Retrieve cached fraud score by tx hash |
| `GET` | `/alerts` | List saved high-risk alerts (paginated) |
| `WS` | `/live-stream` | Real-time WebSocket transaction stream |

### Request / Response Schemas

#### `POST /analyze-transaction`

```json
{
  "txHash": "0xabc123...",
  "from_address": "0xSenderAddress",
  "to_address": "0xReceiverAddress",
  "amount": 1.5,
  "gas_price": 21000,
  "gas_used": 21000,
  "network": "ethereum"
}
```

**Response:**

```json
{
  "txHash": "0xabc123...",
  "from_address": "0xSenderAddress",
  "to_address": "0xReceiverAddress",
  "amount": 1.5,
  "timestamp": "2025-01-01T00:00:00Z",
  "network": "ethereum",
  "risk_score": 87,
  "classification": "FRAUD",
  "explanation": "This transaction exhibits multiple high-risk signals...",
  "confidence_level": 0.92,
  "signals": ["high_value", "new_address", "rapid_transfer"],
  "model_output": {
    "transaction_source": "etherscan",
    "agent": "fraud_detection"
  }
}
```

All analysis responses include:
- `risk_score` (0–100)
- `classification` (`SAFE` | `SUSPICIOUS` | `FRAUD`)
- `explanation` (human-readable, LLM-generated if Gemini key is set)
- `confidence_level` (0.0–1.0)

---

## 🤖 AI Agent Pipeline

```
Transaction Input
      │
      ▼
┌─────────────────┐
│   Orchestrator  │ ← coordinates all agents
└────────┬────────┘
         │
    ┌────▼──────────────────────────────┐
    │  1. Fraud Detection Agent          │
    │     - Rule-based signals           │
    │     - Elliptic ML baseline         │
    │     - HF GNN model (optional)      │
    │     → risk_score + classification  │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │  2. Explanation Agent              │
    │     - Gemini LLM (if key set)      │
    │     - Rule-based fallback          │
    │     → human-readable explanation   │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │  3. Wallet Reputation Agent        │
    │     - Aggregates transaction hist  │
    │     - Computes reputation score    │
    │     → WalletReport                 │
    └────────────────────────────────────┘
```

---

## 🖥️ Frontend Dashboard

The React dashboard provides:

- 📊 **Live Feed Panel** — Real-time WebSocket stream with color-coded risk levels
- 🔍 **Transaction Analyzer** — Manual analysis by TX hash or address
- 👜 **Wallet Lookup** — Full wallet reputation report with fraud history
- 📈 **Charts & Stats** — Risk score distribution, classification breakdown (Recharts)
- 🚨 **Alerts Table** — Paginated high-risk transaction log
- 🌐 **Network Switcher** — Toggle between Ethereum and BSC

---

## 🛠️ Tech Stack

### Backend
- **[FastAPI](https://fastapi.tiangolo.com/)** — Async Python web framework
- **[Motor](https://motor.readthedocs.io/)** — Async MongoDB driver
- **[Pydantic v2](https://docs.pydantic.dev/)** — Data validation & settings
- **[HTTPX](https://www.python-httpx.org/)** — Async HTTP client for blockchain APIs
- **[Google Gemini](https://ai.google.dev/)** — LLM for fraud explanations _(optional)_
- **[Hugging Face Transformers](https://huggingface.co/)** — Local ML models _(optional)_

### Frontend
- **[React 19](https://react.dev/)** — UI framework
- **[Vite](https://vitejs.dev/)** — Lightning-fast build tool
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first styling
- **[Framer Motion](https://www.framer.com/motion/)** — Animations
- **[Recharts](https://recharts.org/)** — Data visualization
- **[Lucide React](https://lucide.dev/)** — Icon library

### Infrastructure
- **[MongoDB 7](https://www.mongodb.com/)** — Document database
- **[Docker Compose](https://docs.docker.com/compose/)** — Container orchestration

---

## 🌍 Deployment

### Netlify (Frontend)

The frontend includes a [`netlify.toml`](frontend/netlify.toml) for one-click Netlify deployment.

```bash
cd frontend
npm run build
# Deploy the dist/ folder to Netlify
```

### Vercel (Frontend)

A [`vercel.json`](frontend/vercel.json) is also included for Vercel deployments.

### Production Tips

- Set `USE_MOCK_STREAM=false` and provide real API keys in production
- Set `ALLOW_MOCK_FALLBACK=false` for strict real-data-only mode
- Use a managed MongoDB service (e.g., MongoDB Atlas) for production
- Set `FRONTEND_ORIGINS` to your actual deployed frontend URL

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">
Made with ❤️ | Powered by FastAPI · React · MongoDB · Gemini AI
</div>
