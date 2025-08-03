const BASE_URL =
  "https://jcjmov2wp8.execute-api.ap-southeast-2.amazonaws.com/prod/graphql";
let data = [];
let chart;
let animateDuration = 1500;
let standbyChart = null;

function toggleLoadingIndicator(visible) {
  const $el = document.getElementById("loading-indicator");
  $el.style.display = visible ? "block" : "none";
}

function formatTimestampForChartAxis(rawTimestamp) {
  const date = new Date(rawTimestamp * 1000);
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  return date.getDate() + " " + months[date.getMonth()];
}

function fetchChartDataForDailyUsage() {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        const json = JSON.parse(xhr.response);
        var chartData = {
          labels: json.data.usageData.map((el) =>
            formatTimestampForChartAxis(el.timestamp)
          ),
          datasets: [
            {
              label: "Day",
              backgroundColor: "rgb(54, 162, 235)",
              data: json.data.usageData.map((el) => el.dayUse),
            },
            {
              label: "Night",
              backgroundColor: "rgb(29, 41, 81)",
              data: json.data.usageData.map((el) => el.nightUse),
            },
          ],
        };
        return resolve(chartData);
      } else {
        console.log("The request failed!");
        return reject();
      }
    };
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 31);
    const start = parseInt(startDate.getTime() / 1000);
    const end = parseInt(Date.now() / 1000);
    xhr.open("POST", BASE_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(
      JSON.stringify({
        query: `query {
          usageData(startDate: ${start}, endDate: ${end}) {
            timestamp
            dayUse
            nightUse
          }
        }`,
      })
    );
  });
}

function fetchData(since) {
  if (!since) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(yesterday.getHours() + 12);
    since = yesterday.getTime() / 1000;
  }
  since = parseInt(since);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.time("Parse JSON");
        const json = JSON.parse(xhr.response);
        console.timeEnd("Parse JSON");
        console.time("Process data");
        processData(json);
        console.timeEnd("Process data");
        return resolve();
      } else {
        console.log("The request failed!");
        return reject();
      }
    };
    xhr.open("POST", BASE_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(
      JSON.stringify({
        query: `query{ realtime(sinceTimestamp: ${since}){timestamp, reading} }`,
      })
    );
  });
}

function processData(rawData) {
  if (!rawData || !rawData.data || !rawData.data.realtime) {
    return;
  }
  for (const entry of rawData.data.realtime) {
    const date = entry.timestamp * 1000;
    if (data.length > 1 && date < data[data.length - 1][0].getTime()) {
      continue;
    }
    const watts = parseFloat(entry.reading);
    data.push([new Date(date), watts]);
  }
  if (chart) {
    chart.updateOptions({
      file: data,
    });
  }
  // Update metrics
  const $current = document.getElementById("stats-current");
  const $todayKwh = document.getElementById("stats-kwh");
  const $standbyPower = document.getElementById("stats-standby");
  const $max = document.getElementById("stats-max");
  const $lastreading = document.getElementById("last-reading");
  var utcSeconds =
    rawData.data.realtime[rawData.data.realtime.length - 1]["timestamp"];
  var d = new Date(0);
  d.setUTCSeconds(utcSeconds);
  $lastreading.innerHTML = d.toLocaleString();
  const totalKwh = calculateKWH(data);
  $current.innerHTML = data[data.length - 1][1] + " W";
  $todayKwh.innerHTML = Math.round(totalKwh * 100) / 100 + " kWh";
  const readings = data.map((el) => el[1]);
  const standbyWatts = jStat.mode(readings);
  $standbyPower.innerHTML = parseInt(standbyWatts) + " W";
  $max.innerHTML = jStat.max(readings) + " W";
  const hours =
    (data[data.length - 1][0].getTime() - data[0][0].getTime()) / 1000 / 3600;
  const standbyKwh = (standbyWatts / 1000) * hours;
  initStandbyChart({
    activePower: totalKwh - standbyKwh,
    standbyPower: standbyKwh,
  });
}

function initStandbyChart({ activePower, standbyPower }) {
  const ctx = document.getElementById("chart-standby").getContext("2d");
  if (standbyChart) {
    standbyChart.data.datasets[0].data = [activePower, standbyPower];
    standbyChart.update();
  } else {
    standbyChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Active", "Standby"],
        datasets: [
          {
            data: [activePower, standbyPower],
            backgroundColor: ["rgb(54, 162, 235)", "rgb(29, 41, 81)"],
          },
        ],
      },
      options: {
        animation: {
          duration: animateDuration,
        },
        responsive: true,
      },
    });
  }
  animateDuration = 0;
}

function calculateKWH(dataset) {
  let total = 0;
  for (let i = 0; i < dataset.length - 1; i++) {
    const current = dataset[i];
    const next = dataset[i + 1];
    const seconds = (next[0].getTime() - current[0].getTime()) / 1000;
    total += (current[1] * seconds * (1 / (60 * 60))) / 1000;
  }
  return total;
}

