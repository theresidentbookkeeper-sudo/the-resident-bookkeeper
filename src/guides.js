// Guides at residentbookkeeper.com/guides are stored in the portal database (table trb_guides), so Zara can
// publish and update them without editing the website. This file turns them into pages, and adds them to the
// sitemap and llms.txt. Pages are cached for 5 minutes.
const SITE = "https://residentbookkeeper.com";
const CACHE_SECONDS = 300;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso) => String(iso || "").slice(0, 10);
const nice = (iso) => {
  const d = new Date(iso || Date.now());
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
};

const ORG = { "@id": `${SITE}/#organization` };
const NANCY = {
  "@type": "Person", "@id": `${SITE}/about#nancy-bello`, name: "Nancy Bello", jobTitle: "Founder and Director", worksFor: ORG,
  image: `${SITE}/assets/nancy-bello.jpg`, url: `${SITE}/about`,
  description: "Accountant and bookkeeper with more than 15 years of experience keeping books for consulting, mining, construction, manufacturing and e-commerce businesses.",
  alumniOf: { "@type": "CollegeOrUniversity", name: "University of Abuja" },
  sameAs: ["https://www.linkedin.com/in/nancy-bello-a18125378"],
};
const isNancy = (g) => String(g.author || "").toLowerCase() === "nancy bello";

async function db(env, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/trb_guides?${query}`;
  const key = env.SUPABASE_ANON_KEY;
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("guides database " + r.status);
  return r.json();
}
const LIST_FIELDS = "slug,title,description,author,published_at,updated_at";
const listGuides = (env) => db(env, `status=eq.published&select=${LIST_FIELDS}&order=published_at.desc&limit=500`);

async function shell(env, request) {
  const r = await env.ASSETS.fetch(new Request(new URL("/assets/guide-shell.html", request.url), { method: "GET" }));
  if (!r.ok) throw new Error("guide shell missing");
  return r.text();
}

function fill(tpl, { title, description, url, ld, body, type = "article" }) {
  const head = `<title>${esc(title)}</title><meta name="description" content="${esc(description)}">` +
    `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${url}">` +
    `<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">` +
    `<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/assets/trb-share-2026.png"><meta name="twitter:card" content="summary_large_image">`;
  const ldTag = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  return tpl.replace("<!--TRB:HEAD-->", head).replace("<!--TRB:LD-->", ldTag).replace("<!--TRB:BODY-->", body);
}

function guidePage(tpl, g, others) {
  const url = `${SITE}/guides/${g.slug}`;
  const faq = Array.isArray(g.faq) ? g.faq : [];
  const sources = Array.isArray(g.sources) ? g.sources : [];
  const nancy = isNancy(g);
  const author = nancy ? { "@id": NANCY["@id"] } : ORG;
  const graph = [
    { "@type": "Article", "@id": url + "#article", headline: g.title, description: g.description, author, publisher: ORG,
      datePublished: day(g.published_at), dateModified: day(g.updated_at), mainEntityOfPage: url, image: `${SITE}/assets/trb-share-2026.png`,
      inLanguage: "en", abstract: g.answer, citation: sources.map((s) => s.url) },
    { "@type": "FAQPage", "@id": url + "#faq", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Guides", item: SITE + "/guides" },
      { "@type": "ListItem", position: 3, name: g.title, item: url }] },
  ];
  if (nancy) graph.push(NANCY);
  const byline = nancy
    ? `<img src="/assets/nancy-bello.jpg" alt="Nancy Bello" width="52" height="52"><div><b>By Nancy Bello</b>Founder, The Resident Bookkeeper · Updated <time datetime="${day(g.updated_at)}">${nice(g.updated_at)}</time></div>`
    : `<img src="/assets/trb-apple-touch-icon.png" alt="" width="52" height="52"><div><b>By The Resident Bookkeeper team</b>Updated <time datetime="${day(g.updated_at)}">${nice(g.updated_at)}</time></div>`;
  const authorBox = nancy
    ? `<div class="author"><img src="/assets/nancy-bello.jpg" alt="Nancy Bello" width="84" height="84" loading="lazy"><div><b>About the author</b><p>Nancy Bello is the founder of The Resident Bookkeeper. She has more than 15 years of accounting, finance and bookkeeping experience with consulting, mining, construction, manufacturing and e-commerce businesses, including multi-company books, bank reconciliations, payroll and tax support.</p></div></div>`
    : `<div class="author"><img src="/assets/trb-apple-touch-icon.png" alt="" width="84" height="84" loading="lazy"><div><b>About The Resident Bookkeeper</b><p>The Resident Bookkeeper is a remote bookkeeping company in Abuja, Nigeria, led by Nancy Bello, an accountant with more than 15 years of experience. We keep the books for small and growing businesses in Nigeria and around the world.</p></div></div>`;
  const src = sources.length ? `<h2>Sources</h2><ul class="ticks">${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener nofollow">${esc(s.title || s.url)}</a></li>`).join("")}</ul>` : "";
  const related = others.filter((o) => o.slug !== g.slug).slice(0, 5).map((o) => `<a href="/guides/${esc(o.slug)}">${esc(o.title)}</a>`).join("");
  const body = `<section class="gd-hero"><div class="wrap"><p class="crumb"><a href="/">Home</a> / <a href="/guides">Guides</a></p>
