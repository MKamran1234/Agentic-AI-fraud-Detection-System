import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Cpu,
  Database,
  Gauge,
  Hexagon,
  LockKeyhole,
  Radar,
  RefreshCcw,
  Search,
  Shield,
  Wallet,
  Wifi,
  WifiOff
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getAlerts, getHealth, getNetworks, getWalletForNetwork, WS_URL } from "./api/client";
import { createMockEvent } from "./data/mock";

const pages = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "monitor", label: "Live Monitor", icon: Activity },
  { id: "wallet", label: "Wallet Risk", icon: Wallet },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "explain", label: "AI Explain", icon: BrainCircuit }
];

const pageIds = new Set(pages.map((page) => page.id));
const allowMockUi = String(import.meta.env.VITE_ALLOW_MOCK_UI || "false").toLowerCase() === "true";
const defaultNetworks = [
  { id: "ethereum", label: "Ethereum", symbol: "ETH" },
  { id: "bsc", label: "BNB Smart Chain", symbol: "BNB" },
  { id: "solana", label: "Solana", symbol: "SOL" }
];
const sampleWallets = {
  ethereum: "0x742d35cc6634c0532925a3b844bc454e4438f44e",
  bsc: "0x8894e0a0c962cb723c1976a4421c95949be2d4e3",
  solana: "Vote111111111111111111111111111111111111111"
};

function pageFromLocation() {
  const hash = window.location.hash.replace("#", "");
  if (pageIds.has(hash)) {
    return hash;
  }
  const path = window.location.pathname.replace("/", "");
  return pageIds.has(path) ? path : "overview";
}

const statusTone = {
  SAFE: "text-mint bg-mint/10 border-mint/30",
  SUSPICIOUS: "text-warning bg-warning/10 border-warning/30",
  FRAUD: "text-danger bg-danger/10 border-danger/30"
};

function shortHash(value = "") {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function transactionSource(item) {
  const source = item?.model_output?.transaction_source || item?.metadata?.data_source || "unknown";
  if (String(source).toLowerCase() === "etherscan") return "REAL";
  if (String(source).toLowerCase() === "bscscan") return "REAL";
  if (String(source).toLowerCase() === "public_rpc") return "REAL";
  if (String(source).toLowerCase() === "solana_rpc") return "REAL";
  if (String(source).toLowerCase() === "mock") return "MOCK";
  return "UNKNOWN";
}

function assetSymbol(item) {
  return item?.metadata?.asset_symbol || (item?.network === "bsc" ? "BNB" : item?.network === "solana" ? "SOL" : "ETH");
}

function useLiveTransactions(network) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [streamMode, setStreamMode] = useState("connecting");
  const [streamNotice, setStreamNotice] = useState("");

  useEffect(() => {
    setEvents([]);
    setStreamNotice("");
    let fallbackTimer;
    let socket;
    const push = (event) => setEvents((current) => [event, ...current].slice(0, 80));

    try {
      const separator = WS_URL.includes("?") ? "&" : "?";
      socket = new WebSocket(`${WS_URL}${separator}network=${encodeURIComponent(network)}`);
      socket.onopen = () => {
        setConnected(true);
        setStreamMode("live");
        setStreamNotice("");
      };
      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.event === "stream_warning") {
          setStreamNotice(payload.message || "Real-time stream warning.");
          return;
        }
        if (!payload.event) {
          push(payload);
        }
      };
      socket.onerror = () => {
        setConnected(false);
        setStreamMode("error");
      };
      socket.onclose = () => {
        setConnected(false);
        if (allowMockUi) {
          setStreamMode("mock");
          setStreamNotice("UI mock mode active due to stream disconnect.");
          fallbackTimer = window.setInterval(() => push(createMockEvent(Date.now())), 3500);
        } else {
          setStreamMode("offline");
          setStreamNotice("Live stream disconnected. Mock UI mode is disabled.");
        }
      };
    } catch {
      if (allowMockUi) {
        setStreamMode("mock");
        setStreamNotice("UI mock mode active because WebSocket initialization failed.");
        fallbackTimer = window.setInterval(() => push(createMockEvent(Date.now())), 3500);
      } else {
        setConnected(false);
        setStreamMode("offline");
        setStreamNotice("Unable to initialize live stream and mock UI mode is disabled.");
      }
    }

    return () => {
      if (socket) socket.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }, [network]);

  return { events, connected, streamMode, streamNotice };
}