function getMetricsForSelectedRange(chart, initial_draw) {
  let startDate = 0;
  let endDate = Number.MAX_SAFE_INTEGER;
  if (chart.dateWindow_) {
    startDate = chart.dateWindow_[0];
    endDate = chart.dateWindow_[1];
  }
  const dataInScope = data.filter((el) => el[0] > startDate && el[0] < endDate);
  return {
    usage: calculateKWH(dataInScope),
  };
}

function updateMetricsForSelectedRange(chart, initial_draw) {
  const metrics = getMetricsForSelectedRange(chart, initial_draw);
  const $kwh = document.getElementById("usage-kwh");
  $kwh.innerHTML = parseFloat(metrics.usage).toFixed(2) + " kWh";
}

function highlightNightHours(canvas, area, chart) {
  let foundStart = false;
  let foundEnd = false;
  let startHighlight = null;
  let endHighlight = null;
  canvas.fillStyle = "#efefef";
  for (let i = 0; i < chart.file_.length; i++) {
    const entry = chart.file_[i];
    const date = entry[0];
    endHighlight = chart.toDomXCoord(date);
    if (foundStart === false && isNightTarif(date)) {
      foundStart = true;
      startHighlight = chart.toDomXCoord(date);
    }
    if (foundStart === true && isNightTarif(date) === false) {
      foundEnd = true;
    }
    if (foundStart === true && foundEnd === true) {
      const width = endHighlight - startHighlight;
      canvas.fillRect(startHighlight, area.y, width, area.h);
      foundStart = false;
      foundEnd = false;
      startHighlight = null;
      endHighlight = null;
    }
    i += 30;
  }
  if (foundStart && foundEnd === false) {
    const lastPosition = chart.toDomXCoord(
      chart.file_[chart.file_.length - 1][0]
    );
    const width = lastPosition - startHighlight;
    canvas.fillRect(startHighlight, area.y, width, area.h);
  }
}

function isNightTarif(dateObj) {
  if (
    (dateObj.getHours() >= 21 && dateObj.getHours() <= 23) ||
    (dateObj.getHours() >= 0 && dateObj.getHours() <= 5)
  ) {
    return true;
  }
  if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
    return true;
  }
  return false;
}

async function initUsageChart() {
  const chartdata = await fetchChartDataForDailyUsage();
  var ctx = document.getElementById("canvas").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: chartdata,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        xAxes: [
          {
            stacked: true,
          },
        ],
        yAxes: [
          {
            stacked: true,
          },
        ],
      },
    },
  });
}

async function initChart() {
  await fetchData();

  // กำหนด interactionModel สำหรับซูมด้วย mouse wheel แนวนอน
  const customInteractionModel = Object.assign({}, Dygraph.defaultInteractionModel);

  customInteractionModel.wheel = function (event, g, context) {
    event.preventDefault();
    const range = g.xAxisRange();
    const mouseX = Dygraph.pageX(event);
    const chartLeft = g.graphDiv.getBoundingClientRect().left;
    const mouseGraphX = g.toDataXCoord(mouseX - chartLeft);
    const zoomFactor = 0.1;

    let [minX, maxX] = range;
    let newMin, newMax;

    if (event.deltaY < 0) {
      // zoom in
      newMin = mouseGraphX - (mouseGraphX - minX) * (1 - zoomFactor);
      newMax = mouseGraphX + (maxX - mouseGraphX) * (1 - zoomFactor);
    } else {
      // zoom out
      newMin = mouseGraphX - (mouseGraphX - minX) * (1 + zoomFactor);
      newMax = mouseGraphX + (maxX - mouseGraphX) * (1 + zoomFactor);
    }

    if (newMax - newMin < 1000) return; // ช่วงเล็กเกินไป

    g.updateOptions({ dateWindow: [newMin, newMax] });
  };

  chart = new Dygraph(document.getElementById("graphdiv"), data, {
    labels: ["Timestamp", "Watts"],
    legend: "always",
    valueRange: [0, 20], // ล็อก Y-axis 0-8
    underlayCallback: highlightNightHours,
    drawCallback: updateMetricsForSelectedRange,
    showRoller: true,
    rollPeriod: 14,
    animatedZooms: true,
    interactionModel: customInteractionModel,
  });

  document.getElementById("btnYesterday").addEventListener("click", () => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    chart.updateOptions({ dateWindow: [start.getTime(), start.getTime() + 86400000] });
  });

  document.getElementById("btnToday").addEventListener("click", () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    chart.updateOptions({ dateWindow: [start.getTime(), start.getTime() + 86400000] });
  });

  document.getElementById("btnResetZoom").addEventListener("click", () => {
    chart.updateOptions({ dateWindow: null });
  });

  setInterval(async () => {
    await fetchData(data[data.length - 1][0].getTime() / 1000);
  }, 30000);
}