<h1>${esc(g.title)}</h1><div class="byline">${byline}</div></div></section>
<section class="gd"><div class="wrap"><article class="art">
<div class="answer"><strong>Short answer</strong>${esc(g.answer)}</div>
${g.body_html}
<h2 id="faq">Common questions</h2><div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
${src}
${authorBox}
<p class="updated">Last updated <time datetime="${day(g.updated_at)}">${nice(g.updated_at)}</time>. General information only, not tax or legal advice.</p>
<div class="related"><h2>More guides</h2>${related}<a href="/guides">All guides</a></div>
</article></div></section>`;
  return fill(tpl, { title: `${g.seo_title || g.title} | The Resident Bookkeeper`, description: g.description, url, ld: { "@context": "https://schema.org", "@graph": graph }, body });
}

function indexPage(tpl, list) {
  const url = SITE + "/guides";
  const cards = list.map((g) => `<a href="/guides/${esc(g.slug)}"><h2>${esc(g.title)}</h2><p>${esc(g.description)}</p><span>Read the guide</span></a>`).join("");
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": url + "#webpage", url, name: "Bookkeeping and tax record guides", publisher: ORG, inLanguage: "en",
      description: "Plain-language guides on bookkeeping, payroll and tax records for small businesses, by The Resident Bookkeeper.",
      dateModified: day(list.reduce((m, g) => (g.updated_at > m ? g.updated_at : m), "")),
      hasPart: list.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE}/guides/${g.slug}` })) },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Guides", item: url }] }] };
  const body = `<section class="gd-hero"><div class="wrap"><p class="crumb"><a href="/">Home</a> / Guides</p>
<h1>Bookkeeping and tax record guides</h1>
<p class="lede" style="margin-top:18px">Straight answers for business owners on bookkeeping costs, tax records, payroll and getting your books up to date, from Nancy Bello and the team at The Resident Bookkeeper.</p></div></section>
<section class="gd"><div class="wrap"><div class="glist">${cards || "<p>New guides are on the way.</p>"}</div></div></section>`;
  return fill(tpl, { title: "Bookkeeping and tax guides for small businesses | The Resident Bookkeeper", type: "website",
    description: "Plain-language guides on bookkeeping costs, company tax records, PAYE and catch-up bookkeeping for small businesses in Nigeria and worldwide.", url, ld, body });
}

const html = (s, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });

async function notFound(env, request) {
  const r = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
  if (r.ok) return new Response(r.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  return new Response("Page not found", { status: 404 });
}

export async function handleGuides(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const isGuide = path === "/guides" || path.startsWith("/guides/");
  if (!isGuide && path !== "/sitemap.xml" && path !== "/llms.txt") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (url.pathname !== "/guides" && url.pathname.endsWith("/") && isGuide) return Response.redirect(SITE + path, 301);

  const cache = caches.default;
  const key = new Request(SITE + path, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  let res;
  try {
    if (path === "/sitemap.xml" || path === "/llms.txt") {
      const base = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
      let text = await base.text();
      let list = [];
      try { list = await listGuides(env); } catch (e) { console.log("guides list failed", String(e)); }
      if (path === "/sitemap.xml") {
        const latest = day(list.reduce((m, g) => (g.updated_at > m ? g.updated_at : m), "")) || day(new Date().toISOString());
        const urls = `<url><loc>${SITE}/guides</loc><lastmod>${latest}</lastmod></url>\n` + list.map((g) => `<url><loc>${SITE}/guides/${g.slug}</loc><lastmod>${day(g.updated_at)}</lastmod></url>`).join("\n");
        text = text.replace("</urlset>", urls + "\n</urlset>");
        res = new Response(text, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
      } else {
        const lines = list.map((g) => `- ${g.title}: ${SITE}/guides/${g.slug}`).join("\n") || `- ${SITE}/guides`;
        text = text.replace("{{GUIDES}}", lines);
        res = new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
      }
    } else if (path === "/guides") {
      const [tpl, list] = await Promise.all([shell(env, request), listGuides(env)]);
      res = html(indexPage(tpl, list));
    } else {
      const slug = path.slice("/guides/".length);
      if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) return notFound(env, request);
      const [tpl, rows, list] = await Promise.all([shell(env, request), db(env, `status=eq.published&slug=eq.${slug}&select=*&limit=1`), listGuides(env)]);
      if (!rows.length) return notFound(env, request);
      res = html(guidePage(tpl, rows[0], list));
    }
  } catch (e) {
    console.log("guides error", String(e));
    return new Response("Our guides are briefly unavailable. Please try again in a minute.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" } });
  }
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
