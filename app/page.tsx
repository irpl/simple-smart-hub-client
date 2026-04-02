"use client";
import { ChangeEvent, FormEvent, useState, useEffect, useRef, useCallback } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import styles from "./page.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type PointType = {
  temperature: number;
  presence: boolean;
  datetime: string;
};

type ChartPoint = {
  x: string;
  y: number;
};

function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}

export default function Home() {
  const [apiUrl, setApiUrl] = useState("");
  const [userTemp, setUserTemp] = useState(0);
  const [userLight, setUserLight] = useState("18:00:00");
  const [lightDuration, setLightDuration] = useState("1h");

  const [data, setData] = useState<ChartPoint[]>([]);
  const [plotCount, setPlotCount] = useState(10);

  const plotCountRef = useRef(plotCount);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    plotCountRef.current = plotCount;
  }, [plotCount]);

  const handlePlotCountChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPlotCount(parseInt(e.target.value));
  };

  const handleSetAPIUrl = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    localStorage.setItem("api_url", apiUrl);
  };

  const handleChangeAPIUrl = (e: ChangeEvent<HTMLInputElement>) => {
    setApiUrl(e.target.value);
  };

  const handleChangeTemp = (e: ChangeEvent<HTMLInputElement>) => {
    setUserTemp(parseInt(e.target.value));
  };

  const handleChangeLight = (e: ChangeEvent<HTMLInputElement>) => {
    setUserLight(e.target.value);
  };

  const handleChangeLightDuration = (e: ChangeEvent<HTMLInputElement>) => {
    setLightDuration(e.target.value);
  };


  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = {
      user_temp: userTemp,
      user_light: userLight,
      light_duration: lightDuration,
    };
    const api_url = localStorage.getItem("api_url");

    if (api_url != null) {
      fetch(api_url + "/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }).catch(() => {
        alert("Failed to update settings. Check your API URL and connection.");
      });
    } else {
      alert("API URL has not been set.");
    }
  };

  const getData = useCallback(async () => {
    const api_url = localStorage.getItem("api_url");
    if (!api_url || isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    try {
      const response = await fetch(api_url + "/graph?size=" + plotCountRef.current);
      const raw_data = await response.json();
      setData(raw_data.map((point: PointType) => ({ x: point.datetime, y: point.temperature })));
    } catch {
      // Silently skip failed poll — will retry on next interval
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useInterval(() => {
    getData();
  }, 1000);

  const chart_options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(0,0,0,0.04)" },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.04)" },
      },
    },
  };

  return (
    <div className={styles.page}>
      <header className={styles["page-header"]}>
        <h1 className={styles["page-title"]}>Smart Home Hub</h1>
        <p className={styles["page-subtitle"]}>Monitor and control your smart home devices</p>
      </header>

      <form className={styles["api-bar"]} onSubmit={handleSetAPIUrl}>
        <span className={styles["api-bar-label"]}>API</span>
        <input
          type="text"
          className={styles["api-bar-input"]}
          onChange={handleChangeAPIUrl}
          value={apiUrl}
          placeholder="https://your-iot-api.com"
          required
        />
        <button className={styles["api-bar-btn"]}>Connect</button>
      </form>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles["card-header"]}>
            <h2 className={styles["card-header-title"]}>Settings</h2>
            <p className={styles["card-header-sub"]}>Configure your smart hub preferences</p>
          </div>
          <div className={styles["card-body"]}>
            <form onSubmit={handleSubmit}>
              <div className={styles["form-group"]}>
                <label className={styles["form-label"]}>Cooling trigger (&deg;C)</label>
                <input
                  type="number"
                  className={styles["form-input"]}
                  onChange={handleChangeTemp}
                  value={userTemp}
                  required
                />
              </div>

              <div className={styles["form-group"]}>
                <label className={styles["form-label"]}>Lighting trigger</label>
                <input
                  type="time"
                  step="1"
                  className={styles["form-input"]}
                  onChange={handleChangeLight}
                  value={userLight}
                  required
                />
              </div>

              <div className={styles["form-group"]}>
                <label className={styles["form-label"]}>Light duration</label>
                <input
                  type="text"
                  className={styles["form-input"]}
                  onChange={handleChangeLightDuration}
                  value={lightDuration}
                  required
                  placeholder="e.g. 1h, 30m, 40s"
                  pattern="^(?=\d+[ywdhms])(( ?\d+y)?(?!\d))?(( ?\d+w)?(?!\d))?(( ?\d+d)?(?!\d))?(( ?\d+h)?(?!\d))?(( ?\d+m)?(?!\d))?(( ?\d+s)?(?!\d))?( ?\d+ms)?$"
                />
              </div>

              <button type="submit" className={styles["submit-btn"]}>
                Save Settings
              </button>
            </form>
          </div>
        </div>

        <div className={styles["chart-card"]}>
          <h3 className={styles["chart-title"]}>Ambient Temperature</h3>
          <div className={styles["chart-wrap"]}>
            <Line
              options={chart_options}
              data={{
                datasets: [
                  {
                    label: "Temperature",
                    data: data,
                    borderColor: "#6658d3",
                    backgroundColor: "rgba(102, 88, 211, 0.1)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "#6658d3",
                  },
                ],
              }}
            />
          </div>
          <div className={styles["slider-row"]}>
            <span className={styles["slider-label"]}>Data points</span>
            <input
              type="range"
              step={5}
              min="0"
              max="50"
              onChange={handlePlotCountChange}
              value={plotCount}
              className={styles.slider}
            />
            <span className={styles["slider-value"]}>{plotCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
