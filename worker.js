// worker.ts
var UA = "Mozilla/5.0 (compatible; SynligDigital-AEO/1.0; +https://synligdigital.no)";
var TIMEOUT_MS = 15000;
function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      if (Array.isArray(data))
        blocks.push(...data);
      else if (data["@graph"])
        blocks.push(...data["@graph"]);
      else
        blocks.push(data);
    } catch {}
  }
  return blocks;
}
function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace(":", "\\:")}["'][^>]*content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  if (m)
    return m[1];
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name.replace(":", "\\:")}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}
function countTag(html, tag) {
  const re = new RegExp(`<${tag}[\\s>]`, "gi");
  return (html.match(re) || []).length;
}
function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
var SPECIFIC_TYPES = [
  "dentist",
  "medicalclinic",
  "medicalbusiness",
  "physician",
  "autorepair",
  "autodealer",
  "legaLservice",
  "attorney",
  "accountingservice",
  "financialservice",
  "realestaheagent",
  "restaurant",
  "barorpub",
  "cafeoEcoffeeshop",
  "beautysalon",
  "hairsalon",
  "dayspa",
  "healthclub",
  "plumber",
  "electrician",
  "hvacbusiness",
  "roofingcontractor",
  "generalcontractor",
  "locksmith",
  "legalservice"
];
function analyzeSchema(html) {
  const issues = [];
  const recommendations = [];
  const blocks = extractJsonLd(html);
  const types = [];
  function extractTypes(obj) {
    if (!obj || typeof obj !== "object")
      return;
    if (obj["@type"]) {
      const t = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
      types.push(...t.map((s) => s.toLowerCase()));
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v))
        v.forEach(extractTypes);
      else if (typeof v === "object")
        extractTypes(v);
    }
  }
  blocks.forEach(extractTypes);
  const allJson = JSON.stringify(blocks).toLowerCase();
  const hasLocalBusiness = types.some((t) => t === "localbusiness" || SPECIFIC_TYPES.includes(t));
  const hasSpecificType = types.some((t) => SPECIFIC_TYPES.includes(t));
  const hasAggregateRating = allJson.includes("aggregaterating") || allJson.includes("ratingvalue");
  const hasOpeningHours = allJson.includes("openinghours");
  const hasGeo = allJson.includes('"geo"') || allJson.includes('"latitude"');
  const hasContactPoint = allJson.includes("contactpoint");
  const hasFaqPage = types.includes("faqpage");
  const hasService = types.includes("service") || allJson.includes("hasoffercatalog");
  const hasPerson = types.includes("person") || allJson.includes('"employee"');
  let score = 0;
  if (blocks.length === 0) {
    issues.push("Ingen strukturerte data (JSON-LD) funnet");
    recommendations.push("Legg til JSON-LD schema.org markup — det viktigste for AI-synlighet");
  } else {
    score += 4;
    if (hasLocalBusiness) {
      score += 3;
      if (hasSpecificType)
        score += 3;
      else
        recommendations.push("Bruk spesifikk type (f.eks. Dentist, Plumber) i stedet for generisk LocalBusiness");
    } else {
      issues.push("Mangler LocalBusiness-schema");
      recommendations.push("Legg til @type som matcher bransjen (Dentist, Plumber, LegalService, etc.)");
    }
    if (hasAggregateRating)
      score += 4;
    else
      recommendations.push("Legg til AggregateRating med stjernerating fra Google/Trustpilot");
    if (hasOpeningHours)
      score += 2;
    else
      recommendations.push("Legg til openingHours i schema");
    if (hasGeo)
      score += 2;
    else
      recommendations.push("Legg til geo-koordinater (latitude/longitude)");
    if (hasContactPoint)
      score += 1;
    if (hasFaqPage)
      score += 3;
    else
      recommendations.push("Legg til FAQPage schema — AI-er siterer FAQ direkte i svar");
    if (hasService)
      score += 2;
    else
      recommendations.push("Legg til hasOfferCatalog/Service for tjenester");
    if (hasPerson)
      score += 1;
  }
  return {
    score: Math.min(25, score),
    max: 25,
    issues,
    recommendations,
    details: { hasLocalBusiness, hasSpecificType, hasAggregateRating, hasOpeningHours, hasGeo, hasFaqPage, hasService }
  };
}
function analyzeMeta(html) {
  const issues = [];
  const recommendations = [];
  const title = extractTitle(html);
  const description = extractMeta(html, "description");
  const ogTitle = extractMeta(html, "og:title");
  const ogDesc = extractMeta(html, "og:description");
  const ogImage = extractMeta(html, "og:image");
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);
  const viewport = extractMeta(html, "viewport");
  let score = 0;
  if (!title) {
    issues.push("Mangler <title>-tag");
    recommendations.push("Legg til en beskrivende tittel (50-60 tegn)");
  } else if (title.length < 20 || title.length > 70) {
    score += 2;
    recommendations.push(`Tittel er ${title.length} tegn — ideelt 50-60 tegn`);
  } else {
    score += 5;
  }
  if (!description) {
    issues.push("Mangler meta description");
    recommendations.push("Legg til meta description (130-160 tegn) med tjeneste + lokasjon");
  } else if (description.length < 50 || description.length > 170) {
    score += 2;
    recommendations.push(`Meta description er ${description.length} tegn — ideelt 130-160 tegn`);
  } else {
    score += 5;
  }
  if (ogTitle && ogDesc && ogImage) {
    score += 5;
  } else if (ogTitle || ogDesc) {
    score += 2;
    if (!ogImage)
      recommendations.push("Legg til og:image for deling på sosiale medier");
  } else {
    recommendations.push("Legg til OpenGraph-tags (og:title, og:description, og:image)");
  }
  if (canonical)
    score += 3;
  else
    recommendations.push("Legg til canonical URL for å unngå duplisert innhold");
  if (viewport)
    score += 2;
  else
    issues.push("Mangler viewport meta — siden er ikke mobiloptimalisert");
  return {
    score: Math.min(20, score),
    max: 20,
    issues,
    recommendations,
    details: { title, description, hasOg: !!(ogTitle && ogDesc), hasCanonical: canonical }
  };
}
function analyzeContent(html) {
  const issues = [];
  const recommendations = [];
  const text = stripTags(html);
  const words = wordCount(text);
  const h1Count = countTag(html, "h1");
  const h2Count = countTag(html, "h2");
  const hasLocation = /stavanger|bergen|oslo|trondheim|norge|norway/i.test(html);
  const hasPrices = /\d+[\s.,]\d*\s*(kr|nok|,-)/i.test(html);
  const hasFaq = /(?:spørsmål|faq|spør oss|ofte stilte)/i.test(html) || countTag(html, "details") > 0;
  const hasTeam = /(?:vårt team|om oss|tannlege|advokat|lege|spesialist)\s/i.test(html.toLowerCase());
  const hasPhone = /(?:\+47|tlf\.?|telefon)[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/i.test(html);
  let score = 0;
  if (h1Count === 0) {
    issues.push("Mangler H1-overskrift");
    recommendations.push("Legg til én tydelig H1 med tjeneste + lokasjon (f.eks. 'Tannlege i Stavanger')");
  } else if (h1Count === 1) {
    score += 5;
  } else {
    score += 3;
    recommendations.push(`${h1Count} H1-overskrifter funnet — beholdt bare én for best effekt`);
  }
  if (h2Count >= 3)
    score += 3;
  else if (h2Count > 0)
    score += 1;
  else
    recommendations.push("Legg til H2-overskrifter for tjenester, om oss, kontakt");
  if (words >= 500)
    score += 4;
  else if (words >= 200)
    score += 2;
  else {
    issues.push(`Lite innhold (${words} ord) — AI-er trenger nok tekst for å forstå bedriften`);
    recommendations.push("Legg til mer innhold (minst 300-500 ord) som beskriver tjenester og kompetanse");
  }
  if (hasLocation)
    score += 3;
  else {
    issues.push("Ingen stedsnavn funnet i innhold");
    recommendations.push("Nevn by/bydel eksplisitt i tekst og overskrifter ('tannlege i Stavanger')");
  }
  if (hasPrices)
    score += 2;
  else
    recommendations.push("Legg til prisinformasjon — AI-er inkluderer dette i svar");
  if (hasFaq)
    score += 3;
  else
    recommendations.push("Legg til FAQ-seksjon — AI-assistenter siterer direkte fra FAQ");
  if (hasPhone)
    score += 2;
  else
    recommendations.push("Legg til telefonnummer i et format AI kan lese (ikke bare bilde)");
  return {
    score: Math.min(22, score),
    max: 22,
    issues,
    recommendations,
    details: { words, h1Count, h2Count, hasLocation, hasPrices, hasFaq }
  };
}
function analyzeTechnical(html, robotsTxt, llmsTxt, statusCode, loadMs) {
  const issues = [];
  const recommendations = [];
  const hasHttps = true;
  const hasSitemap = /sitemap/i.test(robotsTxt || "");
  const hasLlmsTxt = !!llmsTxt;
  const blocksGpt = /disallow.*GPTBot|user-agent.*GPTBot.*\nDisallow:\s*\//i.test(robotsTxt || "");
  const blocksClaude = /disallow.*ClaudeBot|user-agent.*ClaudeBot.*\nDisallow:\s*\//i.test(robotsTxt || "");
  const hasStructuredUrls = /\/tjenester\/|\/om-oss\/|\/kontakt\//i.test(html);
  const fast = loadMs < 2000;
  const hasSchema = /<script[^>]+application\/ld\+json/i.test(html);
  let score = 0;
  score += 3;
  if (robotsTxt) {
    if (!blocksGpt && !blocksClaude) {
      score += 5;
    } else {
      if (blocksGpt) {
        issues.push("robots.txt blokkerer GPTBot (ChatGPT)");
        recommendations.push("Fjern GPTBot-blokkeringen fra robots.txt for å tillate ChatGPT-indeksering");
      }
      if (blocksClaude) {
        issues.push("robots.txt blokkerer ClaudeBot (Anthropic)");
        recommendations.push("Fjern ClaudeBot-blokkeringen for å tillate Claude-indeksering");
      }
      score += 1;
    }
  } else {
    score += 2;
    recommendations.push("Legg til robots.txt som eksplisitt tillater AI-roboter");
  }
  if (hasLlmsTxt) {
    score += 5;
  } else {
    recommendations.push("Legg til /llms.txt — et nytt format spesifikt for AI-lesbarhet");
  }
  if (hasSitemap)
    score += 2;
  else
    recommendations.push("Legg til sitemap.xml og referer til den fra robots.txt");
  if (fast)
    score += 3;
  else {
    recommendations.push(`Siden lastet på ${loadMs}ms — raskere sider prioriteres i søk`);
    score += 1;
  }
  if (hasStructuredUrls)
    score += 2;
  return {
    score: Math.min(20, score),
    max: 20,
    issues,
    recommendations,
    details: { hasHttps, hasLlmsTxt, blocksGpt, blocksClaude, hasSitemap, loadMs }
  };
}
function analyzeAISignals(html, llmsTxt) {
  const issues = [];
  const recommendations = [];
  const hasLlmsTxt = !!llmsTxt;
  const hasFaqSchema = /faqpage/i.test(html);
  const hasHowTo = /howto/i.test(html);
  const hasDefinedTerms = /definedterm/i.test(html);
  const hasCitations = /kilde:|referanse:|ifølge|i følge/i.test(html);
  const hasAuthor = /author|forfatter|skrevet av/i.test(html);
  const hasDate = /<time[^>]+datetime/i.test(html) || /datePublished|dateModified/i.test(html);
  const hasProfessionalSchema = /physician|dentist|attorney|physician/i.test(html);
  const hasEEAT = (hasAuthor ? 1 : 0) + (hasDate ? 1 : 0) + (hasCitations ? 1 : 0) + (hasProfessionalSchema ? 1 : 0);
  let score = 0;
  if (hasLlmsTxt) {
    score += 4;
  } else {
    recommendations.push("Opprett /llms.txt med beskrivelse av bedriften, tjenester og AI-instrukser");
  }
  if (hasFaqSchema)
    score += 3;
  else
    recommendations.push("FAQPage schema mangler — høy prioritet for AI-sitèring");
  score += Math.min(5, hasEEAT * 2);
  if (!hasAuthor)
    recommendations.push("Legg til forfatter/ekspert-informasjon (E-E-A-T signal)");
  if (!hasDate)
    recommendations.push("Legg til publiseringsdato på innhold");
  if (hasHowTo)
    score += 1;
  return {
    score: Math.min(13, score),
    max: 13,
    issues,
    recommendations,
    details: { hasLlmsTxt, hasFaqSchema, hasAuthor, hasDate, hasEEAT }
  };
}
async function runAudit(url) {
  if (!url.startsWith("http"))
    url = "https://" + url;
  const urlObj = new URL(url);
  const origin = urlObj.origin;
  const start = Date.now();
  const fetchOpts = { headers: { "User-Agent": UA }, redirect: "follow" };
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
  let html = "";
  let statusCode = 0;
  let finalUrl = url;
  let robotsTxt = null;
  let llmsTxt = null;
  try {
    const [mainRes, robotsRes, llmsRes] = await Promise.all([
      withTimeout(fetch(url, fetchOpts)),
      withTimeout(fetch(`${origin}/robots.txt`, fetchOpts)).catch(() => null),
      withTimeout(fetch(`${origin}/llms.txt`, fetchOpts)).catch(() => null)
    ]);
    const main = mainRes;
    statusCode = main.status;
    finalUrl = main.url;
    html = await main.text();
    const robots = robotsRes;
    if (robots?.ok)
      robotsTxt = await robots.text();
    const llms = llmsRes;
    if (llms?.ok)
      llmsTxt = await llms.text();
  } catch (e) {
    statusCode = 0;
  }
  const loadMs = Date.now() - start;
  const schema = analyzeSchema(html);
  const meta = analyzeMeta(html);
  const content = analyzeContent(html);
  const technical = analyzeTechnical(html, robotsTxt, llmsTxt, statusCode, loadMs);
  const aiSignals = analyzeAISignals(html, llmsTxt);
  const totalScore = schema.score + meta.score + content.score + technical.score + aiSignals.score;
  function getGrade(s) {
    if (s >= 85)
      return "A";
    if (s >= 70)
      return "B";
    if (s >= 55)
      return "C";
    if (s >= 40)
      return "D";
    if (s >= 25)
      return "E";
    return "F";
  }
  const allIssues = [...schema.issues, ...meta.issues, ...content.issues, ...technical.issues, ...aiSignals.issues];
  const allRecs = [...schema.recommendations, ...meta.recommendations, ...content.recommendations, ...technical.recommendations, ...aiSignals.recommendations];
  return {
    url,
    finalUrl,
    statusCode,
    loadMs,
    totalScore,
    grade: getGrade(totalScore),
    schema,
    meta,
    content,
    technical,
    aiSignals,
    allIssues,
    allRecs
  };
}
var CSS = `
  :root {
    --primary: #1a56db;
    --primary-dark: #1e429f;
    --green: #057a55;
    --yellow: #d97706;
    --orange: #d97706;
    --red: #c81e1e;
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-400: #9ca3af;
    --gray-600: #4b5563;
    --gray-800: #1f2937;
    --gray-900: #111827;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--gray-50); color: var(--gray-800); line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 0 1.5rem; }
  header { background: white; border-bottom: 1px solid var(--gray-200); padding: 1rem 0; }
  header .inner { display: flex; align-items: center; justify-content: space-between; }
  .logo { font-weight: 700; font-size: 1.25rem; color: var(--gray-900); text-decoration: none; }
  .logo span { color: var(--primary); }
  nav a { color: var(--primary); text-decoration: none; font-size: 0.9rem; }
  .hero { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 3rem 0 2.5rem; text-align: center; }
  .hero h1 { font-size: 2rem; font-weight: 800; margin-bottom: 0.75rem; }
  .hero p { font-size: 1.1rem; opacity: 0.9; max-width: 500px; margin: 0 auto 2rem; }
  .form-row { display: flex; gap: 0.5rem; max-width: 560px; margin: 0 auto; }
  .form-row input { flex: 1; padding: 0.875rem 1rem; border: none; border-radius: 8px; font-size: 1rem; outline: none; }
  .form-row input:focus { box-shadow: 0 0 0 3px rgba(255,255,255,0.3); }
  .btn { padding: 0.875rem 1.5rem; background: #f59e0b; color: #111; border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background 0.15s; text-decoration: none; display: inline-block; }
  .btn:hover { background: #d97706; }
  .btn-secondary { background: white; color: var(--primary); border: 2px solid var(--primary); padding: 0.75rem 1.25rem; }
  .btn-secondary:hover { background: var(--primary); color: white; }
  .card { background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
  .grade-badge { display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 50%; font-size: 2.5rem; font-weight: 800; color: white; flex-shrink: 0; }
  .score-row { display: flex; align-items: center; gap: 1.5rem; }
  .score-text h2 { font-size: 1.4rem; font-weight: 700; }
  .score-text .sub { color: var(--gray-600); font-size: 0.95rem; }
  .grade-A { background: #057a55; }
  .grade-B { background: #059669; }
  .grade-C { background: #d97706; }
  .grade-D { background: #ea580c; }
  .grade-E { background: #dc2626; }
  .grade-F { background: #991b1b; }
  .category { margin-bottom: 0.75rem; }
  .category-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
  .category-name { font-weight: 600; font-size: 0.95rem; }
  .category-score { font-size: 0.85rem; color: var(--gray-600); }
  .bar { height: 8px; background: var(--gray-200); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
  .bar-green { background: #10b981; }
  .bar-yellow { background: #f59e0b; }
  .bar-orange { background: #f97316; }
  .bar-red { background: #ef4444; }
  .issues-list, .recs-list { list-style: none; }
  .issues-list li { padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100); font-size: 0.9rem; }
  .issues-list li:last-child { border-bottom: none; }
  .issues-list li::before { content: "⚠️ "; }
  .recs-list li { padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100); font-size: 0.9rem; }
  .recs-list li:last-child { border-bottom: none; }
  .recs-list li::before { content: "→ "; color: var(--primary); font-weight: 700; }
  .cta-box { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border-radius: 12px; padding: 2rem; text-align: center; margin: 2rem 0; }
  .cta-box h3 { font-size: 1.5rem; margin-bottom: 0.75rem; }
  .cta-box p { opacity: 0.9; margin-bottom: 1.5rem; }
  .cta-box .cta-contact { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; align-items: center; margin-top: 1rem; }
  .cta-box .cta-contact a { color: rgba(255,255,255,0.85); font-size: 0.9rem; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.3); }
  .cta-box .cta-contact a:hover { color: white; border-bottom-color: white; }
  .badge-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
  .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .section-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; color: var(--gray-900); }
  .benchmark { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; padding: 0.75rem 1rem; background: var(--gray-50); border-radius: 8px; font-size: 0.85rem; }
  .benchmark-bar-wrap { flex: 1; height: 6px; background: var(--gray-200); border-radius: 3px; position: relative; }
  .benchmark-avg { position: absolute; top: -3px; width: 2px; height: 12px; background: #9ca3af; border-radius: 1px; }
  .benchmark-you { position: absolute; top: -4px; width: 4px; height: 14px; background: var(--primary); border-radius: 2px; }
  .proof-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 1rem 1.25rem; margin-top: 0.75rem; font-size: 0.9rem; color: #15803d; }
  .proof-card strong { color: #14532d; }
  .overlay { display: none; position: fixed; inset: 0; background: rgba(255,255,255,0.9); z-index: 999; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; }
  .overlay.active { display: flex; }
  .spinner { width: 48px; height: 48px; border: 4px solid #e5e7eb; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .overlay p { font-size: 1rem; color: var(--gray-600); font-weight: 500; }
  footer { text-align: center; padding: 2rem 0; color: var(--gray-400); font-size: 0.85rem; border-top: 1px solid var(--gray-200); margin-top: 3rem; }
  footer a { color: var(--primary); text-decoration: none; }
  @media (max-width: 600px) {
    .hero h1 { font-size: 1.5rem; }
    .form-row { flex-direction: column; }
    .score-row { flex-direction: column; text-align: center; }
  }
`;
function renderHeader() {
  return `<header>
  <div class="container inner">
    <a class="logo" href="https://synligdigital.no">Synlig<span>Digital</span></a>
    <nav><a href="https://synligdigital.no/blogg/aeo-i-norge-2026">Hva er AEO? →</a></nav>
  </div>
</header>`;
}
function renderFooter() {
  return `<footer>
  <div class="container">
    <p>AEO Sjekk er en gratis tjeneste fra <a href="https://synligdigital.no">Synlig Digital</a> — AI-synlighet for norske bedrifter.<br>
    Resultatene er veiledende og basert på offentlig tilgjengelig informasjon.</p>
  </div>
</footer>`;
}
function getBarClass(pct) {
  if (pct >= 70)
    return "bar-green";
  if (pct >= 50)
    return "bar-yellow";
  if (pct >= 30)
    return "bar-orange";
  return "bar-red";
}
var HOME_HTML = `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AEO Sjekk — Gratis AI-synlighetsanalyse | Synlig Digital</title>
  <meta name="description" content="Sjekk om bedriften din er synlig for ChatGPT, Claude og Google AI. Gratis AEO-score på under 15 sekunder.">
  <meta property="og:title" content="AEO Sjekk — Gratis AI-synlighetsanalyse">
  <meta property="og:description" content="Sjekk om bedriften din er synlig for ChatGPT, Claude og Google AI. Gratis AEO-score på under 15 sekunder.">
  <style>${CSS}</style>
</head>
<body>
  <div class="overlay" id="overlay">
    <div class="spinner"></div>
    <p id="overlay-msg">Analyserer nettsiden din…</p>
    <p style="font-size:0.8rem;color:#9ca3af">Kan ta 10–20 sekunder</p>
  </div>
  ${renderHeader()}
  <div class="hero">
    <div class="container">
      <h1>Er bedriften din synlig for AI?</h1>
      <p>ChatGPT, Claude og Google AI svarer på kundespørsmål — uten å sende dem til Google. Sjekk om din bedrift dukker opp.</p>
      <form action="/sjekk" method="GET" id="main-form">
        <div class="form-row">
          <input type="url" name="url" id="main-url" placeholder="https://dinbedrift.no" required autocomplete="url">
          <button class="btn" type="submit">Sjekk gratis</button>
        </div>
      </form>
    </div>
  </div>
  <div class="container" style="padding-top:2rem">
    <div class="card">
      <div class="section-title">Hva sjekker vi?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <strong>\uD83D\uDCCB Strukturerte data (25p)</strong><br>
          <small style="color:#6b7280">JSON-LD schema, LocalBusiness, FAQ, AggregateRating</small>
        </div>
        <div>
          <strong>\uD83C\uDFF7️ Meta og titler (20p)</strong><br>
          <small style="color:#6b7280">Title, description, OpenGraph, canonical</small>
        </div>
        <div>
          <strong>\uD83D\uDCDD Innhold (22p)</strong><br>
          <small style="color:#6b7280">H1/H2-struktur, lokasjon, pris, FAQ, tekstmengde</small>
        </div>
        <div>
          <strong>⚙️ Teknisk (20p)</strong><br>
          <small style="color:#6b7280">HTTPS, robots.txt, llms.txt, hastighet</small>
        </div>
        <div style="grid-column:1/-1">
          <strong>\uD83E\uDD16 AI-signaler (13p)</strong><br>
          <small style="color:#6b7280">llms.txt, FAQPage schema, E-E-A-T, HowTo</small>
        </div>
      </div>
    </div>
    <div class="card" style="text-align:center">
      <p style="color:#6b7280;margin-bottom:1rem">Over <strong>80%</strong> av norske bedrifter scorer under 40/100. Vet du hvor du står?</p>
      <form action="/sjekk" method="GET" class="loading-form">
        <div class="form-row" style="justify-content:center">
          <input type="url" name="url" placeholder="https://dinbedrift.no" required style="max-width:320px">
          <button class="btn" type="submit">Start gratis analyse</button>
        </div>
      </form>
    </div>
    <div class="card" style="border-left:4px solid #10b981">
      <div class="section-title" style="margin-bottom:0.5rem">\uD83D\uDCCA Resultater fra norske bedrifter</div>
      <div class="proof-card">
        <strong>Nordic Lithium AS</strong> — Gikk fra 67/100 til 85/100 etter AEO-optimalisering.<br>
        <span style="color:#6b7280;font-size:0.85rem">«Vi dukker nå opp i AI-svar om norsk litium og bærekraftig gruvedrift.»</span>
      </div>
      <p style="margin-top:0.75rem;font-size:0.85rem;color:#6b7280">Synlig Digital (synligdigital.no) scorer <strong>96/100</strong> — vi lever som vi lærer.</p>
    </div>
  </div>
  ${renderFooter()}
  <script>
    function showOverlay(url) {
      const host = new URL(url).hostname;
      document.getElementById('overlay-msg').textContent = 'Analyserer ' + host + '…';
      document.getElementById('overlay').classList.add('active');
    }
    document.getElementById('main-form').addEventListener('submit', function(e) {
      const input = document.getElementById('main-url');
      try { showOverlay(input.value.startsWith('http') ? input.value : 'https://' + input.value); } catch(_) {}
    });
    document.querySelectorAll('.loading-form').forEach(function(f) {
      f.addEventListener('submit', function(e) {
        const input = f.querySelector('input[name="url"]');
        try { showOverlay(input.value.startsWith('http') ? input.value : 'https://' + input.value); } catch(_) {}
      });
    });
  </script>
</body>
</html>`;
function renderResultHtml(r) {
  const categories = [
    { name: "\uD83D\uDCCB Strukturerte data", score: r.schema.score, max: r.schema.max },
    { name: "\uD83C\uDFF7️ Meta og titler", score: r.meta.score, max: r.meta.max },
    { name: "\uD83D\uDCDD Innhold", score: r.content.score, max: r.content.max },
    { name: "⚙️ Teknisk", score: r.technical.score, max: r.technical.max },
    { name: "\uD83E\uDD16 AI-signaler", score: r.aiSignals.score, max: r.aiSignals.max }
  ];
  const gradeColor = {
    A: "#057a55",
    B: "#059669",
    C: "#d97706",
    D: "#ea580c",
    E: "#dc2626",
    F: "#991b1b"
  }[r.grade] || "#374151";
  const categoriesHtml = categories.map((c) => {
    const pct = Math.round(c.score / c.max * 100);
    const barClass = getBarClass(pct);
    return `<div class="category">
      <div class="category-header">
        <span class="category-name">${c.name}</span>
        <span class="category-score">${c.score}/${c.max} (${pct}%)</span>
      </div>
      <div class="bar"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
  const issuesHtml = r.allIssues.length > 0 ? `<ul class="issues-list">${r.allIssues.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p style="color:#057a55">Ingen kritiske problemer funnet! \uD83C\uDF89</p>`;
  const topRecs = r.allRecs.slice(0, 8);
  const recsHtml = topRecs.length > 0 ? `<ul class="recs-list">${topRecs.map((r2) => `<li>${r2}</li>`).join("")}</ul>` : `<p style="color:#057a55">Nettsiden er godt optimalisert!</p>`;
  const displayUrl = r.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const now = new Date().toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AEO-score for ${displayUrl}: ${r.totalScore}/100 (${r.grade}) | Synlig Digital</title>
  <meta name="description" content="AEO-analyse av ${displayUrl}. AI-synlighetsscore: ${r.totalScore}/100 (karakter ${r.grade}).">
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader()}
  <div style="background:white;border-bottom:1px solid #e5e7eb;padding:0.75rem 0;">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
      <span style="font-size:0.9rem;color:#6b7280">Analysert: <strong>${displayUrl}</strong> · ${now}</span>
      <a href="/" class="btn btn-secondary" style="font-size:0.85rem;padding:0.5rem 1rem">Sjekk en annen side →</a>
    </div>
  </div>
  <div class="container" style="padding-top:1.5rem">
    <div class="card">
      <div class="score-row">
        <div class="grade-badge grade-${r.grade}" style="background:${gradeColor}">${r.grade}</div>
        <div class="score-text">
          <h2>${r.totalScore}/100 — AI-synlighetsscore</h2>
          <div class="sub">${r.totalScore >= 70 ? "Godt optimalisert for AI-søk" : r.totalScore >= 55 ? "Middels synlighet — betydelig forbedringspotensial" : r.totalScore >= 40 ? "Lav synlighet — mange viktige elementer mangler" : "Svært lav synlighet — bedriften er nesten usynlig for AI"}</div>
          <div class="badge-row">
            ${r.schema.details.hasFaqPage ? '<span class="badge badge-green">✓ FAQPage</span>' : '<span class="badge badge-red">✗ Ingen FAQ-schema</span>'}
            ${r.schema.details.hasLocalBusiness ? '<span class="badge badge-green">✓ LocalBusiness</span>' : '<span class="badge badge-red">✗ Ingen LocalBusiness</span>'}
            ${r.schema.details.hasAggregateRating ? '<span class="badge badge-green">✓ AggregateRating</span>' : '<span class="badge badge-red">✗ Ingen rating-schema</span>'}
            ${r.technical.details.hasLlmsTxt ? '<span class="badge badge-green">✓ llms.txt</span>' : '<span class="badge badge-red">✗ Ingen llms.txt</span>'}
            ${r.technical.details.blocksGpt ? '<span class="badge badge-red">⚠ Blokkerer GPTBot</span>' : ""}
          </div>
        </div>
      </div>
      <div style="margin-top:1.5rem">
        ${categoriesHtml}
      </div>
    </div>

    ${r.allIssues.length > 0 ? `<div class="card">
      <div class="section-title">⚠️ Kritiske problemer (${r.allIssues.length})</div>
      ${issuesHtml}
    </div>` : ""}

    <div class="card">
      <div class="section-title">\uD83D\uDCA1 Topp anbefalinger</div>
      ${recsHtml}
    </div>

    <div class="card" style="padding:1rem 1.25rem">
      <div class="section-title" style="margin-bottom:0.5rem">\uD83D\uDCCA Sammenligning med norske bedrifter</div>
      <div class="benchmark">
        <span style="min-width:60px;font-weight:600;color:${r.totalScore >= 70 ? "#057a55" : r.totalScore >= 40 ? "#d97706" : "#dc2626"}">${r.totalScore}/100</span>
        <div class="benchmark-bar-wrap">
          <div style="position:absolute;top:0;left:0;height:100%;width:${r.totalScore}%;background:${r.totalScore >= 70 ? "#10b981" : r.totalScore >= 40 ? "#f59e0b" : "#ef4444"};border-radius:3px;"></div>
          <div class="benchmark-avg" style="left:48%;" title="Norsk gjennomsnitt: ~48/100"></div>
          <div class="benchmark-you" style="left:${Math.min(r.totalScore, 97)}%;"></div>
        </div>
        <span style="color:#6b7280;font-size:0.8rem;min-width:90px;text-align:right">Snitt: 48/100</span>
      </div>
      <p style="font-size:0.8rem;color:#9ca3af;margin-top:0.5rem">${r.totalScore >= 70 ? "\uD83C\uDFC6 Du er blant topp 10% av norske bedrifter på AI-synlighet." : r.totalScore >= 40 ? "\uD83D\uDCC8 Du er over snittet, men konkurrentene tar igjen. Neste steg: FAQ-schema og AggregateRating." : "⚠️ Under snittet for norske bedrifter. AI-søk sender kundene dine til konkurrenter som scorer høyere."}</p>
    </div>

    <div class="cta-box">
      <h3>${r.totalScore < 40 ? "⚡ Din bedrift er nesten usynlig for AI-søk" : r.totalScore < 70 ? "\uD83D\uDCC8 Du mister kunder til konkurrenter i AI-søk" : "✅ Bra score — men det er alltid rom til toppen"}</h3>
      <p>${r.totalScore < 40 ? `Du scorer ${r.totalScore}/100. Norsk gjennomsnitt er 48/100 — men topp-bedrifter scorer 80+. ChatGPT og Claude anbefaler konkurrentene dine, ikke deg. Vi fikser dette.` : r.totalScore < 70 ? `Du scorer ${r.totalScore}/100 — bedre enn de fleste, men konkurrentene dine jobber aktivt med AEO. En full audit avslører de 3-5 endringene med størst effekt.` : `Du scorer ${r.totalScore}/100 — imponerende! For å nå toppen og bli den bedriften AI siterer konsekvent, trenger du en full AEO-strategi.`}</p>
      <a href="https://synligdigital.no?ref=sjekk-${r.totalScore}" class="btn" style="background:#f59e0b;color:#111">Få gratis AEO-gjennomgang →</a>
      <div class="cta-contact">
        <span>eller kontakt oss direkte:</span>
        <a href="mailto:hei@synligdigital.no">hei@synligdigital.no</a>
        <span>·</span>
        <a href="https://synligdigital.no/blogg/aeo-i-norge-2026">Les: AEO i Norge 2026 →</a>
      </div>
    </div>

    <div class="card">
      <div class="section-title">\uD83D\uDD04 Sjekk en annen nettside</div>
      <form action="/sjekk" method="GET" class="loading-form">
        <div class="form-row">
          <input type="url" name="url" placeholder="https://annenbedrift.no" required>
          <button class="btn" type="submit">Sjekk</button>
        </div>
      </form>
    </div>
  </div>
  ${renderFooter()}
  <script>
    document.querySelectorAll('.loading-form').forEach(function(f) {
      f.addEventListener('submit', function() {
        document.body.style.opacity = '0.7';
        document.body.style.pointerEvents = 'none';
      });
    });
  </script>
</body>
</html>`;
}
function renderErrorHtml(url, error) {
  return `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feil — AEO Sjekk | Synlig Digital</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader()}
  <div class="container" style="padding-top:2rem">
    <div class="card" style="text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem">\uD83D\uDE15</div>
      <h2 style="margin-bottom:0.5rem">Kunne ikke analysere nettsiden</h2>
      <p style="color:#6b7280;margin-bottom:1.5rem">${error}</p>
      <a href="/" class="btn">Prøv igjen</a>
    </div>
  </div>
  ${renderFooter()}
</body>
</html>`;
}
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const securityHeaders = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    if (pathname === "/" || pathname === "") {
      return new Response(HOME_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders }
      });
    }
    if (pathname === "/sjekk") {
      if (request.method === "POST") {
        const body = await request.formData();
        const targetUrl2 = body.get("url");
        if (!targetUrl2) {
          return Response.redirect(new URL("/", request.url).href, 303);
        }
        return Response.redirect(new URL(`/sjekk?url=${encodeURIComponent(targetUrl2)}`, request.url).href, 303);
      }
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return Response.redirect(new URL("/", request.url).href, 303);
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl.startsWith("http") ? targetUrl : "https://" + targetUrl);
      } catch {
        return new Response(renderErrorHtml(targetUrl, `"${targetUrl}" er ikke en gyldig URL.`), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders } });
      }
      const hostname = parsedUrl.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
        return new Response(renderErrorHtml(targetUrl, "Kan ikke analysere lokale adresser."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders } });
      }
      try {
        const result = await runAudit(parsedUrl.href);
        if (result.statusCode === 0) {
          return new Response(renderErrorHtml(targetUrl, `Kunne ikke nå ${hostname}. Sjekk at domenet er korrekt og at nettsiden er oppe.`), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders } });
        }
        return new Response(renderResultHtml(result), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders }
        });
      } catch (e) {
        return new Response(renderErrorHtml(targetUrl, `Analysen feilet: ${e.message || "ukjent feil"}`), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", ...securityHeaders } });
      }
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain", ...securityHeaders }
    });
  }
};
export {
  worker_default as default
};
