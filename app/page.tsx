"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./page.module.css";

type ApiPoint = { temperature: number; presence: boolean; datetime: string };
type Sample = { t: number; v: number };
type ConnState = "idle" | "connecting" | "live" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
type Tone = "ink" | "dim" | "warn" | "err";

const DURATION_RE = /^\s*(\d+\s*h)?\s*(\d+\s*m)?\s*(\d+\s*s)?\s*$/i;
const POLL_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 1000;
const BUFFER_SIZE = 300;

function validateDuration(s: string): string | null {
  if (!s || !s.trim()) return "required";
  if (!DURATION_RE.test(s)) return "use e.g. 1h 30m or 40s";
  if (!/\d/.test(s)) return "must contain a number";
  if (!/[hms]/i.test(s)) return "must include h/m/s";
  return null;
}

function validateUrl(s: string): string | null {
  if (!s || !s.trim()) return "required";
  try {
    const u = new URL(s);
    if (!u.host) return "missing host";
    return null;
  } catch {
    return "invalid URL";
  }
}

function validateCooling(n: number): string | null {
  if (!Number.isFinite(n)) return "required";
  if (n < 0 || n > 50) return "range 0–50°C";
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtClock(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

const CONN_LABEL: Record<ConnState, string> = {
  idle: "IDLE",
  connecting: "CONN…",
  live: "LIVE",
  error: "ERR",
};

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "";
const versionLabel = GIT_SHA ? `v${APP_VERSION}+${GIT_SHA}` : `v${APP_VERSION}`;

function connTone(c: ConnState): Tone {
  if (c === "live") return "ink";
  if (c === "connecting") return "warn";
  if (c === "error") return "err";
  return "dim";
}

// ─── TempChart ─────────────────────────────────────────────────

function TempChart({
  series,
  threshold,
}: {
  series: Sample[];
  threshold: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ w: Math.max(0, cr.width), h: Math.max(0, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = size.w;
  const h = size.h;
  const ready = series.length > 1 && w > 0 && h > 0;

  let body: React.ReactNode = null;
  if (ready) {
    const padX = 48;
    const padTop = 12;
    const padBottom = 28;
    const innerW = Math.max(1, w - padX - 12);
    const innerH = Math.max(1, h - padTop - padBottom);

    const vals = series.map((d) => d.v);
    const lo = Math.min(...vals, threshold) - 0.5;
    const hi = Math.max(...vals, threshold) + 0.5;
    const range = hi - lo || 1;
    const xAt = (i: number) =>
      padX + (i / Math.max(1, series.length - 1)) * innerW;
    const yAt = (v: number) => padTop + innerH - ((v - lo) / range) * innerH;

    const pts: [number, number][] = series.map((d, i) => [xAt(i), yAt(d.v)]);
    let path = "";
    pts.forEach(([x, y], i) => {
      path += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    });
    const last = pts[pts.length - 1];
    const first = pts[0];
    const areaPath =
      path +
      ` L${last[0]},${padTop + innerH} L${first[0]},${padTop + innerH} Z`;

    const yTicks: { v: number; y: number }[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = lo + (range / 4) * i;
      yTicks.push({ v, y: yAt(v) });
    }
    const xTicks: { x: number; lbl: string }[] = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / (n - 1)) * (series.length - 1));
      xTicks.push({ x: xAt(idx), lbl: fmtClock(series[idx].t) });
    }

    const showThreshold = threshold >= lo && threshold <= hi;

    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {yTicks.map((t, i) => (
          <line
            key={`gy${i}`}
            x1={padX}
            x2={padX + innerW}
            y1={t.y}
            y2={t.y}
            className={styles.chartGrid}
            strokeDasharray={i === 0 || i === yTicks.length - 1 ? undefined : "2 3"}
          />
        ))}
        {xTicks.map((t, i) => (
          <line
            key={`gx${i}`}
            x1={t.x}
            x2={t.x}
            y1={padTop}
            y2={padTop + innerH}
            className={styles.chartGrid}
            strokeDasharray="2 3"
          />
        ))}

        {showThreshold && (
          <>
            <line
              x1={padX}
              x2={padX + innerW}
              y1={yAt(threshold)}
              y2={yAt(threshold)}
              className={styles.chartThresholdLine}
              strokeDasharray="4 3"
            />
            <text
              x={padX + innerW}
              y={yAt(threshold) - 4}
              textAnchor="end"
              className={styles.chartThresholdLabel}
            >
              cooling · {threshold.toFixed(1)}°
            </text>
          </>
        )}

        <path d={areaPath} className={styles.chartArea} />
        <path d={path} className={styles.chartLine} />

        <circle cx={last[0]} cy={last[1]} r={4} className={styles.chartHead} />
        <circle cx={last[0]} cy={last[1]} r={8} className={styles.chartHeadHalo}>
          <animate attributeName="r" from="4" to="14" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" from=".4" to="0" dur="1.4s" repeatCount="indefinite" />
        </circle>

        {yTicks.map((t, i) => (
          <text
            key={`yl${i}`}
            x={padX - 8}
            y={t.y + 3}
            textAnchor="end"
            className={styles.chartAxisLabel}
          >
            {t.v.toFixed(1)}
          </text>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={`xl${i}`}
            x={t.x}
            y={padTop + innerH + 16}
            textAnchor="middle"
            className={styles.chartAxisLabel}
          >
            {t.lbl}
          </text>
        ))}
      </svg>
    );
  }

  return (
    <div ref={ref} className={styles.chartCanvas}>
      {body}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────

export default function Home() {
  // theme — defaults to light; respects explicit user toggle via localStorage
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const stored = localStorage.getItem("shh-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("shh-theme", next);
      return next;
    });

  // url + connection
  const [url, setUrl] = useState("");
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>("idle");

  // chart data + window
  const [series, setSeries] = useState<Sample[]>([]);
  const [points, setPoints] = useState(120);

  // settings
  const [cooling, setCooling] = useState(24);
  const [coolingErr, setCoolingErr] = useState<string | null>(null);
  const [lightTime, setLightTime] = useState("19:30:00");
  const [lightDur, setLightDur] = useState("4h");
  const [lightDurErr, setLightDurErr] = useState<string | null>(null);
  const [lightsOn, setLightsOn] = useState(false);

  // save lifecycle
  const [save, setSave] = useState<{ status: SaveState; err: string | null }>({
    status: "idle",
    err: null,
  });

  // logs + uptime
  const [logs, setLogs] = useState<{ t: number; msg: string }[]>([
    { t: Date.now(), msg: "session start" },
  ]);
  const [uptime, setUptime] = useState(0);

  const log = useCallback((msg: string) => {
    setLogs((l) => [...l.slice(-20), { t: Date.now(), msg }]);
  }, []);

  // hydrate URL from localStorage (with migration from old key)
  useEffect(() => {
    const stored =
      localStorage.getItem("shh-api-url") ||
      localStorage.getItem("api_url") ||
      "";
    if (stored) setUrl(stored);
  }, []);

  // session uptime, ticks once per second
  useEffect(() => {
    const id = setInterval(() => setUptime((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── polling ────────────────────────────────────────────────
  const isFetchingRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  const fetchGraph = useCallback(
    async (apiUrl: string): Promise<Sample[] | null> => {
      if (!apiUrl || isFetchingRef.current) return null;
      isFetchingRef.current = true;
      const ac = new AbortController();
      pollAbortRef.current = ac;
      const timer = setTimeout(() => ac.abort(), POLL_TIMEOUT_MS);
      try {
        const r = await fetch(
          `${trimTrailingSlash(apiUrl)}/graph?size=${BUFFER_SIZE}`,
          { signal: ac.signal },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw: ApiPoint[] = await r.json();
        const samples: Sample[] = raw
          .map((p) => ({ t: new Date(p.datetime).getTime(), v: p.temperature }))
          .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v));
        return samples.slice(-BUFFER_SIZE);
      } catch (e) {
        const err = e as { name?: string; message?: string };
        const reason =
          err?.name === "AbortError" ? "timeout" : err?.message ?? "error";
        log(`GET /graph failed · ${reason}`);
        return null;
      } finally {
        clearTimeout(timer);
        isFetchingRef.current = false;
      }
    },
    [log],
  );

  // poll loop while connected
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    if (conn !== "live") return;
    let stopped = false;
    const fire = async () => {
      const next = await fetchGraph(urlRef.current);
      if (stopped) return;
      if (next === null) {
        setConn("error");
      } else {
        setSeries(next);
      }
    };
    fire();
    const id = setInterval(fire, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [conn, fetchGraph]);

  const connect = async () => {
    const e = validateUrl(url);
    setUrlErr(e);
    if (e) return;
    localStorage.setItem("shh-api-url", url);
    setConn("connecting");
    log(`connect → ${url}`);
    const next = await fetchGraph(url);
    if (next === null) {
      setConn("error");
      log("ERR connect refused");
      return;
    }
    setSeries(next);
    setConn("live");
    log(`GET /graph 200 · ${next.length} samples · 1Hz poll`);
  };

  const disconnect = () => {
    pollAbortRef.current?.abort();
    setConn("idle");
    log("disconnect");
  };

  // ─── save ───────────────────────────────────────────────────
  const handleSave = async () => {
    const cE = validateCooling(cooling);
    const dE = validateDuration(lightDur);
    setCoolingErr(cE);
    setLightDurErr(dE);
    if (cE || dE) {
      log("save aborted · validation");
      return;
    }
    if (!url) {
      log("save aborted · no api url");
      setSave({ status: "error", err: "no url" });
      return;
    }
    setSave({ status: "saving", err: null });
    log(`PUT /settings cooling=${cooling}°C trigger=${lightTime} dur=${lightDur}`);
    try {
      const r = await fetch(`${trimTrailingSlash(url)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_temp: cooling,
          user_light: lightTime,
          light_duration: lightDur,
        }),
      });
      if (!r.ok) {
        setSave({ status: "error", err: `${r.status}` });
        log(`PUT /settings ${r.status}`);
        return;
      }
      setSave({ status: "saved", err: null });
      log("PUT /settings ok");
      setTimeout(() => setSave({ status: "idle", err: null }), 1600);
    } catch (e) {
      const err = e as { message?: string };
      setSave({ status: "error", err: err?.message ?? "network" });
      log(`PUT /settings failed · ${err?.message ?? "network"}`);
    }
  };

  // ─── derived ────────────────────────────────────────────────
  const visible = useMemo(() => series.slice(-points), [series, points]);
  const hasData = visible.length >= 1;
  const cur = hasData ? visible[visible.length - 1].v : 0;
  const trend = visible.length > 1 ? cur - visible[0].v : 0;
  const high = hasData ? Math.max(...visible.map((d) => d.v)) : 0;
  const low = hasData ? Math.min(...visible.map((d) => d.v)) : 0;
  const cooler = hasData && cur > cooling;
  const pct = Math.min(1, Math.max(0, (cur - 18) / 12));

  // ─── handlers ───────────────────────────────────────────────
  const onUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (urlErr) setUrlErr(validateUrl(e.target.value));
  };
  const onCoolingChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setCooling(v);
    setCoolingErr(validateCooling(v));
  };
  const onLightTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLightTime(e.target.value);
  };
  const onLightDurChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLightDur(e.target.value);
    if (lightDurErr) setLightDurErr(validateDuration(e.target.value));
  };

  const lastLog = logs[logs.length - 1];
  const showSaveErrChrome = save.status === "error" && !lightDurErr;

  return (
    <div className={styles.app}>
      <div className={styles.scanlines} />

      {/* ─── header ───────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.brand}>HUB::TELEMETRY</span>
          <span className={styles.dim}>{versionLabel}</span>
          <span className={styles.dim}>uptime {uptime}s</span>
          <button
            className={styles.btn}
            onClick={toggleTheme}
            title={theme === "dark" ? "switch to light" : "switch to dark"}
          >
            [{theme === "dark" ? "☾ DARK" : "☀ LIGHT"}]
          </button>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.urlPrompt}>API ▸</span>
          <div className={styles.urlInputWrap}>
            <input
              className={`${styles.urlInput} ${urlErr ? styles.urlInputErr : ""}`}
              spellCheck={false}
              value={url}
              onChange={onUrlChange}
              onBlur={() => setUrlErr(validateUrl(url))}
              placeholder="https://hub.local/api"
              aria-label="API URL"
            />
            {urlErr && <span className={styles.errMsg}>! {urlErr}</span>}
          </div>
          <span className={styles.dot} data-conn={conn} aria-hidden />
          <span className={styles.connLabel} data-conn={conn}>
            [{CONN_LABEL[conn]}]
          </span>
          {conn === "live" || conn === "connecting" ? (
            <button
              className={styles.btn}
              onClick={disconnect}
              disabled={conn === "connecting"}
            >
              [DISCONNECT]
            </button>
          ) : (
            <button
              className={`${styles.btn} ${conn === "error" ? styles.btnErr : ""}`}
              onClick={connect}
            >
              [{conn === "error" ? "RETRY" : "CONNECT"}]
            </button>
          )}
        </div>
      </div>

      {/* ─── bento grid ───────────────────────────────────── */}
      <div className={styles.grid}>
        {/* ambient */}
        <section className={`${styles.box} ${styles.boxAmbient}`}>
          <span className={styles.boxTitle}>┤ ambient ├</span>
          <span
            className={styles.boxStatus}
            data-tone={cooler ? "warn" : "dim"}
          >
            ┤ {cooler ? "cooling" : "nominal"} ├
          </span>
          {(conn === "live" || conn === "idle") && hasData ? (
            <>
              <div className={styles.bigReadoutRow}>
                <span className={styles.bigReadout}>{cur.toFixed(2)}</span>
                <span className={styles.bigUnit}>°C</span>
              </div>
              <div className={styles.trend} data-cooler={cooler ? "true" : "false"}>
                {cooler ? "▲ ABOVE TRIGGER" : "▼ NOMINAL"} · Δ
                {trend >= 0 ? "+" : ""}
                {trend.toFixed(2)}
              </div>
              <div className={styles.asciiBar}>
                18°[
                {Array.from({ length: 20 }, (_, i) => (i / 20 < pct ? "█" : "·")).join("")}
                ]30°
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              {conn === "connecting" && "…awaiting feed"}
              {conn === "error" && "! feed unavailable"}
              {conn === "idle" && !hasData && "◌ no signal"}
            </div>
          )}
        </section>

        {/* cooling readout */}
        <section className={styles.box}>
          <span className={styles.boxTitle}>┤ cooling.trigger ├</span>
          <div className={styles.midReadout}>{cooling.toFixed(1)}°</div>
          <div className={styles.boxFooterDim}>SET → /settings</div>
        </section>

        {/* hi/lo */}
        <section className={styles.box}>
          <span className={styles.boxTitle}>┤ hi/lo ├</span>
          <div className={styles.hilo}>
            <div>↑ {hasData ? high.toFixed(2) : "—"}°</div>
            <div>↓ {hasData ? low.toFixed(2) : "—"}°</div>
            <div className={styles.dim}>
              Δ {hasData ? (high - low).toFixed(2) : "—"}°
            </div>
          </div>
        </section>

        {/* lights */}
        <section className={`${styles.box} ${styles.boxLights}`}>
          <span className={styles.boxTitle}>┤ lights ├</span>
          <span className={styles.boxStatus} data-tone={lightsOn ? "ink" : "dim"}>
            ┤ {lightsOn ? "on" : "idle"} ├
          </span>
          <div className={styles.lightsRow}>
            <button
              className={styles.lightToggle}
              data-on={lightsOn ? "true" : "false"}
              onClick={() => setLightsOn((v) => !v)}
              aria-label="toggle lights"
            >
              ◉
            </button>
            <div>
              <div className={styles.lightsState}>{lightsOn ? "ON" : "IDLE"}</div>
              <div className={styles.tinyDim}>
                trigger {lightTime} · for {lightDur}
              </div>
            </div>
          </div>
          <div className={styles.boxFooterDim}>─── next event @ {lightTime} ───</div>
        </section>

        {/* chart */}
        <section className={`${styles.box} ${styles.boxChart}`}>
          <span className={styles.boxTitle}>┤ graph · {points} samples ├</span>
          <span className={styles.boxStatus} data-tone={connTone(conn)}>
            ┤ {conn === "live" ? "streaming" : conn} ├
          </span>
          <div className={styles.chartContainer}>
            {(conn === "live" || conn === "idle") && visible.length > 1 ? (
              <TempChart series={visible} threshold={cooling} />
            ) : (
              <div className={styles.empty}>
                {conn === "connecting" && "…awaiting first sample"}
                {conn === "error" && "! feed error · retry to resume"}
                {(conn === "idle" || conn === "live") && visible.length <= 1 && "◌ no data"}
              </div>
            )}
          </div>
        </section>

        {/* settings.cool */}
        <section className={`${styles.box} ${styles.boxSettingsCool}`}>
          <span className={styles.boxTitle}>┤ settings.cool ├</span>
          {coolingErr && (
            <span className={styles.boxStatus} data-tone="err">┤ ! err ├</span>
          )}
          <label className={styles.label}>COOLING_TRIGGER (°C)</label>
          <input
            type="number"
            step="0.5"
            value={cooling}
            onChange={onCoolingChange}
            className={`${styles.bigInput} ${coolingErr ? styles.bigInputErr : ""}`}
          />
          {coolingErr && <span className={styles.errMsg}>! {coolingErr}</span>}
        </section>

        {/* settings.light */}
        <section className={`${styles.box} ${styles.boxSettingsLight}`}>
          <span className={styles.boxTitle}>┤ settings.light ├</span>
          <label className={styles.label}>LIGHTING_TRIGGER (HH:MM:SS)</label>
          <input
            type="time"
            step={1}
            value={lightTime}
            onChange={onLightTimeChange}
            className={styles.bigInput}
          />
        </section>

        {/* settings.dur */}
        <section className={`${styles.box} ${styles.boxSettingsDur}`}>
          <span className={styles.boxTitle}>┤ settings.dur ├</span>
          {lightDurErr && (
            <span className={styles.boxStatus} data-tone="err">┤ ! err ├</span>
          )}
          {showSaveErrChrome && (
            <span className={styles.boxStatus} data-tone="err">
              ┤ ! {save.err ?? "err"} ├
            </span>
          )}
          <label className={styles.label}>LIGHT_DURATION</label>
          <div className={styles.durRow}>
            <input
              value={lightDur}
              onChange={onLightDurChange}
              onBlur={() => setLightDurErr(validateDuration(lightDur))}
              placeholder="1h 30m"
              className={`${styles.bigInput} ${lightDurErr ? styles.bigInputErr : ""}`}
            />
            <button
              className={`${styles.btn} ${styles.btnSave} ${
                save.status === "saved" ? styles.btnPrimary : ""
              } ${save.status === "error" ? styles.btnErr : ""}`}
              disabled={save.status === "saving"}
              onClick={handleSave}
            >
              {save.status === "saving" && "[…]"}
              {save.status === "saved" && "[OK]"}
              {save.status === "error" && "[RETRY]"}
              {save.status === "idle" && "[PUT →]"}
            </button>
          </div>
          {lightDurErr && <span className={styles.errMsg}>! {lightDurErr}</span>}
        </section>
      </div>

      {/* ─── footer ───────────────────────────────────────── */}
      <div className={styles.footer}>
        <span className={styles.dim}>WINDOW [</span>
        <input
          type="range"
          min={10}
          max={240}
          value={points}
          onChange={(e) => setPoints(parseInt(e.target.value, 10))}
          className={styles.slider}
          aria-label="sample window"
        />
        <span className={styles.dim}>
          ] {String(points).padStart(3, "0")} pts · 1Hz poll
        </span>
        <span className={styles.spacer} />
        <span className={styles.lastLog}>
          {lastLog ? `> ${lastLog.msg}` : ""}
        </span>
      </div>
    </div>
  );
}
