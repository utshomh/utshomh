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
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fmtNumber(value) {
  const n = Number(value || 0);
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

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${PROFILE_USERNAME}-profile-readme-card-generator`,
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const response = await fetch(url, { headers });
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
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `${PROFILE_USERNAME}-profile-readme-card-generator`,
    };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const response = await fetch(url, { headers });
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
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": `${PROFILE_USERNAME}-profile-readme-card-generator`,
    },
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
  if (end >= 0 && days[end].contributionCount === 0) end -= 1; // don't punish an unfinished today
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
  const topLanguages = [...languages.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, bytes]) => ({
      name,
      bytes,
      pct: languageTotal
        ? Math.max(1, Math.round((bytes / languageTotal) * 100))
        : 0,
      color: PALETTE[name] || "#8B949E",
    }));

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
  .float { animation: float 7s ease-in-out infinite; transform-origin: center; }
  .float2 { animation: float 9s ease-in-out infinite reverse; transform-origin: center; }
  .pulse { animation: pulse 2.6s ease-in-out infinite; }
  .dash { stroke-dasharray: 12 16; animation: dash 16s linear infinite; }
  .fadeIn { animation: fadeIn .9s ease-out both; }
  @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
  @keyframes pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
  @keyframes dash { to { stroke-dashoffset: -240; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .float, .float2, .pulse, .dash, .fadeIn { animation: none; } }
</style>`;

function githubPulseSvg(data) {
  const publicRepos = data.repos.length;
  const spaces = USERS.length;
  const latest = data.latestRepo?.full_name || "No repo data";
  const focus =
    data.topLanguages
      .slice(0, 4)
      .map((lang) => lang.name)
      .join(" · ") || "Backend · Systems · Rust";
  const subtitle = `${USERS.map((u) => `@${u}`).join(" + ")} · ${data.fallback ? "fallback" : "live"} local SVG · ${data.updated}`;
  const note = data.fallback
    ? "Workflow will recalculate live repo metrics after the next run."
    : `Latest public update: ${latest}`;

  return `<svg width="900" height="360" viewBox="0 0 900 360" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
<title id="title">GitHub pulse for ${esc(PROFILE_USERNAME)}</title>
<desc id="desc">Animated local SVG card with public GitHub profile statistics.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="900" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="#08111F"/><stop offset="0.52" stop-color="#101B36"/><stop offset="1" stop-color="#25103D"/></linearGradient>
  <linearGradient id="neon" x1="70" y1="42" x2="830" y2="322" gradientUnits="userSpaceOnUse"><stop stop-color="#22D3EE"/><stop offset="0.52" stop-color="#7C3AED"/><stop offset="1" stop-color="#00FF88"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${animatedStyle}
<rect width="900" height="360" rx="30" fill="url(#bg)"/>
<circle class="float" cx="775" cy="78" r="82" fill="#22D3EE" opacity="0.10"/>
<circle class="float2" cx="120" cy="305" r="110" fill="#A855F7" opacity="0.12"/>
<path d="M0 251C107 141 189 221 295 128C398 37 510 86 604 45C725 -8 782 53 900 18V360H0V251Z" fill="url(#neon)" opacity="0.20"/>
<rect x="28" y="28" width="844" height="304" rx="26" fill="#0D1117" fill-opacity="0.78" stroke="#273550" filter="url(#shadow)"/>
<path class="dash" d="M66 275C148 195 194 255 272 190C342 132 409 153 468 111C547 55 620 120 683 82C756 38 792 91 837 63" stroke="url(#neon)" stroke-width="3" stroke-linecap="round" opacity="0.75" filter="url(#glow)"/>
<g font-family="Inter, Segoe UI, Arial, sans-serif">
  <text x="62" y="76" fill="#E6EDF3" font-size="33" font-weight="900">GitHub pulse</text>
  <text x="64" y="104" fill="#9CA3AF" font-family="Fira Code, Consolas, monospace" font-size="14">${esc(subtitle)}</text>
  ${metricCard(62, 132, "PUBLIC REPOS", fmtNumber(publicRepos), "#22D3EE", "01")}
  ${metricCard(268, 132, "TOTAL STARS", fmtNumber(data.totalStars), "#A855F7", "02")}
  ${metricCard(474, 132, "TOTAL FORKS", fmtNumber(data.totalForks), "#FBBF24", "03")}
  ${metricCard(680, 132, "GITHUB SPACES", fmtNumber(spaces), "#00FF88", "04")}
  <rect x="62" y="232" width="776" height="78" rx="18" fill="#111827" stroke="#303B55"/>
  <circle class="pulse" cx="88" cy="264" r="7" fill="#00FF88"/>
  <text x="108" y="259" fill="#C9D1D9" font-size="13" font-weight="800">SHIP MODE</text>
  <text x="108" y="281" fill="#E6EDF3" font-size="16" font-weight="700">${esc(focus)} · backend APIs · VPS/server work · language tooling</text>
  <text x="108" y="301" fill="#8B949E" font-size="11">${esc(note)}</text>
</g>
</svg>`;
}

function metricCard(x, y, label, value, color, number) {
  return `<g class="fadeIn">
    <rect x="${x}" y="${y}" width="176" height="78" rx="18" fill="#121A2A" stroke="#2A3753"/>
    <text x="${x + 18}" y="${y + 27}" fill="#8B949E" font-size="11" font-weight="800">${esc(label)}</text>
    <text x="${x + 18}" y="${y + 60}" fill="${color}" font-size="31" font-weight="900">${esc(value)}</text>
    <text x="${x + 142}" y="${y + 30}" fill="#26324A" font-size="23" font-weight="900">${number}</text>
  </g>`;
}

function languagesSvg(data) {
  const langs = data.topLanguages.slice(0, 8);
  const rows = langs
    .map((lang, index) => {
      const y = 128 + index * 31;
      const width = Math.max(8, Math.round((390 * lang.pct) / 100));
      return `<g font-family="Inter, Segoe UI, Arial, sans-serif">
      <text x="62" y="${y + 14}" fill="#D1D5DB" font-size="14" font-weight="800">${esc(lang.name)}</text>
      <text x="678" y="${y + 14}" fill="#9CA3AF" font-size="12" text-anchor="end">${lang.pct}%</text>
      <rect x="190" y="${y}" width="445" height="15" rx="8" fill="#202A3F"/>
      <rect x="190" y="${y}" width="${width}" height="15" rx="8" fill="${esc(lang.color)}"><animate attributeName="width" from="0" to="${width}" dur="${0.7 + index * 0.08}s" fill="freeze"/></rect>
    </g>`;
    })
    .join("\n");

  const summary = `${USERS.map((u) => `@${u}`).join(" + ")} · ${data.fallback ? "fallback" : "live"} language bytes · ${data.updated}`;
  return `<svg width="760" height="420" viewBox="0 0 760 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
<title id="title">Top languages for ${esc(PROFILE_USERNAME)}</title>
<desc id="desc">Animated local SVG top-language card generated from public repository language bytes.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="760" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#08111F"/><stop offset="0.55" stop-color="#111B34"/><stop offset="1" stop-color="#25103D"/></linearGradient>
  <linearGradient id="mesh" x1="0" y1="0" x2="760" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#00FF88" stop-opacity="0.25"/><stop offset="0.45" stop-color="#22D3EE" stop-opacity="0.20"/><stop offset="1" stop-color="#A855F7" stop-opacity="0.30"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/></filter>
</defs>
${animatedStyle}
<rect width="760" height="420" rx="30" fill="url(#bg)"/>
<path d="M0 118C112 28 189 142 295 82C401 22 488 16 579 91C655 153 704 93 760 54V420H0V118Z" fill="url(#mesh)" opacity="0.52"/>
<circle class="float" cx="650" cy="85" r="72" fill="#22D3EE" opacity="0.10"/>
<rect x="28" y="28" width="704" height="364" rx="26" fill="#0D1117" fill-opacity="0.78" stroke="#273550" filter="url(#shadow)"/>
<g font-family="Inter, Segoe UI, Arial, sans-serif">
  <text x="56" y="73" fill="#E6EDF3" font-size="30" font-weight="900">Top language mix</text>
  <text x="58" y="101" fill="#9CA3AF" font-family="Fira Code, Consolas, monospace" font-size="13">${esc(summary)}</text>
  ${rows}
  <text x="58" y="375" fill="#8B949E" font-family="Fira Code, Consolas, monospace" font-size="11">Overflow fixed: taller canvas + safe row spacing. Workflow refreshes this from live public repos.</text>
</g>
</svg>`;
}

function streakSvg(data) {
  const c = data.contribution || {};
  const current = fmtNumber(c.current || 0);
  const longest = fmtNumber(c.longest || 0);
  const activeDays = fmtNumber(c.activeDays || 0);
  const total = fmtNumber(c.totalContributions || 0);
  const lastActive = c.lastActive || "after workflow run";
  const subtitle = `${PROFILE_USERNAME} contribution calendar · ${data.fallback || !TOKEN ? "workflow-powered" : "live"} streak card · ${data.updated}`;

  return `<svg width="760" height="420" viewBox="0 0 760 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
<title id="title">GitHub streak for ${esc(PROFILE_USERNAME)}</title>
<desc id="desc">Animated local SVG streak card generated from the GitHub contribution calendar.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="760" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#0A1020"/><stop offset="0.48" stop-color="#16142D"/><stop offset="1" stop-color="#2B1035"/></linearGradient>
  <linearGradient id="fire" x1="150" y1="60" x2="650" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="#FBBF24"/><stop offset="0.45" stop-color="#FF6B6B"/><stop offset="1" stop-color="#A855F7"/></linearGradient>
  <linearGradient id="aqua" x1="0" y1="0" x2="760" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#22D3EE"/><stop offset="1" stop-color="#00FF88"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${animatedStyle}
<rect width="760" height="420" rx="30" fill="url(#bg)"/>
<circle class="float" cx="176" cy="224" r="118" fill="#FBBF24" opacity="0.08"/>
<circle class="float2" cx="620" cy="96" r="102" fill="#22D3EE" opacity="0.10"/>
<path d="M0 304C95 206 174 280 271 203C369 126 444 172 525 105C613 32 682 61 760 22V420H0V304Z" fill="url(#fire)" opacity="0.17"/>
<rect x="28" y="28" width="704" height="364" rx="26" fill="#0D1117" fill-opacity="0.78" stroke="#273550" filter="url(#shadow)"/>
<g font-family="Inter, Segoe UI, Arial, sans-serif">
  <text x="56" y="73" fill="#E6EDF3" font-size="30" font-weight="900">Streak engine</text>
  <text x="58" y="101" fill="#9CA3AF" font-family="Fira Code, Consolas, monospace" font-size="13">${esc(subtitle)}</text>
  <g transform="translate(72 136)">
    <circle cx="112" cy="112" r="92" stroke="#202A3F" stroke-width="18"/>
    <circle class="dash" cx="112" cy="112" r="92" stroke="url(#fire)" stroke-width="18" stroke-linecap="round" fill="none" transform="rotate(-90 112 112)" filter="url(#glow)"/>
    <text x="112" y="101" fill="#FBBF24" font-size="54" font-weight="900" text-anchor="middle">${current}</text>
    <text x="112" y="130" fill="#C9D1D9" font-size="15" font-weight="800" text-anchor="middle">current streak</text>
    <text x="112" y="151" fill="#8B949E" font-size="12" text-anchor="middle">days</text>
  </g>
  ${smallStat(348, 150, "LONGEST", `${longest} days`, "#A855F7")}
  ${smallStat(536, 150, "ACTIVE DAYS", activeDays, "#22D3EE")}
  ${smallStat(348, 244, "YEARLY CONTRIBUTIONS", total, "#00FF88")}
  ${smallStat(536, 244, "LAST ACTIVE", lastActive, "#FBBF24", 12)}
  <text x="58" y="372" fill="#8B949E" font-family="Fira Code, Consolas, monospace" font-size="11">Uses GraphQL in GitHub Actions for live streaks; fallback SVG still renders beautifully before the first run.</text>
</g>
</svg>`;
}

function smallStat(x, y, label, value, color, valueSize = 23) {
  return `<g class="fadeIn">
    <rect x="${x}" y="${y}" width="158" height="72" rx="18" fill="#121A2A" stroke="#2A3753"/>
    <text x="${x + 18}" y="${y + 27}" fill="#8B949E" font-size="11" font-weight="800">${esc(label)}</text>
    <text x="${x + 18}" y="${y + 56}" fill="${color}" font-size="${valueSize}" font-weight="900">${esc(value)}</text>
  </g>`;
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
  await writeFile(path.join(OUT_DIR, "github-stats.svg"), pulse, "utf8"); // compatibility alias
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
  console.log(`Generated animated profile cards for ${USERS.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
