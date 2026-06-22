const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || API_BASE.replace(/^http/, "ws") + "/live-stream";

export async function analyzeTransaction(payload) {
  const response = await fetch(`${API_BASE}/analyze-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Transaction analysis failed");
  }
  return response.json();
}

export async function getWallet(address) {
  return getWalletForNetwork(address, "ethereum");
}

export async function getWalletForNetwork(address, network) {
  const response = await fetch(`${API_BASE}/wallet/${address}?network=${encodeURIComponent(network)}`);
  if (!response.ok) {
    throw new Error("Wallet lookup failed");
  }
  return response.json();
}

export async function getNetworks() {
  const response = await fetch(`${API_BASE}/networks`);
  if (!response.ok) {
    throw new Error("Network lookup failed");
  }
  return response.json();
}

export async function getAlerts(network, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (network) {
    params.set("network", network);
  }
  const response = await fetch(`${API_BASE}/alerts?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Saved alerts lookup failed");
  }
  return response.json();
}

export async function getHealth() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json();
}