export default function App() {
  const [activePage, setActivePage] = useState(pageFromLocation);
  const [selectedNetwork, setSelectedNetwork] = useState("ethereum");
  const [networks, setNetworks] = useState(defaultNetworks);
  const [selected, setSelected] = useState(null);
  const [walletAddress, setWalletAddress] = useState("0x742d35cc6634c0532925a3b844bc454e4438f44e");
  const [walletReport, setWalletReport] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [savedAlerts, setSavedAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [health, setHealth] = useState({ status: "booting", mongo: "checking", stream_mode: "unknown" });
  const [booting, setBooting] = useState(true);
  const { events, connected, streamMode, streamNotice } = useLiveTransactions(selectedNetwork);
  const [frozenTxHashes, setFrozenTxHashes] = useState(() => {
    try {
      const saved = localStorage.getItem("frozen_transactions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFreezeTransaction = (txHash) => {
    setFrozenTxHashes((prev) => {
      const next = prev.includes(txHash)
        ? prev.filter((h) => h !== txHash)
        : [...prev, txHash];
      try {
        localStorage.setItem("frozen_transactions", JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save frozen transactions", e);
      }
      return next;
    });
  };

  useEffect(() => {
    setSelected((current) => current || events[0]);
  }, [events]);

  useEffect(() => {
    setSelected(null);
    setWalletReport(null);
    setWalletError("");
    setWalletAddress(sampleWallets[selectedNetwork] || "");
  }, [selectedNetwork]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ status: "offline", mongo: "fallback-ui" }));
  }, []);

  useEffect(() => {
    getNetworks().then(setNetworks).catch(() => setNetworks(defaultNetworks));
  }, []);

  useEffect(() => {
    let active = true;
    let timer;
    async function loadSavedAlerts() {
      setAlertsLoading(true);
      try {
        const alerts = await getAlerts(selectedNetwork, 50);
        if (active) setSavedAlerts(alerts);
      } catch {
        if (active) setSavedAlerts([]);
      } finally {
        if (active) setAlertsLoading(false);
      }
    }
    loadSavedAlerts();
    timer = window.setInterval(loadSavedAlerts, 12000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [selectedNetwork]);

  useEffect(() => {
    const syncLocation = () => setActivePage(pageFromLocation());
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  function navigate(pageId) {
    const path = pageId === "overview" ? "/" : `/${pageId}`;
    setActivePage(pageId);
    window.history.pushState(null, "", path);
  }

  const metrics = useMemo(() => {
    const fraud = events.filter((event) => event.classification === "FRAUD").length;
    const suspicious = events.filter((event) => event.classification === "SUSPICIOUS").length;
    const avgRisk = events.length
      ? Math.round(events.reduce((sum, event) => sum + event.risk_score, 0) / events.length)
      : 0;
    const protectedValue = events.reduce((sum, event) => sum + event.amount, 0);
    const frozenEvents = events.filter((event) => frozenTxHashes.includes(event.txHash));
    const frozenCount = frozenTxHashes.length;
    const frozenValue = frozenEvents.reduce((sum, event) => sum + event.amount, 0);
    return { fraud, suspicious, avgRisk, protectedValue, frozenCount, frozenValue };
  }, [events, frozenTxHashes]);

  const trend = useMemo(
    () =>
      events
        .slice(0, 18)
        .reverse()
        .map((event, index) => ({
          name: `${index + 1}`,
          risk: event.risk_score,
          confidence: Math.round(event.confidence_level * 100)
        })),
    [events]
  );

  async function lookupWallet() {
    setWalletLoading(true);
    setWalletError("");
    try {
      const report = await getWalletForNetwork(walletAddress, selectedNetwork);
      setWalletReport(report);
    } catch {
      setWalletReport(null);
      setWalletError("Wallet lookup failed. No dummy score was generated; check backend, API key, network, or address format.");
    } finally {
      setWalletLoading(false);
    }
  }

  const activeRecord = selected || events[0] || null;
  return (
    <main className="relative min-h-screen overflow-hidden cyber-grid">
      <SystemBackdrop />
      {booting && <BootLoader />}
      <motion.div
        className="app-shell relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col lg:flex-row"
        initial={{ opacity: 0, y: 18, rotateX: 5 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <Sidebar activePage={activePage} setActivePage={navigate} connected={connected} health={health} />
        <section className="flex-1 min-w-0 px-4 py-4 sm:px-6 lg:px-8">
          <TopBar
            connected={connected}
            events={events}
            networks={networks}
            selectedNetwork={selectedNetwork}
            setSelectedNetwork={setSelectedNetwork}
          />
          {streamNotice && (
            <div className="mb-4 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
              {streamNotice}
            </div>
          )}
          <motion.div
            key={activePage}
            className="page-surface"
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            {activePage === "overview" && (
              <Overview
                metrics={metrics}
                events={events}
                trend={trend}
                selected={activeRecord}
                setSelected={setSelected}
                selectedNetwork={selectedNetwork}
                savedAlerts={savedAlerts}
                alertsLoading={alertsLoading}
                frozenTxHashes={frozenTxHashes}
                toggleFreezeTransaction={toggleFreezeTransaction}
              />
            )}
            {activePage === "monitor" && (
              <LiveMonitor 
                events={events} 
                selected={activeRecord} 
                setSelected={setSelected} 
                frozenTxHashes={frozenTxHashes}
                toggleFreezeTransaction={toggleFreezeTransaction}
              />
            )}
            {activePage === "wallet" && (
              <WalletRisk
                walletAddress={walletAddress}
                setWalletAddress={setWalletAddress}
                walletReport={walletReport}
                lookupWallet={lookupWallet}
                walletLoading={walletLoading}
                walletError={walletError}
                events={events}
                selectedNetwork={selectedNetwork}
                networks={networks}
              />
            )}
            {activePage === "analytics" && (
              <Analytics
                events={events}
                trend={trend}
                metrics={metrics}
                savedAlerts={savedAlerts}
                alertsLoading={alertsLoading}
                frozenTxHashes={frozenTxHashes}
                toggleFreezeTransaction={toggleFreezeTransaction}
              />
            )}
            {activePage === "explain" && (
              <ExplanationPanel 
                selected={activeRecord} 
                events={events} 
                frozenTxHashes={frozenTxHashes}
                toggleFreezeTransaction={toggleFreezeTransaction}
              />
            )}
          </motion.div>
        </section>
      </motion.div>
    </main>
  );
}

function SystemBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(9,11,16,0.84),rgba(13,17,24,0.72),rgba(9,11,16,0.92))]" />
      <div className="scanline" />
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-aqua/35 to-transparent" />
      <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-mint/25 to-transparent" />
    </div>
  );
}

function BootLoader() {
  return (
    <motion.div
      className="boot-screen fixed inset-0 z-50 grid place-items-center bg-shell"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="grid place-items-center gap-5 text-center">
        <div className="loader-ring grid place-items-center">
          <Shield className="h-8 w-8 text-aqua" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-aqua">Initializing Aegis Ledger</p>
          <p className="mt-2 text-sm text-slate-400">Synchronizing agents, telemetry, and risk models</p>
        </div>
        <div className="h-1 w-64 overflow-hidden rounded-full bg-panelSoft">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-aqua via-mint to-warning"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function Sidebar({ activePage, setActivePage, connected, health }) {
  return (
    <aside className="glass-sidebar border-b border-line/80 px-4 py-4 backdrop-blur-xl lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5">
      <div className="flex items-center gap-3">
        <motion.div
          className="grid h-11 w-11 place-items-center rounded-md border border-aqua/50 bg-aqua/10 shadow-glow"
          whileHover={{ rotateY: 18, rotateX: -10, scale: 1.04 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <Hexagon className="h-5 w-5 text-aqua" />
        </motion.div>
        <div>
          <p className="text-sm font-bold text-white font-display">Aegis Ledger AI</p>
          <p className="text-xs text-slate-400 font-tech uppercase tracking-wider">Autonomous fraud intelligence</p>
        </div>
      </div>
      <nav className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {pages.map((page) => {
          const Icon = page.icon;
          const active = activePage === page.id;
          return (
            <a
              key={page.id}
              href={page.id === "overview" ? "/" : `/${page.id}`}
              data-testid={`nav-${page.id}`}
              onClick={(event) => {
                event.preventDefault();
                setActivePage(page.id);
              }}
              className={`nav-link group flex h-11 items-center gap-3 rounded-md border px-3 text-sm transition ${
                active
                  ? "border-aqua/50 bg-aqua/10 text-white shadow-glow"
                  : "border-transparent text-slate-400 hover:border-aqua/30 hover:bg-panelSoft hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 transition group-hover:scale-110 group-hover:text-aqua" />
              <span>{page.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="mt-6 grid gap-3 rounded-md border border-line bg-panel/70 p-3 text-xs text-slate-400 shadow-glow">
        <div className="flex items-center justify-between">
          <span>Stream</span>
          <StatusDot active={connected} />
        </div>
        <div className="flex items-center justify-between">
          <span>API</span>
          <span className="text-slate-200">{health.status}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Mongo</span>
          <span className="text-slate-200">{health.mongo}</span>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-line bg-shell/70 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
          <LockKeyhole className="h-3.5 w-3.5 text-mint" />
          Agent Mesh
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-300">
          <AgentRow icon={Cpu} label="Detection" status="active" />
          <AgentRow icon={BrainCircuit} label="Explanation" status="ready" />
          <AgentRow icon={Database} label="Reputation DB" status={health.mongo === "connected" ? "synced" : "memory"} />
        </div>
      </div>
    </aside>
  );
}

function TopBar({ connected, events, networks, selectedNetwork, setSelectedNetwork }) {
  const lastSeen = events[0] ? new Date(events[0].timestamp).toLocaleTimeString() : "--";
  const selected = networks.find((item) => item.id === selectedNetwork) || defaultNetworks[0];
  return (
    <header className="mb-4 rounded-md border border-line bg-panel/55 p-4 shadow-glow backdrop-blur-xl">
      <div>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-aqua font-display">Command Center</p>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl font-display">Agentic Fraud Operations</h1>
            <p className="mt-1 text-sm text-slate-400 font-sans">Realtime blockchain monitoring with model-backed risk analysis</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-shell/75 px-3 text-sm text-slate-300 shadow-glow">
              <Database className="h-4 w-4 text-aqua" />
              <select
                value={selectedNetwork}
                onChange={(event) => setSelectedNetwork(event.target.value)}
                className="min-w-36 bg-transparent text-sm text-white outline-none"
              >
                {networks.map((network) => (
                  <option key={network.id} value={network.id} className="bg-panel text-white">
                    {network.label}
                  </option>
                ))}
              </select>
            </label>
            <Badge icon={connected ? Wifi : WifiOff} label={connected ? "Live WebSocket" : "Local stream"} />
            <Badge icon={Radar} label={`Last event ${lastSeen}`} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
        <CommandCell label="Selected network" value={`${selected.label} (${selected.symbol})`} />
        <CommandCell label="Model posture" value="Hybrid ML + rules" />
        <CommandCell label="Risk engine" value="online" accent="text-mint" />
      </div>
    </header>
  );
}

function AgentRow({ icon: Icon, label, status }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line/70 bg-panel/60 px-2.5 py-2">
      <span className="inline-flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-aqua" />
        {label}
      </span>
      <span className="text-mint">{status}</span>
    </div>
  );
}

function CommandCell({ label, value, accent = "text-slate-200" }) {
  return (
    <div className="rounded-md border border-line bg-shell/65 px-3 py-2">
      <div className="uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 font-medium ${accent}`}>{value}</div>
    </div>
  );
}

function Overview({ metrics, events, trend, selected, setSelected, selectedNetwork, savedAlerts, alertsLoading, frozenTxHashes, toggleFreezeTransaction }) {
  const selectedNetworkConfig = defaultNetworks.find((item) => item.id === selectedNetwork) || defaultNetworks[0];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <MetricTile icon={Shield} label="Avg Risk" value={`${metrics.avgRisk}/100`} accent="text-aqua" />
          <MetricTile icon={AlertTriangle} label="Fraud Alerts" value={metrics.fraud} accent="text-danger" />
          <MetricTile icon={Gauge} label="Suspicious" value={metrics.suspicious} accent="text-warning" />
          <MetricTile
            icon={Wallet}
            label="Observed Value"
            value={`${metrics.protectedValue.toFixed(2)} ${selectedNetworkConfig.symbol}`}
            accent="text-mint"
          />
          <MetricTile
            icon={LockKeyhole}
            label="Frozen Assets"
            value={`${metrics.frozenCount} txs (${metrics.frozenValue.toFixed(2)} ${selectedNetworkConfig.symbol})`}
            accent="text-aqua"
            isFrozen={metrics.frozenCount > 0}
          />
        </div>
        <ThreatLens 
          selected={selected || events[0]} 
          frozenTxHashes={frozenTxHashes} 
          toggleFreezeTransaction={toggleFreezeTransaction} 
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Risk Trend">
          <RiskTrend data={trend} />
        </Panel>
        <Panel title="Selected Risk">
          <RiskGauge score={selected?.risk_score || 0} classification={selected?.classification || "SAFE"} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <LiveFeed 
          events={events.slice(0, 8)} 
          selected={selected} 
          setSelected={setSelected} 
          frozenTxHashes={frozenTxHashes} 
          toggleFreezeTransaction={toggleFreezeTransaction} 
        />
        <ExplanationPanel 
          selected={selected || events[0]} 
          compact 
          frozenTxHashes={frozenTxHashes} 
          toggleFreezeTransaction={toggleFreezeTransaction} 
        />
      </div>
      <SavedAlertsPanel 
        alerts={savedAlerts} 
        loading={alertsLoading} 
        selectedNetwork={selectedNetwork} 
        frozenTxHashes={frozenTxHashes}
        toggleFreezeTransaction={toggleFreezeTransaction}
      />
    </div>
  );
}

function ThreatLens({ selected, frozenTxHashes = [], toggleFreezeTransaction }) {
  const score = selected?.risk_score || 0;
  const isSuspiciousOrFraud = selected?.classification === "SUSPICIOUS" || selected?.classification === "FRAUD";
  const isFrozen = selected ? frozenTxHashes.includes(selected.txHash) : false;
  
  const tone = isFrozen 
    ? "text-aqua" 
    : score >= 75 
    ? "text-danger" 
    : score >= 45 
    ? "text-warning" 
    : "text-mint";
    
  const source = transactionSource(selected);
  
  return (
    <motion.section
      className={`threat-lens relative min-h-[178px] overflow-hidden rounded-md border p-4 shadow-glow ${
        isFrozen ? "frozen-glass-effect frozen-pulse" : "border-line bg-panel/85"
      }`}
      initial={{ opacity: 0, rotateY: -12, y: 12 }}
      animate={{ opacity: 1, rotateY: 0, y: 0 }}
      whileHover={{ rotateX: 2, rotateY: -3, y: -3 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      {isFrozen && <div className="cyber-scanner" />}
      <div className="relative z-10 flex flex-col justify-between h-full min-h-[146px]">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 font-display">
              {isFrozen ? "FROZEN SIGNAL" : "3D Threat Lens"}
            </p>
            <div className="inline-flex items-center gap-2">
              <SourcePill source={source} />
              <Radar className={`h-4 w-4 ${isFrozen ? "text-aqua animate-pulse" : "text-aqua"}`} />
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <div className={`text-5xl font-semibold font-display ${tone}`}>{score}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">active risk</div>
            </div>
            <div className="text-right">
              <div className="flex flex-col items-end gap-1.5">
                <StatusPill classification={selected?.classification || "SAFE"} />
                {isFrozen && (
                  <span className="inline-flex h-6 items-center gap-1 rounded bg-aqua/20 border border-aqua/40 px-2 text-[10px] font-bold text-aqua uppercase tracking-wider font-display">
                    <LockKeyhole className="h-3 w-3" /> Frozen
                  </span>
                )}
              </div>
              <p className="mt-3 max-w-40 text-xs font-mono text-slate-400">{shortHash(selected?.txHash || "awaiting signal")}</p>
            </div>
          </div>
        </div>

        {selected && isSuspiciousOrFraud && toggleFreezeTransaction && (
          <div className="mt-4 border-t border-line/60 pt-3 flex justify-end">
            <button
              onClick={() => toggleFreezeTransaction(selected.txHash)}
              className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold uppercase tracking-wider transition ${
                isFrozen
                  ? "border-mint/50 bg-mint/10 text-mint hover:bg-mint/20"
                  : "border-aqua/50 bg-aqua/10 text-aqua hover:bg-aqua/20"
              }`}
            >
              <LockKeyhole className="h-3.5 w-3.5" />
              {isFrozen ? "Unfreeze Asset" : "Freeze Transaction"}
            </button>
          </div>
        )}
      </div>
      <div className={`threat-cube ${isFrozen ? "opacity-30 border-aqua/40" : ""}`} />
    </motion.section>
  );
}

function LiveMonitor({ events, selected, setSelected, frozenTxHashes, toggleFreezeTransaction }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <LiveFeed 
        events={events} 
        selected={selected} 
        setSelected={setSelected} 
        frozenTxHashes={frozenTxHashes}
        toggleFreezeTransaction={toggleFreezeTransaction}
        full 
      />
      <Panel title="Wallet Relationship Graph">
        <NetworkGraph events={events.slice(0, 12)} selected={selected} />
      </Panel>
    </div>
  );
}

function WalletRisk({
  walletAddress,
  setWalletAddress,
  walletReport,
  lookupWallet,
  walletLoading,
  walletError,
  events,
  selectedNetwork,
  networks
}) {
  const selected = networks.find((item) => item.id === selectedNetwork) || defaultNetworks[0];
  const report = walletReport;
  const graphEvents = report?.fraud_history?.length ? report.fraud_history : events;
  const hasWalletEvidence = Boolean(
    report && ((report.fraud_history?.length || 0) > 0 || report.last_seen || report.fetch_status === "provider_ok")
  );
  const walletSource = report?.data_source === "none" && !hasWalletEvidence ? "UNKNOWN" : "REAL";
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Wallet Analyzer">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Network: {selected.label}</span>
          <span>Asset: {selected.symbol}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder={`Enter ${selected.label} wallet address`}
              className="h-11 w-full rounded-md border border-line bg-shell pl-9 pr-3 text-sm text-white outline-none focus:border-aqua"
            />
          </div>
          <button
            onClick={lookupWallet}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-aqua/50 bg-aqua/10 px-4 text-sm text-white hover:bg-aqua/20"
          >
            <RefreshCcw className={`h-4 w-4 ${walletLoading ? "animate-spin" : ""}`} />
            Analyze
          </button>
        </div>
        {walletError && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {walletError}
          </div>
        )}
        {!report && !walletError && (
          <div className="mt-5 rounded-md border border-line bg-shell/70 p-4 text-sm text-slate-400">
            No wallet report loaded for {selected.label}. Enter an address and run analysis to fetch real provider data.
          </div>
        )}
        {report && hasWalletEvidence && (
          <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
            <RiskGauge score={report.reputation_score} classification={report.classification} />
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill classification={report.classification} />
                <SourcePill source={walletSource} />
                <span className="rounded-md border border-line bg-shell px-2 py-1 text-xs text-slate-400">
                  {report.fetch_status || "provider_status_unknown"}
                </span>
              </div>
              <p className="break-all text-sm text-slate-300">{report.wallet_address}</p>
              <p className="text-sm leading-6 text-slate-400">{report.explanation}</p>
              <div className="text-sm text-slate-300">Confidence {Math.round(report.confidence_level * 100)}%</div>
            </div>
          </div>
        )}
        {report && !hasWalletEvidence && (
          <div className="mt-5 rounded-md border border-line bg-shell/70 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SourcePill source={walletSource} />
              <span className="rounded-md border border-line bg-shell px-2 py-1 text-xs text-slate-400">
                {report.fetch_status || "provider_status_unknown"}
              </span>
            </div>
            <p className="break-all text-sm text-slate-300">{report.wallet_address}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">{report.explanation}</p>
            <div className="mt-3 text-sm text-slate-300">Confidence {Math.round(report.confidence_level * 100)}%</div>
          </div>
        )}
      </Panel>
      <Panel title="Counterparty Graph">
        <NetworkGraph events={graphEvents.slice(0, 12)} selected={report?.fraud_history?.[0] || events[0]} />
      </Panel>
    </div>
  );
}

function Analytics({ events, trend, metrics, savedAlerts, alertsLoading, frozenTxHashes = [], toggleFreezeTransaction }) {
  const buckets = [
    { name: "Safe", value: events.filter((event) => event.classification === "SAFE").length, color: "#3ddc97" },
    { name: "Suspicious", value: metrics.suspicious, color: "#f2b84b" },
    { name: "Fraud", value: metrics.fraud, color: "#ff4d6d" }
  ];
  const volume = events.slice(0, 12).reverse().map((event, index) => ({
    name: `${index + 1}`,
    amount: Number(event.amount.toFixed(2)),
    risk: event.risk_score
  }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Risk Confidence">
        <RiskTrend data={trend} withConfidence />
      </Panel>
      <Panel title="Classification Split">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={buckets}>
            <CartesianGrid stroke="#293241" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {buckets.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Transfer Volume">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={volume}>
            <defs>
              <linearGradient id="amount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#24c6dc" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#24c6dc" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#293241" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="amount" stroke="#24c6dc" fill="url(#amount)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Risk Ladder">
        <div className="grid gap-2">
          {events.slice(0, 10).map((event) => (
            <div key={event.txHash} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-sm">
              <span className="text-slate-400">{shortHash(event.txHash)}</span>
              <div className="h-2 overflow-hidden rounded-md bg-shell">
                <div
                  className={`h-full rounded-md ${
                    event.risk_score >= 75 ? "bg-danger" : event.risk_score >= 45 ? "bg-warning" : "bg-mint"
                  }`}
                  style={{ width: `${event.risk_score}%` }}
                />
              </div>
              <span className="text-right text-slate-200">{event.risk_score}</span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="xl:col-span-2">
        <SavedAlertsPanel 
          alerts={savedAlerts} 
          loading={alertsLoading} 
          frozenTxHashes={frozenTxHashes}
          toggleFreezeTransaction={toggleFreezeTransaction}
        />
      </div>
    </div>
  );
}

function SavedAlertsPanel({ alerts, loading, selectedNetwork, frozenTxHashes = [], toggleFreezeTransaction }) {
  const selected = defaultNetworks.find((item) => item.id === selectedNetwork) || null;
  return (
    <Panel title="Saved Suspicious & Fraud Transactions">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{selected ? `${selected.label} MongoDB alert queue` : "MongoDB alert queue"}</span>
        <span>{loading ? "Refreshing..." : `${alerts.length} saved alerts`}</span>
      </div>
      <div className="thin-scrollbar grid max-h-[360px] gap-2 overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <div className="rounded-md border border-line bg-shell/70 p-4 text-sm text-slate-400">
            No saved SUSPICIOUS or FRAUD transactions found for this network yet.
          </div>
        )}
        {alerts.map((alert, index) => {
          const source = transactionSource(alert);
          const isFrozen = frozenTxHashes.includes(alert.txHash);
          return (
            <motion.div
              key={alert.txHash}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.14) }}
              className={`relative grid gap-2 rounded-md border p-3 transition ${
                isFrozen ? "frozen-glass-effect" : "border-line bg-panelSoft/90"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <span className="break-all font-mono text-xs text-slate-300 flex items-center gap-1.5">
                  {isFrozen && <LockKeyhole className="h-3.5 w-3.5 text-aqua animate-pulse" />}
                  {shortHash(alert.txHash)}
                </span>
                <div className="inline-flex items-center gap-2">
                  <SourcePill source={source} />
                  <StatusPill classification={alert.classification} />
                </div>
              </div>
              <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-[1fr_1fr_70px_70px]">
                <span>{shortHash(alert.from_address)}</span>
                <span>{shortHash(alert.to_address)}</span>
                <span>{alert.risk_score}/100</span>
                <span>{assetSymbol(alert)}</span>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-slate-400">{alert.explanation}</p>
              {toggleFreezeTransaction && (
                <div className="absolute right-3 top-3">
                  <button
                    onClick={() => toggleFreezeTransaction(alert.txHash)}
                    title={isFrozen ? "Unfreeze transaction" : "Freeze transaction"}
                    className={`p-1.5 rounded border transition ${
                      isFrozen
                        ? "border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
                        : "border-aqua/40 bg-aqua/10 text-aqua hover:bg-aqua/20"
                    }`}
                  >
                    <LockKeyhole className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </Panel>
  );
}

function ExplanationPanel({ selected, frozenTxHashes = [], toggleFreezeTransaction, compact = false }) {
  if (!selected) return null;
  const source = transactionSource(selected);
  const isFrozen = frozenTxHashes.includes(selected.txHash);
  const isSuspiciousOrFraud = selected.classification === "SUSPICIOUS" || selected.classification === "FRAUD";

  return (
    <Panel title="AI Explanation Panel">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2">
            <StatusPill classification={selected.classification} />
            <SourcePill source={source} />
            {isFrozen && (
              <span className="inline-flex h-7 items-center gap-1 rounded bg-aqua/20 border border-aqua/40 px-2 text-xs font-bold text-aqua uppercase tracking-wider font-display">
                <LockKeyhole className="h-3.5 w-3.5" /> Frozen
              </span>
            )}
          </div>
          <span className="text-sm text-slate-400 font-tech">Confidence {Math.round(selected.confidence_level * 100)}%</span>
        </div>
        <p className="break-all text-xs font-mono text-slate-400">{selected.txHash}</p>
        <p className="text-sm leading-6 text-slate-300">{selected.explanation}</p>
        <div className="grid gap-2">
          {selected.signals?.slice(0, compact ? 3 : 6).map((signal) => (
            <div key={signal} className="rounded-md border border-line bg-shell px-3 py-2 text-xs text-slate-400 font-mono">
              {signal}
            </div>
          ))}
        </div>
        {isSuspiciousOrFraud && toggleFreezeTransaction && (
          <div className="mt-2 border-t border-line/60 pt-3 flex justify-between items-center">
            <span className="text-xs text-slate-400">
              {isFrozen ? "Asset frozen on dashboard" : "Active risk control"}
            </span>
            <button
              onClick={() => toggleFreezeTransaction(selected.txHash)}
              className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold uppercase tracking-wider transition ${
                isFrozen
                  ? "border-mint/50 bg-mint/10 text-mint hover:bg-mint/20"
                  : "border-aqua/50 bg-aqua/10 text-aqua hover:bg-aqua/20"
              }`}
            >
              <LockKeyhole className="h-3.5 w-3.5" />
              {isFrozen ? "Unfreeze Asset" : "Freeze Transaction"}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function LiveFeed({ events, selected, setSelected, frozenTxHashes = [], toggleFreezeTransaction, full = false }) {
  return (
    <Panel title="Live Transaction Monitor">
      <div className={`thin-scrollbar grid gap-2 overflow-y-auto pr-1 ${full ? "max-h-[720px]" : "max-h-[430px]"}`}>
        {events.length === 0 && (
          <div className="rounded-md border border-line bg-shell/70 p-4 text-sm text-slate-400">
            No live transactions received yet. If you are in `real_only` mode, wait for upstream provider data.
          </div>
        )}
        {events.map((event, index) => {
          const active = selected?.txHash === event.txHash;
          const source = transactionSource(event);
          const isFrozen = frozenTxHashes.includes(event.txHash);
          const isSuspiciousOrFraud = event.classification === "SUSPICIOUS" || event.classification === "FRAUD";
          return (
            <motion.div
              key={event.txHash}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.025, 0.18) }}
              whileHover={{ x: 4, scale: 1.005 }}
              className={`live-row group relative grid gap-2 rounded-md border p-3 text-left transition ${
                isFrozen
                  ? "frozen-glass-effect"
                  : active
                  ? "border-aqua/60 bg-aqua/10 shadow-glow"
                  : "border-line bg-panelSoft/90 hover:border-aqua/40"
              }`}
            >
              <div 
                className="cursor-pointer grid gap-2"
                onClick={() => setSelected(event)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-300 transition group-hover:text-white flex items-center gap-1.5">
                    {isFrozen && <LockKeyhole className="h-3 w-3 text-aqua animate-pulse" />}
                    {shortHash(event.txHash)}
                  </span>
                  <div className="inline-flex items-center gap-2">
                    <SourcePill source={source} />
                    <StatusPill classification={event.classification} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
                  <span>{shortHash(event.from_address)}</span>
                  <span>{shortHash(event.to_address)}</span>
                  <span>
                    {Number(event.amount).toFixed(4)} {assetSymbol(event)}
                  </span>
                  <span className="text-right text-slate-200">{event.risk_score}/100</span>
                </div>
              </div>
              
              {isSuspiciousOrFraud && toggleFreezeTransaction && (
                <div className="absolute right-3 bottom-2.5 opacity-0 group-hover:opacity-100 transition duration-150">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFreezeTransaction(event.txHash);
                    }}
                    title={isFrozen ? "Unfreeze transaction" : "Freeze transaction"}
                    className={`p-1 rounded border transition ${
                      isFrozen
                        ? "border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
                        : "border-aqua/40 bg-aqua/10 text-aqua hover:bg-aqua/20"
                    }`}
                  >
                    <LockKeyhole className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </Panel>
  );
}

function NetworkGraph({ events, selected }) {
  const nodes = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      map.set(event.from_address, { id: event.from_address, risk: Math.max(map.get(event.from_address)?.risk || 0, event.risk_score) });
      map.set(event.to_address, { id: event.to_address, risk: Math.max(map.get(event.to_address)?.risk || 0, Math.round(event.risk_score * 0.72)) });
    });
    return Array.from(map.values()).slice(0, 10);
  }, [events]);
  const positions = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    return { ...node, x: 50 + Math.cos(angle) * 34, y: 50 + Math.sin(angle) * 32 };
  });
  const byId = new Map(positions.map((node) => [node.id, node]));
  return (
    <div className="aspect-[4/3] min-h-[320px] w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full rounded-md border border-line bg-shell">
        {events.slice(0, 14).map((event) => {
          const from = byId.get(event.from_address);
          const to = byId.get(event.to_address);
          if (!from || !to) return null;
          return (
            <line
              key={`${event.txHash}-edge`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={event.risk_score >= 75 ? "#ff4d6d" : event.risk_score >= 45 ? "#f2b84b" : "#24c6dc"}
              strokeWidth={selected?.txHash === event.txHash ? 0.75 : 0.35}
              opacity={0.72}
            />
          );
        })}
        {positions.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.risk >= 75 ? 4.5 : 3.6}
              fill={node.risk >= 75 ? "#ff4d6d" : node.risk >= 45 ? "#f2b84b" : "#3ddc97"}
              opacity={0.95}
            />
            <text x={node.x + 4.5} y={node.y + 1.5} fill="#cbd5e1" fontSize="2.5">
              {shortHash(node.id)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function RiskTrend({ data, withConfidence = false }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid stroke="#293241" vertical={false} />
        <XAxis dataKey="name" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" domain={[0, 100]} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="risk" stroke="#24c6dc" strokeWidth={2} dot={false} />
        {withConfidence && <Line type="monotone" dataKey="confidence" stroke="#9b8cff" strokeWidth={2} dot={false} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RiskGauge({ score, classification }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 75 ? "#ff4d6d" : clamped >= 45 ? "#f2b84b" : "#3ddc97";
  return (
    <div className="grid place-items-center gap-3">
      <div
        className="grid h-44 w-44 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${clamped * 3.6}deg, #171d26 0deg)`
        }}
      >
        <div className="grid h-36 w-36 place-items-center rounded-full border border-line bg-shell text-center">
          <div>
            <div className="text-4xl font-bold text-white font-display">{clamped}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-display">risk score</div>
          </div>
        </div>
      </div>
      <StatusPill classification={classification} />
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, accent, isFrozen = false }) {
  return (
    <motion.div
      className={`metric-card rounded-md border p-4 shadow-glow transition-all duration-300 ${
        isFrozen ? "frozen-glass-effect frozen-pulse" : "border-line bg-panel/90"
      }`}
      whileHover={{ y: -4, rotateX: 2, borderColor: "rgba(36,198,220,0.55)" }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-slate-400 uppercase tracking-wider flex-1 min-w-0 break-words leading-tight">{label}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-shell/70">
          <Icon className={`h-5 w-5 ${accent}`} />
        </span>
      </div>
      <div className="mt-3 text-lg font-bold text-white font-display sm:text-xl leading-none">{value}</div>
    </motion.div>
  );
}

function Panel({ title, children }) {
  return (
    <motion.section
      className="glass-panel rounded-md border border-line bg-panel/88 p-4 shadow-glow min-w-0 overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ borderColor: "rgba(36,198,220,0.45)" }}
      transition={{ duration: 0.28 }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 font-display">{title}</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-aqua/30 to-transparent" />
      </div>
      {children}
    </motion.section>
  );
}

function StatusPill({ classification }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${statusTone[classification] || statusTone.SAFE}`}>
      {classification}
    </span>
  );
}

function SourcePill({ source }) {
  const tone =
    source === "REAL"
      ? "border-mint/40 bg-mint/10 text-mint"
      : source === "MOCK"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-line bg-shell text-slate-300";
  return <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${tone}`}>{source}</span>;
}

function Badge({ icon: Icon, label }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-shell/75 px-3 text-sm text-slate-300 shadow-glow">
      <Icon className="h-4 w-4 text-aqua" />
      {label}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-mint" : "bg-warning"}`} />
      <span className="text-slate-200">{active ? "live" : "fallback"}</span>
    </span>
  );
}

const tooltipStyle = {
  background: "#11151d",
  border: "1px solid #293241",
  borderRadius: "8px",
  color: "#eef2f7"
};
