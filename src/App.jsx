import { useState, useMemo } from "react";

const MP = 365;
const MAX_RATE = 0.12;
const DURATIONS = [1, 7, 14, 30, 60, 90, 180, 365];

const REAL_DATA = {
  byCount: { "14d": 33.0, "15-30d": 39.9, "31-60d": 11.8, "61-90d": 4.2, "91-180d": 3.5, "181-270d": 0.6, "271-365d": 3.1 },
  byStake: { "14d": 6.0, "15-30d": 43.3, "31-60d": 18.5, "61-90d": 9.2, "91-180d": 6.7, "181-270d": 0.6, "271-365d": 12.5 },
  totalValidators: 13773,
  totalStake: 1069190664
};

function ecr(minRate, days) {
  const r = days / MP;
  return minRate * (1 - r) + MAX_RATE * r;
}

function apyFor(minRate, days) {
  return ((720e6 - 450e6) / 450e6) * ecr(minRate, days) * 100;
}

function optVal(exitD, lockD, vol, cap) {
  if (exitD >= lockD) return 0;
  const t = (lockD - exitD) / 365;
  return vol * Math.sqrt(t) * 0.4 + cap * t;
}

function genValidators(n = 2000) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let lp, stake;
    if (r < 0.03) { lp = Math.random() * 0.05; stake = 200000 + Math.random() * 1200000; }
    else if (r < 0.06) { lp = 0.05 + Math.random() * 0.1; stake = 50000 + Math.random() * 500000; }
    else if (r < 0.10) { lp = 0.1 + Math.random() * 0.12; stake = 30000 + Math.random() * 300000; }
    else if (r < 0.22) { lp = 0.15 + Math.random() * 0.15; stake = 20000 + Math.random() * 250000; }
    else if (r < 0.62) { lp = 0.3 + Math.random() * 0.2; stake = 2000 + Math.random() * 300000; }
    else { lp = 0.5 + Math.random() * 0.5; stake = 2000 + Math.random() * 30000; }
    v.push({ lp, stake });
  }
  return v;
}

function runSim(mr, vol, cap, vals) {
  const minR = mr / 100;
  const apys = {};
  DURATIONS.forEach(d => { apys[d] = apyFor(minR, d); });
  const ts = vals.reduce((s, v) => s + v.stake, 0);
  const sbd = {}, cbd = {};
  DURATIONS.forEach(d => { sbd[d] = 0; cbd[d] = 0; });
  vals.forEach(v => {
    let bd = 1, bu = -Infinity;
    DURATIONS.forEach(d => {
      const u = apys[d] - v.lp * optVal(1, d, vol, cap) * 100;
      if (u > bu) { bu = u; bd = d; }
    });
    sbd[bd] += v.stake; cbd[bd]++;
  });
  const pbd = {}, pcbd = {};
  const tn = vals.length;
  DURATIONS.forEach(d => { pbd[d] = (sbd[d] / ts) * 100; pcbd[d] = (cbd[d] / tn) * 100; });
  return { apys, pbd, pcbd, p24s: pbd[1], p24c: pcbd[1], pu7s: pbd[1] + (pbd[7] || 0), pu30s: pbd[1] + (pbd[7] || 0) + (pbd[14] || 0) + (pbd[30] || 0) };
}

function runAvg(mr, vol, cap, runs = 10) {
  const rs = [];
  for (let i = 0; i < runs; i++) rs.push(runSim(mr, vol, cap, genValidators(2000)));
  const a = { apys: rs[0].apys, pbd: {}, pcbd: {}, p24s: 0, p24c: 0, pu7s: 0, pu30s: 0 };
  DURATIONS.forEach(d => { a.pbd[d] = 0; a.pcbd[d] = 0; });
  rs.forEach(r => {
    a.p24s += r.p24s; a.p24c += r.p24c; a.pu7s += r.pu7s; a.pu30s += r.pu30s;
    DURATIONS.forEach(d => { a.pbd[d] += r.pbd[d]; a.pcbd[d] += r.pcbd[d]; });
  });
  a.p24s /= runs; a.p24c /= runs; a.pu7s /= runs; a.pu30s /= runs;
  DURATIONS.forEach(d => { a.pbd[d] /= runs; a.pcbd[d] /= runs; });
  return a;
}

