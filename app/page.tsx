"use client";
// import Image from 'next/image'
import { ChangeEvent, FormEvent, useState, useEffect, useRef } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";
// import type { ChartData, ChartOptions } from 'chart.js';

import { Line } from "react-chartjs-2";
import styles from "./page.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function Home() {
  const [apiUrl, setApiUrl] = useState("");
  const [userTemp, setUserTemp] = useState(0);
  const [userLight, setUserLight] = useState("18:00:00");
  const [lightDuration, setLightDuration] = useState("1h");
  const [isSunset, setIsSunset] = useState(false);
  const [data, setData] = useState([]);
  const [plotCount, setPlotCount] = useState(10);

  type PointType = {
    temperature: number;
    presence: boolean;
    datetime: string;
  };

  function useInterval(callback: Function, delay: number) {
    const savedCallback = useRef<typeof callback>();

    // Remember the latest callback.
    useEffect(() => {
      savedCallback.current = callback;
    }, [callback]);

    // Set up the interval.
    useEffect(() => {
      function tick() {
        savedCallback.current?.();
      }
      if (delay !== null) {
        let id = setInterval(tick, delay);
        return () => clearInterval(id);
      }
    }, [delay]);
  }

  const handlePlotCountChange = async (e: ChangeEvent<HTMLInputElement>) => {
    let plotCountValue = parseInt(e.target.value);
    // console.log(plotCountValue);
    setPlotCount(plotCountValue);
    // console.log(plotCount)
    // await getData();
  };

  const handleSetAPIUrl = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    localStorage.setItem("api_url", apiUrl);
    getData();
  };

  const handleChangeAPIUrl = (e: ChangeEvent<HTMLInputElement>) => {
    setApiUrl(e.target.value);
  };

  const handleChangeTemp = (e: ChangeEvent<HTMLInputElement>) => {
    let tempInputValue = parseInt(e.target.value);
    setUserTemp(tempInputValue);
  };

  const handleChangeLight = (e: ChangeEvent<HTMLInputElement>) => {
    let lightInputValue = e.target.value;
    setUserLight(lightInputValue);
  };

  const handleChangeLightDuration = (e: ChangeEvent<HTMLInputElement>) => {
    let lightDurationInputValue = e.target.value;
    setLightDuration(lightDurationInputValue);
  };

  const handleChangeIsSunset = () => {
    setIsSunset((isSunset) => !isSunset);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let body = {
      user_temp: userTemp,
      user_light: isSunset ? "sunset" : userLight,
      light_duration: lightDuration,
    };
    console.log(body);
    let api_url = localStorage.getItem("api_url");

    if (api_url != null) {
      fetch(api_url + "/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else {
      alert("API URL has not been set.");
    }
  };

  const getData = async () => {
    let api_url = localStorage.getItem("api_url");
    if (!api_url) {
      return;
    }
    // let api_url = apiUrl;
    setPlotCount((prev) => prev);
    let response = await fetch(api_url + "/graph?size=" + plotCount);
    let raw_data = await response.json();
    setData(await raw_data.map((point: PointType) => ({ x: point.datetime, y: point.temperature })));
  };
  // useEffect(() => {
  //   if (!localStorage.getItem("api_url")) {
  //     localStorage.setItem("api_url", apiUrl);
  //   } else {
  //     // setApiUrl(localStorage.getItem("api_url"));
  //     const interval = setInterval(() => {
  //       getData();
  //     }, 1000);
  //     return () => clearInterval(interval);
  //   }
  // }, []);

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
        display: true,
        text: "Graph showing ambient temperature over time",
      },
    },
  };

  return (
    <>
      <div className={styles["card"]}>
        <form className={styles["api-card-form"]} onSubmit={handleSetAPIUrl}>
          <div className={styles["input"]}>
            <input type="text" className={styles["input-field"]} onChange={handleChangeAPIUrl} value={apiUrl} required />
            <label className={styles["input-label"]}>API URL (eg. https://your-iot-api.com)</label>
          </div>
          <div className={styles["action"]}>
            <button className={styles["action-button"]}>Set</button>
          </div>
        </form>
      </div>
      <div className={styles["container"]}>
        <div className={styles["card"]}>
          <div className={styles["card-image"]}>
            <h2 className={styles["card-heading"]}>
              Get started
              <small>Let&apos;s set up our smart home</small>
            </h2>
          </div>
          <div className={styles["card-info"]}>
            <p>Set your smart hub settings here</p>
          </div>
          <form className={styles["card-form"]} onSubmit={handleSubmit}>
            <div className={styles["input"]}>
              <input type="number" className={styles["input-field"]} onChange={handleChangeTemp} value={userTemp} required />
              <label className={styles["input-label"]}>Cooling trigger (&deg;C)</label>
            </div>

            <div className={styles["input-light"]}>
              <input disabled={isSunset} type="time" step={"1"} className={styles["input-field"]} onChange={handleChangeLight} value={userLight} required />
              <label className={styles["input-label"]}>Lighting trigger</label>
              <div>
                <input type="checkbox" onChange={handleChangeIsSunset} defaultChecked={false} />
                <span> Sunset</span>
              </div>
            </div>

            <div className={styles["input"]}>
              <input
                type="text"
                className={styles["input-field"]}
                onChange={handleChangeLightDuration}
                value={lightDuration}
                required
                pattern="^(?=\d+[ywdhms])(( ?\d+y)?(?!\d))?(( ?\d+w)?(?!\d))?(( ?\d+d)?(?!\d))?(( ?\d+h)?(?!\d))?(( ?\d+m)?(?!\d))?(( ?\d+s)?(?!\d))?( ?\d+ms)?$"
              />
              <label className={styles["input-label"]}>Light Duration (eg. 1h, 30m, 40s)</label>
            </div>
            <div className={styles["action"]}>
              <button className={styles["action-button"]}>Submit</button>
            </div>
          </form>
        </div>

        <div className={styles["chart-section"]}>
          {
            <Line
              options={chart_options}
              data={{
                datasets: [
                  {
                    label: "Temperature",
                    data: data,
                    borderColor: "rgb(255, 99, 132)",
                    backgroundColor: "rgba(255, 99, 132, 0.5)",
                  },
                ],
              }}
            />
          }
          <div>
            <input type="range" step={5} name="vol" min="0" max="50" onChange={handlePlotCountChange} value={plotCount} />
            <span>{plotCount}</span>
          </div>
        </div>
      </div>
    </>
  );
}
