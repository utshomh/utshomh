import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROFILE_USERNAME = process.env.PROFILE_USERNAME || "utshomh";
const EXTRA_GITHUB_USERS = (
  process.env.EXTRA_GITHUB_USERS || "utshowmh,mahadyhassanutsho,utsho-fleekbd"
)
  .split(",")
  .map((user) => user.trim())
  .filter(Boolean);
const USERS = [...new Set([PROFILE_USERNAME, ...EXTRA_GITHUB_USERS])];
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const OUT_DIR = process.env.PROFILE_CARD_OUT_DIR || "assets";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK !== "false";
const WRITE_README_SNIPPET = process.env.WRITE_README_SNIPPET !== "false";

const PALETTE = {
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Rust: "#DEA584",
  Go: "#00ADD8",
  Python: "#3572A5",
  Shell: "#89E051",
  HTML: "#E34C26",
  CSS: "#663399",
  Lua: "#000080",
  Dockerfile: "#384D54",
  Vue: "#41B883",
  MDX: "#F9AC00",
  Svelte: "#FF3E00",
  PHP: "#4F5D95",
  Java: "#B07219",
  C: "#555555",
  "C++": "#F34B7D",
  CSharp: "#178600",
  Ruby: "#701516",
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function trimText(value, max = 64) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function fmtNumber(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function todayUTC() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function githubHeaders(extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${PROFILE_USERNAME}-profile-readme-card-generator`,
    ...extra,
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}\n${url}\n${body.slice(0, 300)}`,
    );
  }
  return response.json();
}