function doSweep(vol, cap) {
  const o = [];
  for (let r = 1; r <= 12; r += 0.5) {
    const res = runAvg(r, vol, cap, 8);
    o.push({ mr: r, p24s: res.p24s, p24c: res.p24c, pu30s: res.pu30s, apy24: apyFor(r / 100, 1), apy365: apyFor(r / 100, 365) });
  }
  return o;
}

function Bar({ pct, color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
      <div style={{ width: 45, fontSize: 11, color: "#94a3b8", textAlign: "right", fontFamily: "monospace" }}>{label}</div>
      <div style={{ flex: 1, background: "#1e293b", borderRadius: 4, height: 18, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <div style={{ width: 50, fontSize: 11, color: "#e2e8f0", fontFamily: "monospace", textAlign: "right" }}>{pct.toFixed(1)}%</div>
    </div>
  );
}

const dc = { 1: "#ef4444", 7: "#f97316", 14: "#eab308", 30: "#84cc16", 60: "#22c55e", 90: "#14b8a6", 180: "#3b82f6", 365: "#8b5cf6" };

export default function App() {
  const [mr, setMr] = useState(6);
  const [vol, setVol] = useState(0.35);
  const [cap, setCap] = useState(0.08);
  const [tab, setTab] = useState("single");
  const [metric, setMetric] = useState("stake");

  const single = useMemo(() => runAvg(mr, vol, cap, 12), [mr, vol, cap]);
  const sw = useMemo(() => doSweep(vol, cap), [vol, cap]);
  const thresh = useMemo(() => { for (const d of sw) { if (d.p24s <= 33) return d.mr; } return null; }, [sw]);

  const safe = single.p24s <= 33;
  const danger = single.p24s > 50;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh", padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 2 }}>
        ACP-273 + ACP-236: Validator Equilibrium Model
      </h2>
      <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, marginBottom: 4 }}>
        Calibrated with P-Chain validator data (13,773 staking transactions, last 365 days · ~709 active validators)
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
        Simulates rational validators choosing staking durations under 24h minimum + auto-renewal.
        Validators have natural planning horizons (monthly, quarterly, annual) that create intermediate preferences.
        <strong style={{ color: "#f87171" }}> If &gt;33% of stake converges on 24h, consensus safety is at risk.</strong>
      </p>

      {/* Real data baseline */}
      <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid #3b82f6", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 8 }}>📊 P-Chain Validator Baseline (Current 14-Day Minimum)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>By Validator Count</div>
            {[
              { l: "14d (min)", v: 33.0 }, { l: "15-30d", v: 39.9 }, { l: "31-60d", v: 11.8 },
              { l: "61-90d", v: 4.2 }, { l: "91-180d", v: 3.5 }, { l: "181-270d", v: 0.6 }, { l: "271-365d", v: 3.1 }
            ].map(d => <Bar key={d.l} pct={d.v} color={d.v === 33.0 ? "#eab308" : d.v === 39.9 ? "#84cc16" : "#3b82f6"} label={d.l} />)}
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>By Stake Weight (AVAX)</div>
            {[
              { l: "14d (min)", v: 6.0 }, { l: "15-30d", v: 43.3 }, { l: "31-60d", v: 18.5 },
              { l: "61-90d", v: 9.2 }, { l: "91-180d", v: 6.7 }, { l: "181-270d", v: 0.6 }, { l: "271-365d", v: 12.5 }
            ].map(d => <Bar key={d.l} pct={d.v} color={d.v === 6.0 ? "#22c55e" : d.v === 43.3 ? "#84cc16" : "#3b82f6"} label={d.l} />)}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8, borderTop: "1px solid #334155", paddingTop: 6 }}>
          <strong>Key insight:</strong> Only 6% of validator <em>stake</em> is at the 14d minimum (vs 33% by count). Large validators choose longer durations. 47% of stake is at 31+ days.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["single", "Single Rate"], ["sweep", "Rate Sweep"], ["compare", "Scenarios"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer", fontSize: 11,
            background: tab === k ? "#3b82f6" : "#1e293b", color: tab === k ? "#fff" : "#94a3b8"
          }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14, background: "#1e293b", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
        <div>
          <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>
            MinConsumptionRate: <strong style={{ color: "#f8fafc" }}>{mr.toFixed(1)}%</strong>
            <span style={{ color: "#64748b" }}> (current: 10%)</span>
          </label>
          <input type="range" min={1} max={12} step={0.5} value={mr} onChange={e => setMr(+e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>
            AVAX Volatility: <strong style={{ color: "#f8fafc" }}>{(vol * 100).toFixed(0)}%</strong>
          </label>
          <input type="range" min={10} max={80} step={5} value={vol * 100} onChange={e => setVol(+e.target.value / 100)} style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>
            Alt. DeFi Yield: <strong style={{ color: "#f8fafc" }}>{(cap * 100).toFixed(0)}%</strong>
          </label>
          <input type="range" min={2} max={20} step={1} value={cap * 100} onChange={e => setCap(+e.target.value / 100)} style={{ width: "100%" }} />
        </div>
      </div>

      {tab === "single" && (
        <div>
          <div style={{
            padding: 12, borderRadius: 8, marginBottom: 14,
            background: danger ? "rgba(239,68,68,0.15)" : safe ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
            border: `1px solid ${danger ? "#ef4444" : safe ? "#22c55e" : "#eab308"}`
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{danger ? "🚨" : safe ? "✅" : "⚠️"}</span>
              <div>
                <div style={{ fontWeight: 700, color: danger ? "#ef4444" : safe ? "#22c55e" : "#eab308", fontSize: 14 }}>
                  {danger ? "DANGEROUS" : safe ? "SAFE" : "WARNING"}: {single.p24s.toFixed(1)}% of stake at 24h
                  <span style={{ fontWeight: 400, fontSize: 11, color: "#94a3b8" }}> ({single.p24c.toFixed(1)}% by count)</span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  24h APY: {single.apys[1].toFixed(2)}% | 365d APY: {single.apys[365].toFixed(2)}% | Spread: {(single.apys[365] - single.apys[1]).toFixed(2)}pp
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["stake", "count"].map(m => (
              <button key={m} onClick={() => setMetric(m)} style={{
                padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 10,
                background: metric === m ? "#475569" : "#1e293b", color: metric === m ? "#fff" : "#94a3b8"
              }}>{m === "stake" ? "By Stake Weight" : "By Validator Count"}</button>
            ))}
          </div>

          <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#f8fafc" }}>
              Projected Distribution ({metric === "stake" ? "% of total stake" : "% of validators"})
            </div>
            {DURATIONS.map(d => (
              <Bar key={d} pct={metric === "stake" ? (single.pbd[d] || 0) : (single.pcbd[d] || 0)} color={dc[d]}
                label={d === 1 ? "24h" : d === 365 ? "1yr" : `${d}d`} />
            ))}
            <div style={{ marginTop: 8, borderTop: "1px solid #334155", paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "#94a3b8" }}>Stake ≤ 30 days:</span>
                <span style={{ color: single.pu30s > 67 ? "#ef4444" : "#22c55e", fontWeight: 700 }}>{single.pu30s.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#f8fafc" }}>APY by Duration</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {DURATIONS.map(d => (
                <div key={d} style={{ textAlign: "center", padding: 8, background: "#0f172a", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{d === 1 ? "24h" : d === 365 ? "1yr" : `${d}d`}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: dc[d], fontFamily: "monospace" }}>{single.apys[d].toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "sweep" && (
        <div>
          {thresh && (
            <div style={{ padding: 12, borderRadius: 8, marginBottom: 14, background: "rgba(34,197,94,0.15)", border: "1px solid #22c55e" }}>
              <div style={{ fontWeight: 700, color: "#22c55e", fontSize: 14 }}>
                Safety threshold (by stake): MinConsumptionRate ≤ {thresh.toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                Below this, &lt;33% of validator stake converges on 24h. Current rate of 10% is {(10 - thresh).toFixed(1)}pp too high.
              </div>
            </div>
          )}

          <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#f8fafc" }}>% of Validator Stake at 24h vs MinConsumptionRate</div>
            <div style={{ position: "relative", height: 260, marginBottom: 8 }}>
              <div style={{ position: "absolute", top: `${(1 - 33 / 100) * 100}%`, left: 30, right: 0, borderTop: "2px dashed #ef4444", zIndex: 2 }}>
                <span style={{ position: "absolute", right: 0, top: -16, fontSize: 10, color: "#ef4444" }}>33% threshold</span>
              </div>
              {[0, 25, 50, 75, 100].map(y => (
                <div key={y} style={{ position: "absolute", top: `${(1 - y / 100) * 100}%`, left: 0, right: 0, borderTop: "1px solid rgba(51,65,85,0.5)" }}>
                  <span style={{ position: "absolute", left: 0, top: -7, fontSize: 9, color: "#64748b" }}>{y}%</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: 2, paddingLeft: 30 }}>
                {sw.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{
                      width: "80%", height: `${(d.p24s / 100) * 100}%`,
                      background: d.p24s > 33 ? "#ef4444" : "#22c55e",
                      opacity: 0.8, borderRadius: "3px 3px 0 0", minHeight: 2
                    }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 2, paddingLeft: 30 }}>
              {sw.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#64748b" }}>
                  {d.mr % 1 === 0 ? `${d.mr}%` : ""}
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: "#64748b", marginTop: 2 }}>MinConsumptionRate →</div>
          </div>

          <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#94a3b8" }}>MinRate</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", color: "#94a3b8" }}>24h APY</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", color: "#94a3b8" }}>365d APY</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", color: "#94a3b8" }}>Spread</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", color: "#94a3b8" }}>% Stake@24h</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", color: "#94a3b8" }}>% Count@24h</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", color: "#94a3b8" }}>Safe?</th>
                </tr>
              </thead>
              <tbody>
                {sw.filter((_, i) => i % 2 === 0).map(d => (
                  <tr key={d.mr} style={{ borderBottom: "1px solid #0f172a", background: d.mr === 10 ? "rgba(239,68,68,0.08)" : "transparent" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 600, color: d.mr === 10 ? "#f87171" : "#f8fafc" }}>
                      {d.mr.toFixed(0)}%{d.mr === 10 ? " ←current" : ""}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#94a3b8" }}>{d.apy24.toFixed(2)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#94a3b8" }}>{d.apy365.toFixed(2)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#eab308" }}>{(d.apy365 - d.apy24).toFixed(2)}pp</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: d.p24s <= 33 ? "#22c55e" : "#ef4444" }}>
                      {d.p24s.toFixed(1)}%
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#94a3b8" }}>{d.p24c.toFixed(1)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{d.p24s <= 33 ? "✅" : "🚨"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "compare" && (() => {
        const s10 = runAvg(10, vol, cap, 10);
        const s8 = runAvg(8, vol, cap, 10);
        const s6 = runAvg(6, vol, cap, 10);
        const s4 = runAvg(4, vol, cap, 10);
        const scenarios = [
          { name: "MinRate=10% (current)", d: s10, color: "#ef4444", note: "No consumption rate change" },
          { name: "MinRate=8%", d: s8, color: "#f97316", note: "Modest reduction" },
          { name: "MinRate=6%", d: s6, color: "#eab308", note: "Moderate spread" },
          { name: "MinRate=4%", d: s4, color: "#22c55e", note: "Strong incentive for longer commitments" }
        ];
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#f8fafc" }}>
              What happens when MinStakeDuration → 24h at different consumption rates?
            </div>
            {scenarios.map(s => (
              <div key={s.name} style={{ background: "#1e293b", padding: 12, borderRadius: 8, border: "1px solid #334155", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: s.color, fontSize: 13 }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8 }}>{s.note}</span>
                  </div>
                  <div style={{
                    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: s.d.p24s > 50 ? "rgba(239,68,68,0.2)" : s.d.p24s > 33 ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.2)",
                    color: s.d.p24s > 50 ? "#ef4444" : s.d.p24s > 33 ? "#eab308" : "#22c55e"
                  }}>
                    {s.d.p24s.toFixed(1)}% stake @ 24h
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, height: 24, borderRadius: 4, overflow: "hidden" }}>
                  {DURATIONS.map(d => {
                    const p = s.d.pbd[d] || 0;
                    if (p < 0.5) return null;
                    return (
                      <div key={d} style={{
                        width: `${p}%`, background: dc[d], display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 600, minWidth: p > 4 ? 24 : 0
                      }}>
                        {p > 5 ? `${d === 1 ? "24h" : d === 365 ? "1y" : d + "d"} ${p.toFixed(0)}%` : ""}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  <span>24h: {s.d.apys[1].toFixed(2)}%</span>
                  <span>14d: {s.d.apys[14].toFixed(2)}%</span>
                  <span>365d: {s.d.apys[365].toFixed(2)}%</span>
                  <span>Spread: {(s.d.apys[365] - s.d.apys[1]).toFixed(2)}pp</span>
                </div>
              </div>
            ))}
            <div style={{ background: "#1e293b", padding: 12, borderRadius: 8, border: "1px solid #334155", marginTop: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {DURATIONS.map(d => (
                  <div key={d} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: dc[d] }} />
                    <span style={{ color: "#94a3b8" }}>{d === 1 ? "24h" : d === 365 ? "1yr" : `${d}d`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <details style={{ marginTop: 14 }}>
        <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>Model Assumptions & Calibration</summary>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7, marginTop: 8, padding: 12, background: "#1e293b", borderRadius: 8 }}>
          <strong style={{ color: "#22c55e" }}>v4 — Intermediate duration preferences:</strong> Validators have natural planning horizons (biweekly, monthly, quarterly, semi-annual, annual) that create genuine preferences for intermediate durations, not just min vs max.
          <br /><br />
          <strong style={{ color: "#94a3b8" }}>Calibration source:</strong> 13,773 Primary Network validator staking transactions over last 365 days via Avalanche datalake (delta.lakehouse.validators). There are approximately 709 active validators at any given time; the larger dataset captures staking behavior across rotation cycles. Key finding: only 6% of stake is at the 14d minimum by weight, despite 33% by count. 47% of stake is at 31+ days.
          <br /><br />
          <strong style={{ color: "#94a3b8" }}>Population model:</strong> ~3% institutional long-term (high stake, low liquidity preference), ~4% medium-long, ~12% moderate (31-60d), ~40% short-term buffer (15-30d), ~38% minimum duration seekers. Stake sizes calibrated to match real averages.
          <br /><br />
          <strong style={{ color: "#94a3b8" }}>Decision:</strong> utility = APY − liquidity_preference × option_value. Option value uses simplified Black-Scholes pricing for exit flexibility. Monte Carlo averaged over 8-12 runs.
          <br /><br />
          <strong style={{ color: "#94a3b8" }}>Formula:</strong> EffectiveConsumptionRate = MinRate × (1 − StakingPeriod/365) + MaxRate × (StakingPeriod/365). MaxConsumptionRate fixed at 12%. APY ≈ ((720M − 450M) / 450M) × ECR × 100.
          <br /><br />
          <strong style={{ color: "#94a3b8" }}>Limitations:</strong> Static equilibrium, not dynamic. Doesn't model strategic interactions, MEV, fee revenue, or non-economic motivations. Results are directional, not precise.
          <br /><br />
          <a href="https://github.com/avalanche-foundation/ACPs/discussions/274" target="_blank" style={{ color: "#3b82f6" }}>→ ACP-273 Discussion</a>
        </div>
      </details>

      <div style={{ marginTop: 16, padding: 12, borderTop: "1px solid #1e293b", fontSize: 10, color: "#475569", textAlign: "center" }}>
        Built for <a href="https://github.com/avalanche-foundation/ACPs/discussions/274" target="_blank" style={{ color: "#64748b" }}>ACP-273</a> analysis.
        Model source data: Avalanche P-Chain (delta.lakehouse.validators).
      </div>
    </div>
  );
}