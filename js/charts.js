// Tiny SVG charts: single-series line and bar, with tap/hover tooltips.

const W = 340, H = 180, PAD = { l: 38, r: 10, t: 12, b: 24 };

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = (n * step) / span;
  const s = err <= 0.15 ? step * 10 : err <= 0.35 ? step * 5 : err <= 0.75 ? step * 2 : step;
  const lo = Math.floor(min / s) * s, hi = Math.ceil(max / s) * s;
  const out = [];
  for (let v = lo; v <= hi + 1e-9; v += s) out.push(+v.toFixed(6));
  return out;
}

const fmt = (v) => (Math.abs(v) >= 10000 ? (v / 1000).toFixed(0) + "k" : Math.round(v).toLocaleString());
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

function frame(ticks, y) {
  return ticks.map((t) =>
    `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="ch-grid"/>` +
    `<text x="${PAD.l - 6}" y="${y(t) + 4}" class="ch-axis" text-anchor="end">${fmt(t)}</text>`
  ).join("");
}

// points: [{x: 'YYYY-MM-DD', y: number, label?: string}]
export function lineChart(el, points, { unit = "" } = {}) {
  if (!points.length) { el.innerHTML = `<div class="empty small">No data yet</div>`; return; }
  const xs = points.map((p) => new Date(p.x + "T00:00:00").getTime());
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const ylo = ticks[0], yhi = ticks[ticks.length - 1];
  const x = (t) => x1 === x0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - ylo) / (yhi - ylo)) * (H - PAD.t - PAD.b);
  const pts = points.map((p, i) => [x(xs[i]), y(p.y)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  el.innerHTML = `
    <div class="ch-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
        ${frame(ticks, y)}
        <text x="${PAD.l}" y="${H - 6}" class="ch-axis">${shortDate(points[0].x)}</text>
        <text x="${W - PAD.r}" y="${H - 6}" class="ch-axis" text-anchor="end">${shortDate(points[points.length - 1].x)}</text>
        <path d="${path}" class="ch-line"/>
        ${points.length < 40 ? pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" class="ch-dot"/>`).join("") : ""}
        <circle cx="${last[0]}" cy="${last[1]}" r="4.5" class="ch-dot ch-dot-last"/>
        <line class="ch-cross" y1="${PAD.t}" y2="${H - PAD.b}" style="display:none"/>
        <circle class="ch-hover" r="5" style="display:none"/>
        <rect x="${PAD.l}" y="0" width="${W - PAD.l - PAD.r}" height="${H}" fill="transparent" class="ch-hit"/>
      </svg>
      <div class="ch-tip" style="display:none"></div>
    </div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".ch-tip");
  const cross = el.querySelector(".ch-cross"), dot = el.querySelector(".ch-hover");
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[best][0] - px)) best = i; });
    const [cx, cy] = pts[best];
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.style.display = "";
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.style.display = "";
    const p = points[best];
    tip.innerHTML = `<b>${fmt(p.y)} ${unit}</b><span>${shortDate(p.x)}${p.label ? " · " + p.label : ""}</span>`;
    tip.style.display = "";
    const left = (cx / W) * r.width;
    tip.style.left = Math.min(Math.max(left, 60), r.width - 60) + "px";
  };
  const hide = () => { tip.style.display = cross.style.display = dot.style.display = "none"; };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", hide);
}

// bars: [{label: string, y: number, tip: string}]
export function barChart(el, bars, { unit = "" } = {}) {
  if (!bars.some((b) => b.y > 0)) { el.innerHTML = `<div class="empty small">No data yet</div>`; return; }
  const ticks = niceTicks(0, Math.max(...bars.map((b) => b.y)));
  const yhi = ticks[ticks.length - 1];
  const y = (v) => PAD.t + (1 - v / yhi) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.max(4, slot - 4);
  const rects = bars.map((b, i) => {
    const x = PAD.l + i * slot + (slot - bw) / 2;
    const top = y(b.y), base = y(0);
    const h = Math.max(0, base - top);
    const r = Math.min(4, h, bw / 2);
    const d = h <= 0 ? "" : `M${x} ${base} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${base} Z`;
    return `<path d="${d}" class="ch-bar" data-i="${i}"/>` +
      `<rect x="${PAD.l + i * slot}" y="${PAD.t}" width="${slot}" height="${H - PAD.t - PAD.b}" fill="transparent" data-i="${i}" class="ch-hit"/>`;
  }).join("");
  el.innerHTML = `
    <div class="ch-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
        ${frame(ticks, y)}
        <text x="${PAD.l}" y="${H - 6}" class="ch-axis">${bars[0].label}</text>
        <text x="${W - PAD.r}" y="${H - 6}" class="ch-axis" text-anchor="end">${bars[bars.length - 1].label}</text>
        ${rects}
      </svg>
      <div class="ch-tip" style="display:none"></div>
    </div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".ch-tip");
  const show = (ev) => {
    const i = ev.target.dataset && ev.target.dataset.i;
    if (i == null) return;
    const b = bars[i];
    el.querySelectorAll(".ch-bar").forEach((p) => p.classList.toggle("dim", p.dataset.i !== i));
    tip.innerHTML = `<b>${fmt(b.y)} ${unit}</b><span>${b.tip}</span>`;
    tip.style.display = "";
    const r = svg.getBoundingClientRect();
    const left = ((PAD.l + (Number(i) + 0.5) * slot) / W) * r.width;
    tip.style.left = Math.min(Math.max(left, 60), r.width - 60) + "px";
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", () => {
    tip.style.display = "none";
    el.querySelectorAll(".ch-bar").forEach((p) => p.classList.remove("dim"));
  });
}