async function fetchAllPages(firstUrl) {
  const results = [];
  let url = firstUrl;
  while (url) {
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API request failed: ${response.status} ${response.statusText}\n${url}\n${body.slice(0, 300)}`,
      );
    }
    const page = await response.json();
    results.push(...page);
    const link = response.headers.get("link") || "";
    const next = link
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.endsWith('rel="next"'));
    url = next ? next.match(/<([^>]+)>/)?.[1] : null;
  }
  return results;
}

async function fetchContributionCalendar(login) {
  if (!TOKEN) return null;
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }
  `;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: githubHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!response.ok) return null;
  const json = await response.json();
  const calendar =
    json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) return null;

  const days = calendar.weeks
    .flatMap((week) => week.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0;
  let run = 0;
  for (const day of days) {
    if (day.contributionCount > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let end = days.length - 1;
  if (end >= 0 && days[end].contributionCount === 0) end -= 1;

  let current = 0;
  for (let i = end; i >= 0; i -= 1) {
    if (days[i].contributionCount > 0) current += 1;
    else break;
  }

  const activeDays = days.filter((day) => day.contributionCount > 0).length;
  const lastActive =
    [...days].reverse().find((day) => day.contributionCount > 0)?.date ||
    "No activity yet";

  return {
    current,
    longest,
    activeDays,
    totalContributions: calendar.totalContributions,
    lastActive,
  };
}

function fallbackData(errorMessage = "") {
  return {
    profiles: [{ login: PROFILE_USERNAME, followers: 0 }],
    repos: Array.from({ length: 53 }, (_, i) => ({
      full_name: i === 0 ? "utsho-fleekbd/onecomm-api" : `repo-${i}`,
      updated_at: new Date().toISOString(),
      stargazers_count: i < 22 ? 1 : 0,
      forks_count: i < 4 ? 1 : 0,
    })),
    totalStars: 22,
    totalForks: 4,
    topLanguages: [
      { name: "TypeScript", pct: 36, color: PALETTE.TypeScript },
      { name: "JavaScript", pct: 25, color: PALETTE.JavaScript },
      { name: "Rust", pct: 21, color: PALETTE.Rust },
      { name: "Shell", pct: 5, color: PALETTE.Shell },
      { name: "Go", pct: 4, color: PALETTE.Go },
      { name: "HTML", pct: 4, color: PALETTE.HTML },
      { name: "CSS", pct: 3, color: PALETTE.CSS },
      { name: "Lua", pct: 2, color: PALETTE.Lua },
    ],
    latestRepo: {
      full_name: "utsho-fleekbd/onecomm-api",
      updated_at: new Date().toISOString(),
    },
    contribution: {
      current: 0,
      longest: 0,
      activeDays: 0,
      totalContributions: 0,
      lastActive: "after workflow run",
    },
    updated: todayUTC(),
    fallback: true,
    errorMessage,
  };
}

function normalizeLanguagePercents(entries, totalBytes) {
  if (!entries.length || !totalBytes) return [];

  const raw = entries.map(([name, bytes]) => ({
    name,
    bytes,
    exact: (bytes / totalBytes) * 100,
  }));
  const rounded = raw.map((lang) => ({
    ...lang,
    pct: Math.max(1, Math.floor(lang.exact)),
  }));

  let remainder = Math.max(
    0,
    100 - rounded.reduce((sum, lang) => sum + lang.pct, 0),
  );
  for (const lang of rounded.sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (remainder <= 0) break;
    lang.pct += 1;
    remainder -= 1;
  }

  return rounded
    .sort((a, b) => b.bytes - a.bytes)
    .map(({ name, bytes, pct }) => ({
      name,
      bytes,
      pct,
      color: PALETTE[name] || "#8B949E",
    }));
}

async function collectData() {
  const profiles = [];
  const repos = [];
  const languages = new Map();

  for (const user of USERS) {
    const profile = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(user)}`,
    );
    profiles.push(profile);
    const userRepos = await fetchAllPages(
      `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&type=owner&sort=updated`,
    );

    for (const repo of userRepos) {
      if (repo.private || repo.fork) continue;
      repos.push({ ...repo, owner_login: user });
      try {
        const repoLangs = await fetchJson(repo.languages_url);
        for (const [language, bytes] of Object.entries(repoLangs)) {
          languages.set(
            language,
            (languages.get(language) || 0) + Number(bytes || 0),
          );
        }
      } catch (error) {
        console.warn(
          `Could not fetch languages for ${repo.full_name}: ${error.message}`,
        );
      }
    }
  }

  const languageTotal = [...languages.values()].reduce(
    (sum, bytes) => sum + bytes,
    0,
  );
  const topLanguages = normalizeLanguagePercents(
    [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    languageTotal,
  );

  const latestRepo =
    repos
      .slice()
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0] ||
    null;
  const contribution = await fetchContributionCalendar(PROFILE_USERNAME);

  return {
    profiles,
    repos,
    totalStars: repos.reduce(
      (sum, repo) => sum + Number(repo.stargazers_count || 0),
      0,
    ),
    totalForks: repos.reduce(
      (sum, repo) => sum + Number(repo.forks_count || 0),
      0,
    ),
    topLanguages,
    latestRepo,
    contribution: contribution || fallbackData().contribution,
    updated: todayUTC(),
    fallback: false,
  };
}

const animatedStyle = `
<style>
  * { box-sizing: border-box; }
  .font { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
  .mono { font-family: "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  .float { animation: float 7s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
  .float2 { animation: float 9s ease-in-out infinite reverse; transform-origin: center; transform-box: fill-box; }
  .pulse { animation: pulse 2.4s ease-in-out infinite; }
  .twinkle { animation: twinkle 2.8s ease-in-out infinite; }
  .dash { stroke-dasharray: 14 18; animation: dash 18s linear infinite; }
  .draw { stroke-dasharray: 780; stroke-dashoffset: 780; animation: draw 2.4s ease-out forwards, dash 16s linear infinite 2.4s; }
  .fadeUp { animation: fadeUp .82s cubic-bezier(.2,.8,.2,1) both; }
  .delay1 { animation-delay: .08s; }
  .delay2 { animation-delay: .16s; }
  .delay3 { animation-delay: .24s; }
  .delay4 { animation-delay: .32s; }
  .delay5 { animation-delay: .40s; }
  .delay6 { animation-delay: .48s; }
  .delay7 { animation-delay: .56s; }
  .scan { animation: scan 4.8s ease-in-out infinite; }
  .barGlow { animation: glowPulse 3.4s ease-in-out infinite; }
  .tilt { animation: tilt 10s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
  @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
  @keyframes pulse { 0%,100% { opacity: .32; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.08); } }
  @keyframes twinkle { 0%,100% { opacity: .25; } 45% { opacity: .95; } }
  @keyframes dash { to { stroke-dashoffset: -280; } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes scan { 0% { transform: translateX(-240px); opacity: 0; } 14% { opacity: .28; } 54% { opacity: .12; } 100% { transform: translateX(980px); opacity: 0; } }
  @keyframes glowPulse { 0%,100% { opacity: .66; } 50% { opacity: 1; } }
  @keyframes tilt { 0%,100% { transform: rotate(-1deg); } 50% { transform: rotate(1.2deg); } }
  @media (prefers-reduced-motion: reduce) {
    .float, .float2, .pulse, .twinkle, .dash, .draw, .fadeUp, .scan, .barGlow, .tilt { animation: none !important; }
  }
</style>`;

function svgShell({
  id,
  width,
  height,
  title,
  desc,
  children,
  extraDefs = "",
}) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${esc(title)}</title>
<desc id="${id}-desc">${esc(desc)}</desc>
<defs>
  <clipPath id="${id}-outerClip"><rect width="${width}" height="${height}" rx="34"/></clipPath>
  <clipPath id="${id}-panelClip"><rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="30"/></clipPath>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse"><stop stop-color="#07101F"/><stop offset="0.48" stop-color="#101B36"/><stop offset="1" stop-color="#27113F"/></linearGradient>
  <linearGradient id="${id}-neon" x1="42" y1="20" x2="${width - 42}" y2="${height - 20}" gradientUnits="userSpaceOnUse"><stop stop-color="#22D3EE"/><stop offset="0.45" stop-color="#7C3AED"/><stop offset="1" stop-color="#00FF88"/></linearGradient>
  <linearGradient id="${id}-fire" x1="90" y1="40" x2="${width - 90}" y2="${height - 40}" gradientUnits="userSpaceOnUse"><stop stop-color="#FBBF24"/><stop offset="0.48" stop-color="#FF6B6B"/><stop offset="1" stop-color="#A855F7"/></linearGradient>
  <linearGradient id="${id}-glass" x1="24" y1="24" x2="${width - 24}" y2="${height - 24}" gradientUnits="userSpaceOnUse"><stop stop-color="#111827" stop-opacity="0.96"/><stop offset="1" stop-color="#0B1020" stop-opacity="0.92"/></linearGradient>
  <linearGradient id="${id}-shine" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
  <filter id="${id}-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.48"/></filter>
  <filter id="${id}-glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  ${extraDefs}
</defs>
${animatedStyle}
<g clip-path="url(#${id}-outerClip)">
  ${children}
</g>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="33" stroke="#2D3A58" stroke-opacity="0.84"/>
</svg>`;
}

function panel(id, width, height, meshPath, accent = "neon") {
  const gradient = accent === "fire" ? `${id}-fire` : `${id}-neon`;
  return `<rect width="${width}" height="${height}" rx="34" fill="url(#${id}-bg)"/>
<g clip-path="url(#${id}-panelClip)">
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="30" fill="url(#${id}-glass)" filter="url(#${id}-shadow)"/>
  <path class="tilt" d="${meshPath}" fill="url(#${gradient})" opacity="0.22"/>
  <circle class="float" cx="${width - 110}" cy="88" r="96" fill="#22D3EE" opacity="0.11"/>
  <circle class="float2" cx="116" cy="${height - 72}" r="122" fill="#A855F7" opacity="0.12"/>
  <rect class="scan" x="-260" y="24" width="180" height="${height - 48}" fill="url(#${id}-shine)" opacity="0.24" transform="skewX(-18)"/>
  <g opacity="0.5">
    ${sparkles(id, width, height)}
  </g>
</g>
<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="30" stroke="#2B3856" stroke-opacity="0.95"/>`;
}

function sparkles(id, width, height) {
  const points = [
    [78, 132, 2.0],
    [width - 82, 150, 1.8],
    [width - 168, height - 94, 2.4],
    [158, height - 138, 1.7],
    [width * 0.48, 78, 1.6],
    [width * 0.56, height - 64, 2.0],
  ];
  return points
    .map(
      ([cx, cy, r], i) =>
        `<circle class="twinkle" style="animation-delay:${(i * 0.37).toFixed(2)}s" cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="${r}" fill="${i % 2 ? "#00FF88" : "#22D3EE"}"/>`,
    )
    .join("\n");
}

function metricCard({ x, y, w, h, label, value, color, number, delay = 0 }) {
  const delayClass = `delay${Math.min(7, Math.max(0, delay))}`;
  return `<g class="fadeUp ${delayClass}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#121A2A" stroke="#2A3753"/>
  <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="21" fill="url(#statGloss)" opacity="0.26"/>
  <path d="M${x + 18} ${y + h - 14}H${x + w - 18}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.58"/>
  <circle class="pulse" cx="${x + w - 24}" cy="${y + 25}" r="5" fill="${color}"/>
  <text class="font" x="${x + 20}" y="${y + 30}" fill="#8B949E" font-size="12" font-weight="800" letter-spacing="0.8">${esc(label)}</text>
  <text class="font" x="${x + 20}" y="${y + 70}" fill="${color}" font-size="34" font-weight="900">${esc(value)}</text>
  <text class="font" x="${x + w - 54}" y="${y + 71}" fill="#26324A" font-size="30" font-weight="900">${esc(number)}</text>
</g>`;
}

function smallStat({
  x,
  y,
  w = 158,
  h = 76,
  label,
  value,
  color,
  valueSize = 23,
  delay = 0,
}) {
  const delayClass = `delay${Math.min(7, Math.max(0, delay))}`;
  return `<g class="fadeUp ${delayClass}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#121A2A" stroke="#2A3753"/>
  <path d="M${x + 16} ${y + h - 13}H${x + w - 16}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.54"/>
  <text class="font" x="${x + 18}" y="${y + 28}" fill="#8B949E" font-size="11" font-weight="800" letter-spacing="0.8">${esc(label)}</text>
  <text class="font" x="${x + 18}" y="${y + 58}" fill="${color}" font-size="${valueSize}" font-weight="900">${esc(value)}</text>
</g>`;
}

function githubPulseSvg(data) {
  const id = "pulse";
  const width = 760;
  const height = 520;
  const publicRepos = data.repos.length;
  const spaces = USERS.length;
  const latest = trimText(data.latestRepo?.full_name || "No repo data", 52);
  const focus = trimText(
    data.topLanguages
      .slice(0, 4)
      .map((lang) => lang.name)
      .join(" · ") || "Backend · Systems · Rust",
    50,
  );
  const subtitle = trimText(
    `${USERS.map((u) => `@${u}`).join(" + ")} · ${data.fallback ? "fallback" : "live"} local SVG · ${data.updated}`,
    78,
  );
  const note = data.fallback
    ? "Workflow will recalculate live repo metrics after the next run."
    : `Latest public update: ${latest}`;

  const extraDefs = `<linearGradient id="statGloss" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF" stop-opacity="0.08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`;
  const mesh = `M0 356C96 252 178 326 273 232C370 136 464 190 544 106C635 11 692 80 760 40V520H0V356Z`;

  const children = `${panel(id, width, height, mesh)}
<path class="draw" d="M62 386C132 302 208 352 280 290C355 225 438 246 496 181C574 94 643 156 704 92" stroke="url(#${id}-neon)" stroke-width="4" stroke-linecap="round" opacity="0.82" filter="url(#${id}-glow)"/>
<g class="font">
  <text x="56" y="80" fill="#E6EDF3" font-size="34" font-weight="950">GitHub pulse</text>
  <text class="mono" x="58" y="110" fill="#9CA3AF" font-size="13">${esc(subtitle)}</text>
  ${metricCard({ x: 56, y: 138, w: 306, h: 92, label: "PUBLIC REPOS", value: fmtNumber(publicRepos), color: "#22D3EE", number: "01", delay: 1 })}
  ${metricCard({ x: 398, y: 138, w: 306, h: 92, label: "TOTAL STARS", value: fmtNumber(data.totalStars), color: "#A855F7", number: "02", delay: 2 })}
  ${metricCard({ x: 56, y: 250, w: 306, h: 92, label: "TOTAL FORKS", value: fmtNumber(data.totalForks), color: "#FBBF24", number: "03", delay: 3 })}
  ${metricCard({ x: 398, y: 250, w: 306, h: 92, label: "GITHUB SPACES", value: fmtNumber(spaces), color: "#00FF88", number: "04", delay: 4 })}
  <g class="fadeUp delay5">
    <rect x="56" y="370" width="648" height="94" rx="24" fill="#111827" stroke="#303B55"/>
    <circle class="pulse" cx="84" cy="405" r="7" fill="#00FF88"/>
    <text x="106" y="401" fill="#C9D1D9" font-size="13" font-weight="900" letter-spacing="1">SHIP MODE</text>
    <text x="106" y="426" fill="#E6EDF3" font-size="17" font-weight="800">${esc(focus)} · backend APIs · VPS/server work</text>
    <text class="mono" x="106" y="447" fill="#8B949E" font-size="11">${esc(trimText(note, 82))}</text>
  </g>
</g>`;

  return svgShell({
    id,
    width,
    height,
    title: `GitHub pulse for ${PROFILE_USERNAME}`,
    desc: "Animated local SVG card with public GitHub profile statistics, clipped rounded backgrounds, and a mobile-safe stat grid.",
    children,
    extraDefs,
  });
}

function languageRow(lang, index) {
  const x = 62;
  const y = 138 + index * 44;
  const trackWidth = 636;
  const barWidth = Math.max(12, Math.round((trackWidth * lang.pct) / 100));
  const duration = (0.72 + index * 0.08).toFixed(2);
  return `<g class="fadeUp delay${Math.min(index + 1, 7)} font">
  <text x="${x}" y="${y}" fill="#D1D5DB" font-size="14" font-weight="850">${esc(trimText(lang.name, 24))}</text>
  <text x="${x + trackWidth}" y="${y}" fill="#9CA3AF" font-size="12" font-weight="800" text-anchor="end">${lang.pct}%</text>
  <rect x="${x}" y="${y + 12}" width="${trackWidth}" height="16" rx="9" fill="#202A3F"/>
  <rect class="barGlow" x="${x}" y="${y + 12}" width="${barWidth}" height="16" rx="9" fill="${esc(lang.color)}">
    <animate attributeName="width" from="8" to="${barWidth}" dur="${duration}s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/>
  </rect>
  <rect x="${x + 4}" y="${y + 16}" width="${Math.max(0, barWidth - 8)}" height="3" rx="2" fill="#FFFFFF" opacity="0.25"/>
</g>`;
}

function languagesSvg(data) {
  const id = "langs";
  const width = 760;
  const height = 560;
  const langs = data.topLanguages.slice(0, 8);
  const summary = trimText(
    `${USERS.map((u) => `@${u}`).join(" + ")} · ${data.fallback ? "fallback" : "live"} language bytes · ${data.updated}`,
    82,
  );
  const mesh = `M0 148C112 46 192 178 295 104C404 26 488 34 582 122C656 191 708 104 760 72V560H0V148Z`;
  const rows = langs.map(languageRow).join("\n");

  const children = `${panel(id, width, height, mesh)}
<g class="font">
  <text x="56" y="80" fill="#E6EDF3" font-size="32" font-weight="950">Top language mix</text>
  <text class="mono" x="58" y="110" fill="#9CA3AF" font-size="13">${esc(summary)}</text>
  ${rows}
  <g class="fadeUp delay7">
    <rect x="56" y="500" width="648" height="28" rx="14" fill="#0F172A" stroke="#26324A"/>
    <text class="mono" x="72" y="519" fill="#8B949E" font-size="11">Mobile fix: rows are stacked with full-width progress bars, not squeezed table columns.</text>
  </g>
</g>`;

  return svgShell({
    id,
    width,
    height,
    title: `Top languages for ${PROFILE_USERNAME}`,
    desc: "Animated top-language card generated from public repository language bytes with mobile-safe row spacing.",
    children,
  });
}

function streakSvg(data) {
  const id = "streak";
  const width = 760;
  const height = 520;
  const c = data.contribution || {};
  const current = fmtNumber(c.current || 0);
  const longest = fmtNumber(c.longest || 0);
  const activeDays = fmtNumber(c.activeDays || 0);
  const total = fmtNumber(c.totalContributions || 0);
  const lastActive = trimText(c.lastActive || "after workflow run", 16);
  const subtitle = trimText(
    `${PROFILE_USERNAME} contribution calendar · ${data.fallback || !TOKEN ? "workflow-powered" : "live"} streak card · ${data.updated}`,
    82,
  );
  const mesh = `M0 364C96 250 176 334 276 236C372 142 454 202 536 112C620 20 690 74 760 34V520H0V364Z`;

  const children = `${panel(id, width, height, mesh, "fire")}
<g class="font">
  <text x="56" y="80" fill="#E6EDF3" font-size="32" font-weight="950">Streak engine</text>
  <text class="mono" x="58" y="110" fill="#9CA3AF" font-size="13">${esc(subtitle)}</text>
  <g class="fadeUp delay1" transform="translate(70 145)">
    <circle cx="118" cy="118" r="96" stroke="#202A3F" stroke-width="19"/>
    <circle class="dash" cx="118" cy="118" r="96" stroke="url(#${id}-fire)" stroke-width="19" stroke-linecap="round" fill="none" transform="rotate(-90 118 118)" filter="url(#${id}-glow)"/>
    <circle class="pulse" cx="196" cy="50" r="8" fill="#FBBF24"/>
    <text x="118" y="108" fill="#FBBF24" font-size="56" font-weight="950" text-anchor="middle">${esc(current)}</text>
    <text x="118" y="139" fill="#C9D1D9" font-size="15" font-weight="850" text-anchor="middle">current streak</text>
    <text x="118" y="161" fill="#8B949E" font-size="12" text-anchor="middle">days</text>
  </g>
  ${smallStat({ x: 350, y: 154, w: 160, h: 82, label: "LONGEST", value: `${longest} days`, color: "#A855F7", delay: 2 })}
  ${smallStat({ x: 532, y: 154, w: 160, h: 82, label: "ACTIVE DAYS", value: activeDays, color: "#22D3EE", delay: 3 })}
  ${smallStat({ x: 350, y: 258, w: 160, h: 82, label: "CONTRIBUTIONS", value: total, color: "#00FF88", delay: 4 })}
  ${smallStat({ x: 532, y: 258, w: 160, h: 82, label: "LAST ACTIVE", value: lastActive, color: "#FBBF24", valueSize: 16, delay: 5 })}
  <g class="fadeUp delay6">
    <rect x="56" y="404" width="648" height="58" rx="22" fill="#111827" stroke="#303B55"/>
    <text class="mono" x="78" y="438" fill="#8B949E" font-size="11">GraphQL powers live streaks in GitHub Actions; fallback still renders before the first tokenized run.</text>
  </g>
</g>`;

  return svgShell({
    id,
    width,
    height,
    title: `GitHub streak for ${PROFILE_USERNAME}`,
    desc: "Animated local SVG streak card generated from the GitHub contribution calendar.",
    children,
  });
}

function readmeSnippet() {
  return `<!-- Drop this in your README instead of a markdown table. It stacks cleanly on mobile. -->
<div align="center">
  <img src="./${OUT_DIR}/github-pulse.svg" width="100%" alt="GitHub pulse" />
  <br />
  <img src="./${OUT_DIR}/top-languages.svg" width="100%" alt="Top language mix" />
  <br />
  <img src="./${OUT_DIR}/streak-card.svg" width="100%" alt="GitHub streak" />
</div>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let data;
  try {
    data = await collectData();
  } catch (error) {
    if (!ALLOW_FALLBACK) throw error;
    console.warn(`Using fallback profile-card data: ${error.message}`);
    data = fallbackData(error.message);
  }

  const pulse = githubPulseSvg(data);
  await writeFile(path.join(OUT_DIR, "github-pulse.svg"), pulse, "utf8");
  await writeFile(path.join(OUT_DIR, "github-stats.svg"), pulse, "utf8");
  await writeFile(
    path.join(OUT_DIR, "top-languages.svg"),
    languagesSvg(data),
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "streak-card.svg"),
    streakSvg(data),
    "utf8",
  );

  if (WRITE_README_SNIPPET) {
    await writeFile(
      path.join(OUT_DIR, "profile-cards-readme.md"),
      readmeSnippet(),
      "utf8",
    );
  }

  console.log(`Generated animated profile cards for ${USERS.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
