const wallets = [
  "0x742d35cc6634c0532925a3b844bc454e4438f44e",
  "0x53d284357ec70ce289d6d64134dfac8e511c8a3d",
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
  "0x281055afc982d96fab65b3a49cac8b878184cb16"
];

export function createMockEvent(index = 0) {
  const score = [18, 36, 52, 67, 83, 91][Math.floor(Math.random() * 6)];
  const classification = score >= 75 ? "FRAUD" : score >= 45 ? "SUSPICIOUS" : "SAFE";
  const from = wallets[Math.floor(Math.random() * wallets.length)];
  const to = wallets[Math.floor(Math.random() * wallets.length)];
  return {
    txHash: `0x${crypto.randomUUID().replaceAll("-", "")}${index}`,
    from_address: from,
    to_address: to,
    amount: Number((Math.random() * (score > 70 ? 320 : 8)).toFixed(4)),
    timestamp: new Date().toISOString(),
    network: "ethereum",
    risk_score: score,
    classification,
    confidence_level: Number((0.62 + Math.random() * 0.32).toFixed(2)),
    explanation:
      classification === "SAFE"
        ? "No critical fraud pattern was detected. Baseline wallet behavior remains within expected thresholds."
        : "The transaction was flagged by anomalous value movement, gas behavior, and counterparty reputation signals.",
    signals: [
      score > 70 ? "known risky counterparty" : "baseline graph-risk prior applied",
      score > 45 ? "elevated transfer velocity" : "normal transfer cadence"
    ],
    model_output: { fraud_model_status: "mock" }
  };
}
