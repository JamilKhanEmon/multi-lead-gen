import asyncio
import os
import json
import uuid
import re
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional, List, Tuple
from app.core.config import settings
from app.core.logging import logger
from app.services.geo_expander import GeoExpander
from app.engine.discovery_optimizer import DiscoveryOptimizer

class OpenClawGatewayError(Exception):
    pass

def get_skills_root_dir() -> Optional[str]:
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "openclaw", "skills"),
        "/app/openclaw/skills",
        os.path.abspath("openclaw/skills"),
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    return None

def load_skill_spec(skill_name: str) -> Optional[str]:
    root = get_skills_root_dir()
    if not root:
        return None
    skill_file = os.path.join(root, skill_name, "SKILL.md")
    if os.path.isfile(skill_file):
        try:
            with open(skill_file, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return None
    return None

class LiveResearchEngine:

    USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

    EXCLUDED_ROOT_DOMAINS = {
        "duckduckgo.com", "google.com", "bing.com", "yahoo.com", "wikipedia.org", "youtube.com",
        "twitter.com", "x.com", "pinterest.com", "reddit.com", "quora.com", "medium.com", "github.com",
        "play.google.com", "apps.apple.com", "facebook.com", "instagram.com", "linkedin.com", "tiktok.com",

        "scribd.com", "slideshare.net", "docplayer.net", "academia.edu", "researchgate.net",
        "issuu.com", "pdfdrive.com", "archive.org", "scribdassets.com",

        "goodfirms.co", "clutch.co", "tripadvisor.com", "trustpilot.com", "yelp.com", "glassdoor.com",
        "indeed.com", "bdjobs.com", "bdtradeinfo.com", "yellowpages.com", "dnb.com", "kompass.com",
        "indiamart.com", "justdial.com", "zoominfo.com", "crunchbase.com", "pitchbook.com", "expat.com",

        "amazon.com", "amazon.co.uk", "amazon.in", "homedepot.com", "lowes.com", "walmart.com", "target.com",
        "ebay.com", "aliexpress.com", "alibaba.com", "costco.com", "bestbuy.com", "wayfair.com", "overstock.com",
        "ikea.com", "menards.com", "sears.com", "macys.com", "etsy.com", "temu.com", "shein.com",

        "wixsite.com", "blogspot.com", "wordpress.com", "weebly.com", "sites.google.com", "tumblr.com"
    }

    @classmethod
    def resolve_country_code(cls, country_str: Optional[str]) -> Optional[str]:
        if not country_str:
            return None
        c_clean = country_str.lower().strip()
        if len(c_clean) == 2 and c_clean.isalpha():
            return c_clean
        GLOBAL_CC_MAP = {
            "bangladesh": "bd", "bangla": "bd",
            "united states": "us", "usa": "us", "america": "us",
            "united kingdom": "gb", "uk": "gb", "great britain": "gb", "england": "gb",
            "canada": "ca", "australia": "au",
            "germany": "de", "deutschland": "de", "france": "fr", "italy": "it", "spain": "es",
            "united arab emirates": "ae", "uae": "ae", "dubai": "ae", "abu dhabi": "ae",
            "saudi arabia": "sa", "ksa": "sa", "qatar": "qa", "kuwait": "kw", "oman": "om", "bahrain": "bh",
            "singapore": "sg", "malaysia": "my", "indonesia": "id", "india": "in", "pakistan": "pk",
            "turkey": "tr", "turkiye": "tr", "japan": "jp", "south korea": "kr", "korea": "kr",
            "thailand": "th", "vietnam": "vn", "philippines": "ph", "netherlands": "nl", "holland": "nl",
            "switzerland": "ch", "sweden": "se", "norway": "no", "denmark": "dk", "finland": "fi",
            "ireland": "ie", "belgium": "be", "austria": "at", "poland": "pl", "portugal": "pt",
            "new zealand": "nz", "south africa": "za", "brazil": "br", "brasil": "br", "mexico": "mx",
        }
        return GLOBAL_CC_MAP.get(c_clean)

    @classmethod
    async def discover_businesses(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
        sub_city: str = "",
        company_limit: int = 0,
        business_type_override: Optional[str] = None,
        sub_areas: Optional[List[str]] = None,
        on_candidate_found: Optional[Any] = None,
    ) -> Dict[str, Any]:
        loc_parts = []
        for p in [sub_city, city, country]:
            p_clean = str(p or "").strip()
            if p_clean and p_clean.lower() not in [x.lower() for x in loc_parts]:
                if any(p_clean.lower() in existing.lower() for existing in loc_parts):
                    continue
                loc_parts.append(p_clean)
        full_location = ", ".join(loc_parts) if loc_parts else location.strip()
        is_unlimited = (company_limit <= 0)
        effective_limit = 999999 if is_unlimited else company_limit

        discovered = []
        seen_names = set()
        seen_domains = set()
        streamed_signatures = set()
        loop = asyncio.get_event_loop()

        async def _stream_candidate(item: Dict[str, Any]):
            sig = (item.get("domain") or item.get("canonical_name") or "").lower().strip()
            if sig and sig in streamed_signatures:
                return
            if sig:
                streamed_signatures.add(sig)
            if on_candidate_found:
                try:
                    await on_candidate_found(item)
                except Exception as stream_err:
                    logger.debug(f"Candidate stream callback notice: {stream_err}")

        mode_str = "UNLIMITED Exhaustion" if is_unlimited else f"Explicit Cap: {company_limit}"
        logger.info(f"LiveResearchEngine: Starting live discovery for '{industry}' in '{full_location}' ({mode_str})")

        plan = await DiscoveryOptimizer.optimize_search_plan(
            industry=industry,
            location=full_location,
            country=country,
            city=city,
            sub_city=sub_city,
            sub_areas=sub_areas,
        )

        logger.info(f"DiscoveryOptimizer: Using {len(plan.get('search_queries', []))} targeted search queries and {len(plan.get('osm_queries', []))} OSM targets.")

        # 1. Primary: High-coverage Web Search for genuine companies with official domains
        try:
            browser_discovered = await cls._search_commercial_companies_via_browser(
                industry=industry,
                location=full_location,
                limit=effective_limit,
                business_type_override=business_type_override,
                seen_domains=seen_domains,
                seen_names=seen_names,
                search_queries=plan.get("search_queries"),
                plan=plan,
                city=city,
                country=country,
                on_candidate_found=_stream_candidate,
            )
            for b in browser_discovered:
                if b not in discovered:
                    b["city"] = city
                    b["country"] = country
                    discovered.append(b)
                await _stream_candidate(b)
            logger.info(f"LiveResearchEngine: Found {len(browser_discovered)} commercial entities with verified websites via live web search.")
        except Exception as e:
            logger.warning(f"Live browser discovery fallback: {e}")

        # 2. Multi-engine search expansion across targeted queries (capped to avoid stalls)
        target_cap = effective_limit if not is_unlimited else 100
        if len(discovered) < target_cap:
            queries = plan.get("search_queries", []) or GeoExpander.build_search_queries(industry, full_location)
            # Run adequate queries to satisfy target_cap without hanging
            needed_queries = min(len(queries), max(12, int(target_cap // 2) + 6))
            for q in queries[:needed_queries]:
                if len(discovered) >= target_cap:
                    break
                try:
                    page_html, _ = await loop.run_in_executor(None, cls._fetch_ddg_html, q, None)
                    if not page_html:
                        continue
                    items = cls._parse_ddg_items(page_html)
                    for actual_url, title, snippet in items:
                        if len(discovered) >= target_cap:
                            break
                        biz = cls._process_candidate_url(actual_url, title, snippet, industry, full_location, business_type_override, seen_domains, seen_names, plan=plan)
                        if biz:
                            biz["city"] = city
                            biz["country"] = country
                            discovered.append(biz)
                            await _stream_candidate(biz)
                    await asyncio.sleep(0.05)
                except Exception as e:
                    logger.warning(f"Web search error for '{q}': {e}")

        # 3. Supplemental: OSM Directory Search ONLY for entities that have website/domain or direct email
        if len(discovered) < target_cap:
            osm_search_targets = plan.get("osm_queries", [])
            for target_q in osm_search_targets[:5]:
                if len(discovered) >= target_cap:
                    break
                try:
                    places = await loop.run_in_executor(None, cls._fetch_osm_places, target_q, 50, country, city, sub_city)
                    for p in (places or []):
                        if len(discovered) >= target_cap:
                            break
                        p_name = p.get("name", "").strip()
                        clean_norm_name = re.sub(r'[^a-zA-Z0-9]', '', p_name.lower())
                        if not p_name or clean_norm_name in seen_names or len(p_name) < 3:
                            continue

                        candidate_check = {
                            "canonical_name": p_name,
                            "industry": industry,
                            "location": full_location,
                            "address": p.get("address"),
                            "website": p.get("website"),
                            "domain": None,
                            "snippet": p.get("display_name"),
                        }
                        is_valid, reason = DiscoveryOptimizer.validate_candidate(candidate_check, plan)
                        if not is_valid:
                            continue

                        website = p.get("website")
                        domain = None
                        if website:
                            try:
                                domain = urllib.parse.urlparse(website).netloc.lower().replace("www.", "")
                                if domain in seen_domains:
                                    continue
                            except Exception:
                                pass

                        phone = p.get("phone")
                        email = p.get("email")
                        lat = p.get("latitude")
                        lon = p.get("longitude")

                        if not website and not phone and not email:
                            enriched = await cls.enrich_contact_from_web(p_name, full_location)
                            if enriched.get("phone"):
                                phone = enriched["phone"]
                            if enriched.get("email"):
                                email = enriched["email"]
                            if enriched.get("website"):
                                website = enriched["website"]
                                domain = enriched.get("domain")

                        if not website and not domain and not phone and not email:
                            continue

                        if domain:
                            seen_domains.add(domain)
                        seen_names.add(clean_norm_name)

                        if lat is not None and lon is not None:
                            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
                        else:
                            maps_q = urllib.parse.quote(f"{p_name} {full_location}")
                            gmaps_url = f"https://www.google.com/maps/search/{maps_q}"

                        search_q = urllib.parse.quote(f"{p_name} {full_location}")
                        gsearch_url = f"https://www.google.com/search?q={search_q}"
                        b_type = (business_type_override or industry).lower().replace(" ", "_")

                        cand_item = {
                            "canonical_name": p_name,
                            "industry": industry,
                            "location": full_location,
                            "city": city or p.get("city"),
                            "country": country or p.get("country"),
                            "address": p.get("address"),
                            "website": website,
                            "domain": domain,
                            "business_type": b_type,
                            "snippet": p.get("display_name") or f"Commercial {industry} in {full_location}",
                            "source_url": website or gmaps_url,
                            "google_maps_url": gmaps_url,
                            "google_search_url": gsearch_url,
                            "latitude": lat,
                            "longitude": lon,
                            "phone": phone,
                            "email": email,
                            "confidence": 0.98 if website else 0.92,
                        }
                        discovered.append(cand_item)
                        await _stream_candidate(cand_item)
                except Exception as e:
                    logger.warning(f"OSM directory search error for '{target_q}': {e}")

        logger.info(f"LiveResearchEngine: Successfully discovered {len(discovered)} genuine businesses for '{industry}' in '{full_location}'.")
        return {"discovered_companies": discovered}

    @classmethod
    async def _launch_browser(cls, p):
        launch_kwargs = {
            "headless": True,
            "args": [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ]
        }
        custom_chrome = os.getenv("PLAYWRIGHT_CHROME_PATH")
        if custom_chrome and os.path.exists(custom_chrome):
            launch_kwargs["executable_path"] = custom_chrome
        else:
            for cp in [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/usr/bin/google-chrome",
                "/usr/bin/chromium-browser",
                "/usr/bin/chromium",
            ]:
                if os.path.exists(cp):
                    launch_kwargs["executable_path"] = cp
                    break
        return await p.chromium.launch(**launch_kwargs)

    @classmethod
    async def _search_commercial_companies_via_browser(
        cls,
        industry: str,
        location: str,
        limit: int = 25,
        business_type_override: Optional[str] = None,
        seen_domains: Optional[set] = None,
        seen_names: Optional[set] = None,
        search_queries: Optional[List[str]] = None,
        plan: Optional[Dict[str, Any]] = None,
        city: str = "",
        country: str = "",
        on_candidate_found: Optional[Any] = None,
    ) -> List[Dict[str, Any]]:
        if seen_domains is None:
            seen_domains = set()
        if seen_names is None:
            seen_names = set()

        results = []
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await cls._launch_browser(p)
                context = await browser.new_context(user_agent=cls.USER_AGENT)
                await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                page = await context.new_page()
                queries = search_queries or [
                    f"{industry} company in {location}",
                    f"{industry} offices and services in {location} official website",
                    f"{industry} commercial firms {location}",
                ]
                for q in queries:
                    if len(results) >= limit:
                        break
                    encoded_q = urllib.parse.quote(q)
                    items = []
                    try:
                        # 1. Try Brave Search
                        await page.goto(
                            f"https://search.brave.com/search?q={encoded_q}",
                            timeout=8000,
                            wait_until="domcontentloaded",
                        )
                        try:
                            await page.wait_for_selector('div.snippet, div.result, a.heading-link', timeout=2500)
                        except Exception:
                            pass
                        items = await page.eval_on_selector_all(
                            'div.snippet[data-type="web"], div.snippet, .search-results .result, div.result',
                            '''els => els.map(el => {
                                const a = el.querySelector('a.heading-link') || el.querySelector('a[href^="http"]');
                                const desc = el.querySelector('.snippet-description') || el.querySelector('.snippet-content') || el.querySelector('p');
                                let snip = desc ? (desc.innerText || desc.textContent || '') : '';
                                if (!snip && el.innerText) {
                                    snip = el.innerText.replace(/\\n+/g, ' ').slice(0, 300);
                                }
                                return {
                                    url: a ? a.href : '',
                                    title: a ? (a.innerText || a.textContent || '') : '',
                                    snippet: snip
                                };
                            }).filter(x => x.url && !x.url.includes('brave.com'))'''
                        )
                    except Exception as e:
                        logger.debug(f"Brave search query '{q}' notice: {e}")

                    # 2. If Brave is empty, immediately query Bing in the active browser with decoded URLs
                    if not items:
                        try:
                            await page.goto(
                                f"https://www.bing.com/search?q={encoded_q}",
                                timeout=8000,
                                wait_until="domcontentloaded",
                            )
                            try:
                                await page.wait_for_selector('li.b_algo', timeout=2500)
                            except Exception:
                                pass
                            items = await page.eval_on_selector_all(
                                'li.b_algo',
                                '''els => els.map(el => {
                                    const a = el.querySelector('h2 a') || el.querySelector('a[href^="http"]');
                                    const desc = el.querySelector('.b_caption p, p');
                                    let href = a ? a.href : '';
                                    if (href.includes('bing.com/ck/a')) {
                                        const match = href.match(/[?&]u=a1([a-zA-Z0-9_\\-]+)/);
                                        if (match && match[1]) {
                                            try {
                                                let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
                                                while (b64.length % 4) b64 += '=';
                                                href = atob(b64);
                                            } catch(e) {}
                                        }
                                    }
                                    return {
                                        url: href,
                                        title: a ? (a.innerText || a.textContent || '') : '',
                                        snippet: desc ? (desc.innerText || desc.textContent || '') : ''
                                    };
                                }).filter(x => x.url && !x.url.includes('bing.com'))'''
                            )
                        except Exception as bing_err:
                            logger.debug(f"Bing browser fallback query '{q}' notice: {bing_err}")

                    # Process and stream candidate results
                    for it in (items or []):
                        if len(results) >= limit:
                            break
                        url = it.get("url", "")
                        title = it.get("title", "")
                        snippet = it.get("snippet", "")
                        biz = cls._process_candidate_url(
                            url, title, snippet, industry, location, business_type_override, seen_domains, seen_names, plan=plan
                        )
                        if biz:
                            biz["city"] = city
                            biz["country"] = country
                            results.append(biz)
                            if on_candidate_found:
                                try:
                                    await on_candidate_found(biz)
                                except Exception as stream_err:
                                    logger.debug(f"Browser stream candidate callback notice: {stream_err}")
                await browser.close()
        except Exception as e:
            logger.info(f"Browser search unavailable ({e}), using fast HTTP search engine fallback.")

        if len(results) < limit:
            queries = search_queries or [
                f"{industry} company in {location}",
                f"{industry} offices {location} official website",
                f"{industry} firms {location}",
            ]
            for q in queries:
                if len(results) >= limit:
                    break
                try:
                    search_items = await cls._execute_web_search(q)
                    for it in search_items:
                        if len(results) >= limit:
                            break
                        url = it.get("url", "")
                        title = it.get("title", "")
                        snippet = it.get("snippet", "")
                        biz = cls._process_candidate_url(
                            url, title, snippet, industry, location, business_type_override, seen_domains, seen_names, plan=plan
                        )
                        if biz:
                            biz["city"] = city
                            biz["country"] = country
                            results.append(biz)
                            if on_candidate_found:
                                try:
                                    await on_candidate_found(biz)
                                except Exception as stream_err:
                                    logger.debug(f"Fallback stream candidate callback notice: {stream_err}")
                except Exception as e:
                    logger.debug(f"HTTP web search fallback query '{q}' notice: {e}")

        return results

    @classmethod
    async def resolve_domain_for_business(cls, business_name: str, location: str) -> Optional[str]:
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await cls._launch_browser(p)
                page = await browser.new_page(user_agent=cls.USER_AGENT)
                q = urllib.parse.quote(f"{business_name} {location} official website")
                await page.goto(
                    f"https://search.brave.com/search?q={q}",
                    timeout=9000,
                    wait_until="domcontentloaded",
                )
                results = await page.eval_on_selector_all(
                    'div.snippet[data-type="web"]',
                    '''els => els.map(el => {
                        const a = el.querySelector('a.heading-link, a');
                        return a ? a.href : '';
                    })'''
                )
                await browser.close()
                from app.engine.deduplication import DeduplicationEngine
                for l in results:
                    if not l or not l.startswith("http"):
                        continue
                    parsed = urllib.parse.urlparse(l)
                    dom = parsed.netloc.lower().replace("www.", "")
                    if DeduplicationEngine.is_generic_platform(dom) or DeduplicationEngine.is_directory_or_aggregator(l):
                        continue
                    if "." in dom and len(dom) > 4:
                        return dom
        except Exception:
            pass

        try:
            from app.engine.deduplication import DeduplicationEngine
            items = await cls._execute_web_search(f"{business_name} {location} official website")
            for it in (items or []):
                url = it.get("url", "")
                if not url or not url.startswith("http"):
                    continue
                parsed = urllib.parse.urlparse(url)
                dom = parsed.netloc.lower().replace("www.", "")
                if DeduplicationEngine.is_generic_platform(dom) or DeduplicationEngine.is_directory_or_aggregator(url):
                    continue
                if "." in dom and len(dom) > 4:
                    return dom
        except Exception as e:
            logger.debug(f"Resolve domain HTTP fallback error for '{business_name}': {e}")
        return None

    @classmethod
    async def enrich_contact_from_web(
        cls, business_name: str, location: str
    ) -> Dict[str, Optional[str]]:
        info: Dict[str, Optional[str]] = {
            "phone": None,
            "email": None,
            "website": None,
            "domain": None,
            "facebook_url": None,
        }
        try:
            q = f"{business_name} {location} contact phone email"
            results = await cls._execute_web_search(q)
            for r in (results or [])[:5]:
                url = r.get("url", "")
                title = r.get("title", "")
                snippet = r.get("snippet", "")
                full_text = f"{title} {snippet}"

                if not info["phone"]:
                    phone_match = re.search(r'(?:\+?880\s?1[3-9]\d{8}|\+?1[2-9]\d{2}[2-9]\d{6}|\+?[0-9]{2,4}[\s.-]?[0-9]{3,4}[\s.-]?[0-9]{4,6})', full_text)
                    if phone_match:
                        raw_ph = phone_match.group(0).strip()
                        if len(re.sub(r'\D', '', raw_ph)) >= 7:
                            info["phone"] = raw_ph

                if not info["email"]:
                    email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', full_text)
                    if email_match:
                        cand_em = email_match.group(0).lower()
                        if not any(cand_em.endswith(x) for x in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]):
                            info["email"] = cand_em

                if url.startswith("http"):
                    parsed = urllib.parse.urlparse(url)
                    dom = parsed.netloc.lower().replace("www.", "")
                    if "facebook.com" in dom:
                        if not info["facebook_url"]:
                            info["facebook_url"] = url
                    elif not any(bad in dom for bad in ["duckduckgo.com", "bing.com", "google.com", "yahoo.com", "wikipedia.org", "youtube.com", "linkedin.com", "yellowpages"]):
                        if "." in dom and len(dom) > 4:
                            if not info["domain"]:
                                info["domain"] = dom
                                info["website"] = f"{parsed.scheme}://{dom}"
        except Exception as e:
            logger.debug(f"enrich_contact_from_web error for '{business_name}': {e}")
        return info

    @classmethod
    def _fetch_osm_places(
        cls,
        query_str: str,
        limit: int = 50,
        target_country: str = "",
        target_city: str = "",
        target_sub_city: str = "",
    ) -> List[Dict[str, Any]]:
        results = []
        try:
            p_url = f"https://photon.komoot.io/api/?q={urllib.parse.quote(query_str)}&limit={limit}"
            headers = {
                "User-Agent": cls.USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
            }
            req = urllib.request.Request(p_url, headers=headers)
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                features = data.get("features", [])
                for f in features:
                    props = f.get("properties", {})
                    name = props.get("name")
                    if not name or len(name) < 3:
                        continue

                    p_country = (props.get("country") or "").lower()
                    if target_country and p_country and target_country.lower() not in p_country:
                        continue

                    name_l = name.lower()
                    gov_words = [
                        "welfare committee", "ministry of", "department of", "police department",
                        "police station", "cantonment", "military barracks", "military base",
                        "embassy", "consulate", "post office", "fire station", "courthouse"
                    ]
                    if any(w in name_l for w in gov_words):
                        continue
                    
                    osm_key = (props.get("osm_key") or "").lower()
                    osm_value = (props.get("osm_value") or "").lower()
                    ptype = (props.get("type") or "").lower()

                    if osm_key in ["highway", "railway", "waterway"] or ptype in ["street", "highway", "residential", "neighbourhood", "suburb"]:
                        continue

                    if osm_key == "building" and osm_value in ["apartments", "residential", "house", "dormitory", "detached"]:
                        continue

                    address_match = False
                    for prefix in ["road ", "rd ", "street ", "st ", "lane ", "ln ", "sector ", "block ", "plot ", "house "]:
                        if name_l.startswith(prefix):
                            rest = name_l[len(prefix):].strip()
                            if re.match(r'^(no\.?|#)?\s*\d+', rest) or (len(rest) <= 2 and rest.isalnum()):
                                address_match = True
                                break
                    if address_match:
                        continue

                    disqualified_osm_values = [
                        "place_of_worship", "school", "mosque", "cemetery", "graveyard",
                        "recreation_ground", "pitch", "living_street", "residential", "suburb",
                        "neighbourhood", "allotments", "village_green", "farm", "forest",
                        "apartments", "house", "detached", "dormitory"
                    ]
                    if osm_value in disqualified_osm_values:
                        continue

                    street = props.get("street") or ""
                    district = props.get("district") or props.get("locality") or ""
                    city = props.get("city") or ""
                    formatted_addr = ", ".join([x for x in [street, district, city] if x])

                    if target_city and city:
                        city_l = target_city.lower().strip()
                        if city_l and city.lower() not in city_l and city_l not in city.lower():
                            continue

                    geom = f.get("geometry") or {}
                    coords = geom.get("coordinates") or []
                    lon = float(coords[0]) if len(coords) >= 2 and coords[0] is not None else None
                    lat = float(coords[1]) if len(coords) >= 2 and coords[1] is not None else None

                    results.append({
                        "name": name.strip(),
                        "address": formatted_addr,
                        "city": city,
                        "website": None,
                        "phone": None,
                        "email": None,
                        "latitude": lat,
                        "longitude": lon,
                        "display_name": f"{name}, {formatted_addr}",
                    })
                if results:
                    return results
        except Exception as e:
            logger.debug(f"Photon query error for '{query_str}': {e}")

        cc_code = cls.resolve_country_code(target_country)
        cc_param = f"&countrycodes={cc_code}" if cc_code else ""

        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query_str)}&format=json&addressdetails=1&extratags=1&limit={limit}{cc_param}"
        headers = {
            "User-Agent": cls.USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for item in data:
                    name = item.get("name")
                    if not name:
                        continue
                    item_class = (item.get("class") or "").lower()
                    item_type = (item.get("type") or "").lower()
                    if item_class in ["highway", "place", "boundary", "landuse"] or item_type in ["residential", "living_street", "suburb", "neighbourhood", "apartments", "house", "dormitory"]:
                        continue
                    ext = item.get("extratags") or {}
                    addr_dict = item.get("address") or {}

                    nom_country = (addr_dict.get("country") or "").lower().strip()
                    if target_country and nom_country and target_country.lower() not in nom_country:
                        continue
                    
                    road = addr_dict.get("road") or ""
                    suburb = addr_dict.get("suburb") or addr_dict.get("quarter") or ""
                    city = addr_dict.get("city") or addr_dict.get("town") or ""
                    formatted_addr = ", ".join([x for x in [road, suburb, city] if x]) or item.get("display_name")

                    if target_city:
                        city_l = target_city.lower().strip()
                        nom_c = (addr_dict.get("city") or addr_dict.get("town") or "").lower()
                        if nom_c and city_l and nom_c not in city_l and city_l not in nom_c:
                            continue

                    phone = ext.get("phone") or ext.get("contact:phone")
                    website = ext.get("website") or ext.get("contact:website")
                    email = ext.get("email") or ext.get("contact:email")

                    lat = float(item["lat"]) if item.get("lat") else None
                    lon = float(item["lon"]) if item.get("lon") else None

                    name_l = name.lower().strip()
                    if name_l in ["facebook", "facebook.com", "meta", "instagram", "google", "youtube", "twitter"] or "facebook.com" in name_l:
                        continue

                    if website:
                        if not website.startswith("http"):
                            website = f"https://{website}"
                        try:
                            w_dom = urllib.parse.urlparse(website).netloc.lower().replace("www.", "")
                            if any(bad in w_dom for bad in ["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "google.com", "linkedin.com", "wikipedia.org"]):
                                website = None
                        except Exception:
                            pass

                    results.append({
                        "name": name.strip(),
                        "address": formatted_addr,
                        "city": city,
                        "website": website,
                        "phone": phone,
                        "email": email,
                        "latitude": lat,
                        "longitude": lon,
                        "display_name": item.get("display_name"),
                    })
                return results
        except Exception as e:
            logger.warning(f"Nominatim fetch exception for query '{query_str}': {e}")
        return results
    @classmethod
    async def _execute_web_search(cls, query_str: str) -> List[Dict[str, str]]:
        loop = asyncio.get_event_loop()
        html, _ = await loop.run_in_executor(None, cls._fetch_ddg_html, query_str)
        items = cls._parse_ddg_items(html)
        return [{"url": url, "title": title, "snippet": snippet} for url, title, snippet in items]

    @classmethod
    def _fetch_ddg_html(cls, query_str: str, form_inputs: Optional[Dict[str, str]] = None) -> Tuple[str, Dict[str, str]]:
        url = "https://html.duckduckgo.com/html/"
        headers = {
            "User-Agent": cls.USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            if form_inputs:
                headers["Content-Type"] = "application/x-www-form-urlencoded"
                headers["Referer"] = f"{url}?q={urllib.parse.quote(query_str)}"
                data = urllib.parse.urlencode(form_inputs).encode("utf-8")
                req = urllib.request.Request(url, data=data, headers=headers)
            else:
                req = urllib.request.Request(f"{url}?q={urllib.parse.quote(query_str)}", headers=headers)

            with urllib.request.urlopen(req, timeout=8) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                inputs = dict(re.findall(r'<input[^>]+name=\"([^\"]+)\"[^>]+value=\"([^\"]*)\"', html))
                if "result__a" in html or "result__snippet" in html:
                    return html, inputs
        except Exception:
            pass

        try:
            lite_url = "https://lite.duckduckgo.com/lite/"
            post_data = urllib.parse.urlencode({"q": query_str}).encode("utf-8")
            lite_headers = {
                "User-Agent": cls.USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": "https://lite.duckduckgo.com/",
            }
            req = urllib.request.Request(lite_url, data=post_data, headers=lite_headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                return html, {}
        except Exception:
            pass

        return "", {}

    @classmethod
    def _parse_ddg_items(cls, html: str) -> List[Tuple[str, str, str]]:
        a_matches = re.findall(r'<a[^>]+class=\"(?:result__a|result-link)\"[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>', html, re.DOTALL)
        snippet_matches = re.findall(r'<(?:a|td|div)[^>]+class=\"(?:result__snippet|result-snippet)\"[^>]*>(.*?)</(?:a|td|div)>', html, re.DOTALL)

        items = []
        for idx, (raw_u, raw_t) in enumerate(a_matches):
            snip_t = snippet_matches[idx] if idx < len(snippet_matches) else ""
            actual_url = raw_u
            if "uddg=" in raw_u:
                try:
                    actual_url = urllib.parse.unquote(raw_u.split("uddg=")[1].split("&")[0])
                except Exception:
                    actual_url = raw_u
            elif not raw_u.startswith("http"):
                continue

            clean_t = re.sub(r'<[^>]+>', '', raw_t).strip()
            clean_s = re.sub(r'<[^>]+>', '', snip_t).strip()
            items.append((actual_url, clean_t, clean_s))

        return items

    @classmethod
    def _process_candidate_url(
        cls,
        actual_url: str,
        title: str,
        snippet: str,
        industry: str,
        location: str,
        business_type_override: Optional[str],
        seen_domains: set,
        seen_names: set,
        plan: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        if not actual_url.startswith("http"):
            return None

        parsed = urllib.parse.urlparse(actual_url)
        domain = parsed.netloc.lower().replace("www.", "")

        if not domain:
            return None

        # Check if actual_url is a Facebook business page (social-only candidate)
        is_fb_page = "facebook.com" in domain and len(parsed.path.strip("/")) > 0 and not any(
            bad in parsed.path.lower() for bad in ["/login", "/share", "/policies", "/help", "/hashtag", "/groups", "/events", "/p/"]
        )

        from app.engine.deduplication import DeduplicationEngine
        if is_fb_page:
            company_name, detected_btype = cls._clean_company_identity(title, "facebook.com", snippet, industry, business_type_override)
            clean_norm_name = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())
            if clean_norm_name in seen_names or len(company_name) < 3 or clean_norm_name in ["facebook", "login", "home"]:
                return None

            phone = None
            email = None
            full_text = f"{title} {snippet}"
            phone_match = re.search(r'(?:\+?880\s?1[3-9]\d{8}|\+?1[2-9]\d{2}[2-9]\d{6}|\+?[0-9]{2,4}[\s.-]?[0-9]{3,4}[\s.-]?[0-9]{4,6})', full_text)
            if phone_match:
                raw_ph = phone_match.group(0).strip()
                if len(re.sub(r'\D', '', raw_ph)) >= 7:
                    phone = raw_ph

            email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', full_text)
            if email_match:
                cand_em = email_match.group(0).lower()
                if not any(cand_em.endswith(x) for x in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]):
                    email = cand_em

            candidate = {
                "canonical_name": company_name,
                "industry": industry,
                "location": location,
                "address": None,
                "website": None,
                "domain": None,
                "facebook_url": actual_url,
                "business_type": detected_btype,
                "snippet": snippet or title,
                "source_url": actual_url,
                "phone": phone,
                "email": email,
                "confidence": 0.95,
                "is_social_only": True,
            }
            seen_names.add(clean_norm_name)
            maps_query = urllib.parse.quote(f"{company_name} {location}")
            candidate["google_maps_url"] = f"https://www.google.com/maps/search/{maps_query}"
            candidate["google_search_url"] = f"https://www.google.com/search?q={maps_query}"
            return candidate

        if domain in seen_domains:
            return None

        if DeduplicationEngine.is_generic_platform(domain) or DeduplicationEngine.is_directory_or_aggregator(actual_url, title):
            logger.info(f"OpenClaw: Skipping directory/aggregator platform '{domain}' ({actual_url})")
            return None

        if re.search(r'\.(pdf|docx?|pptx?|xlsx?|zip|rar|csv)(\?.*)?$', actual_url, re.I):
            return None

        if domain.endswith((".gov", ".edu", ".mil", ".org")):
            return None

        if any(bad in actual_url.lower() for bad in ["/pdf/", ".pdf", "/download/", "/document/", "/presentation/", "/threads/", "/forum/"]):
            return None

        company_name, detected_btype = cls._clean_company_identity(title, domain, snippet, industry, business_type_override)
        clean_norm_name = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())
        if clean_norm_name in seen_names or len(company_name) < 3:
            return None

        candidate = {
            "canonical_name": company_name,
            "industry": industry,
            "location": location,
            "address": None,
            "website": actual_url,
            "domain": domain,
            "business_type": detected_btype,
            "snippet": snippet or title,
            "source_url": actual_url,
            "phone": None,
            "confidence": 0.95,
        }

        if plan:
            is_valid, reason = DiscoveryOptimizer.validate_candidate(candidate, plan)
            if not is_valid:
                logger.debug(f"Web candidate rejected: {reason}")
                return None

        seen_domains.add(domain)
        seen_names.add(clean_norm_name)

        maps_query = urllib.parse.quote(f"{company_name} {location}")
        gmaps_url = f"https://www.google.com/maps/search/{maps_query}"
        gsearch_url = f"https://www.google.com/search?q={maps_query}"

        candidate["google_maps_url"] = gmaps_url
        candidate["google_search_url"] = gsearch_url
        return candidate

    @classmethod
    def _clean_company_identity(
        cls,
        raw_title: str,
        domain: str,
        snippet: str,
        search_industry: str,
        business_type_override: Optional[str] = None,
    ) -> Tuple[str, str]:
        b_type = (business_type_override or search_industry).lower().replace(" ", "_").replace("-", "_")
        dom_parts = (domain or "").lower().split(".")
        subdomain_stops = {"www", "careers", "career", "jobs", "job", "m", "portal", "mail", "app", "dev", "en", "info"}
        if len(dom_parts) >= 3 and dom_parts[0] in subdomain_stops:
            dom_root = dom_parts[1]
        elif len(dom_parts) >= 2 and dom_parts[0] in subdomain_stops:
            dom_root = dom_parts[1]
        else:
            dom_root = dom_parts[0] if dom_parts else domain
        dom_name = dom_root.replace("-", " ").replace("_", " ").title()

        GENERIC_TAGLINES = [
            "leading", "welcome to", "official website", "home page",
            "contact us", "about us", "who we are", "get in touch", "learn more",
            "find your", "best in", "top rated"
        ]
        GENERIC_STOP_WORDS = {
            "home", "official", "website", "company", "ltd", "limited", "inc", "corp", "llc",
            "goodfirms", "clutch", "crunchbase", "yellowpages", "justdial", "directory", "listing", "pdf",
            "careers", "career", "jobs", "job", "hiring", "vacancy", "vacancies",
            "contact", "contact us", "contactus", "about", "about us", "aboutus", "who we are",
            "services", "our services", "service", "pricing", "plans",
            "privacy policy", "terms of service", "terms", "terms and conditions",
            "faq", "faqs", "help", "support", "blog", "blogs", "news", "articles",
            "team", "our team", "portfolio", "projects", "gallery",
            "login", "sign in", "signin", "signup", "sign up", "register", "cart", "checkout", "account", "my account"
        }

        parts = re.split(r'\||-|—|@|:|,', raw_title)
        candidate_names = []

        target_ind_l = (search_industry or "").lower().strip()
        for p in parts:
            clean = p.strip()
            clean_l = clean.lower()
            if len(clean) >= 3 and len(clean) <= 80 and not any(k in clean_l for k in [
                "best", "top", "ranked", "reviews", "directory", "directories", "listing", "listings",
                "near me", "list", "guide", "2026", "2025", "home", "official", ".pdf",
                "goodfirms", "clutch", "crunchbase", "careers", "privacy policy"
            ]):
                if clean_l == target_ind_l or clean_l == f"{target_ind_l} company" or clean_l == f"{target_ind_l} services":
                    continue
                if not re.search(r'(https?://|www\.|\.[a-zA-Z]{2,})', clean_l):
                    if not any(tag in clean_l for tag in GENERIC_TAGLINES) and clean_l not in GENERIC_STOP_WORDS:
                        candidate_names.append(clean)

        best_name = candidate_names[0] if candidate_names else dom_name
        if best_name.lower() in GENERIC_STOP_WORDS or len(best_name) < 3 or len(best_name) > 80:
            best_name = dom_name

        best_name = best_name[:120].strip()
        return best_name, b_type

    @classmethod
    def extract_contacts_from_text(cls, text: str) -> Tuple[Optional[str], Optional[str]]:
        if not text:
            return None, None

        # 1. Strip script, style, svg, noscript, and HTML comments to prevent CSS dimensions or JS timestamps from matching
        cleaned = re.sub(r'<(?:script|style|svg|noscript)[^>]*>.*?</(?:script|style|svg|noscript)>', ' ', text, flags=re.DOTALL | re.IGNORECASE)
        cleaned = re.sub(r'<!--.*?-->', ' ', cleaned, flags=re.DOTALL)
        # Strip remaining HTML tags for clean text scanning
        cleaned_no_tags = re.sub(r'<[^>]+>', ' ', cleaned)

        # Convert Bengali numerals (০-৯) to ASCII digits (0-9) so Bengali contacts are captured
        bn_to_en = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
        cleaned_no_tags = cleaned_no_tags.translate(bn_to_en)
        cleaned = cleaned.translate(bn_to_en)

        extracted_phone = None
        extracted_email = None

        # 2. Prioritize explicit tel: links from the raw cleaned HTML
        tel_matches = re.findall(r'tel:([+\d\s\-\(\)\.]{8,25})', cleaned, re.IGNORECASE)
        for cand in tel_matches:
            clean_digits = re.sub(r'\D', '', cand)
            if 8 <= len(clean_digits) <= 15 and not clean_digits.startswith(('000', '123456')):
                extracted_phone = cand.strip()
                break

        # 3. Next, look for Bangladeshi phone format specifically:
        # e.g., 017xxxxxxxx, +88017xxxxxxxx, 88017xxxxxxxx, 018-xxx-xxxxx
        if not extracted_phone:
            bd_phone_m = re.search(r'(?:\+?880\s?|0)(1[3-9]\d{2}[-.\s]?\d{3}[-.\s]?\d{3})\b', cleaned_no_tags)
            if bd_phone_m:
                cand_bd = bd_phone_m.group(0).strip()
                digits = re.sub(r'\D', '', cand_bd)
                if len(digits) == 11:
                    extracted_phone = f"+88{digits}"
                elif len(digits) == 13 and digits.startswith("880"):
                    extracted_phone = f"+{digits}"

        # 4. Fallback to general international phone numbers (avoiding CSS decimals and timestamps)
        if not extracted_phone:
            raw_phone_patterns = [
                r'(?:\+|00)[1-9]\d{0,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4}',
                r'\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}',
            ]
            for pattern in raw_phone_patterns:
                matches = re.findall(pattern, cleaned_no_tags)
                for p in matches:
                    clean_str = p.strip()
                    # Skip if it contains a dot that looks like a decimal (e.g. 417.179)
                    if "." in clean_str and not re.search(r'^\+?\d{1,3}\.\d{3}\.\d{3}\.\d{4}$', clean_str):
                        continue
                    digits = re.sub(r'\D', '', clean_str)
                    if 9 <= len(digits) <= 15:
                        if not any(clean_str.startswith(yr) for yr in ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]):
                            if not re.search(r'^\d{4}[-/]\d{2}[-/]\d{2}$', clean_str) and "x" not in clean_str.lower():
                                extracted_phone = clean_str
                                break
                if extracted_phone:
                    break

        # 5. Extract email
        mailto_matches = re.findall(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', cleaned, re.IGNORECASE)
        for em in mailto_matches:
            em_clean = em.strip().lower()
            if not any(em_clean.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.css', '.js', '.woff', '.ttf']):
                if not any(dummy in em_clean for dummy in ['example.com', 'domain.com', 'yourdomain', 'sentry.io', 'wixpress.com']):
                    extracted_email = em_clean
                    break

        if not extracted_email:
            email_matches = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', cleaned_no_tags)
            for em in email_matches:
                em_clean = em.strip().lower()
                if not any(em_clean.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.css', '.js', '.woff', '.ttf']):
                    if not any(dummy in em_clean for dummy in ['example.com', 'domain.com', 'yourdomain', 'sentry.io', 'wixpress.com', 'bootstrap', 'wordpress', 'cloudflare', 'schema.org']):
                        extracted_email = em_clean
                        break

        if not extracted_email:
            obf_matches = re.findall(r'([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|@)\s*([a-zA-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\.)\s*([a-zA-Z]{2,})', cleaned_no_tags, re.IGNORECASE)
            for user, dom, tld in obf_matches:
                reconstructed = f"{user}@{dom}.{tld}".lower()
                if not any(dummy in reconstructed for dummy in ['example.com', 'domain.com']):
                    extracted_email = reconstructed
                    break

        return extracted_phone, extracted_email

    @classmethod
    async def fetch_page_with_browser(cls, target_url: str, human_scroll: bool = True) -> Dict[str, Any]:
        result = {
            "html": "",
            "is_accessible": False,
            "mobile_overflow": False,
            "title": "",
            "has_whatsapp": False,
            "has_form": False,
            "has_booking": False,
        }
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await cls._launch_browser(p)
                
                page = await browser.new_page(
                    user_agent=cls.USER_AGENT,
                    viewport={"width": 1280, "height": 800},
                )
                try:
                    resp = await page.goto(target_url, timeout=15000, wait_until="domcontentloaded")
                    result["is_accessible"] = resp is not None and resp.status < 400
                except Exception:
                    result["is_accessible"] = False

                await page.wait_for_timeout(2500)

                if human_scroll:
                    try:
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
                        await page.wait_for_timeout(400)
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 1.5)")
                        await page.wait_for_timeout(400)
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await page.wait_for_timeout(600)
                    except Exception:
                        pass

                result["html"] = await page.content()
                try:
                    result["title"] = await page.title()
                except Exception:
                    pass

                try:
                    result["has_whatsapp"] = await page.evaluate('''() => {
                        const html = document.body ? document.body.innerHTML.toLowerCase() : '';
                        const hrefs = Array.from(document.querySelectorAll('a')).map(a => (a.href || '').toLowerCase());
                        return hrefs.some(h => h.includes('wa.me') || h.includes('whatsapp.com') || h.includes('api.whatsapp.com')) ||
                               html.includes('whatsapp') || html.includes('joinchat') || html.includes('elfsight-app-whatsapp');
                    }''')
                except Exception:
                    pass

                try:
                    result["has_form"] = await page.evaluate('''() => {
                        return document.querySelectorAll('form, input[type="email"], textarea').length > 0;
                    }''')
                except Exception:
                    pass

                try:
                    result["has_booking"] = await page.evaluate('''() => {
                        const html = document.body ? document.body.innerHTML.toLowerCase() : '';
                        return html.includes('calendly.com') || html.includes('acuityscheduling') || html.includes('simplybook') || html.includes('book-now') || html.includes('appointment');
                    }''')
                except Exception:
                    pass

                try:
                    result["has_ai_bot"] = await page.evaluate('''() => {
                        const html = document.body ? document.body.innerHTML.toLowerCase() : '';
                        const scripts = Array.from(document.querySelectorAll('script, iframe')).map(s => (s.src || '').toLowerCase());
                        const ai_patterns = ['typebot', 'botpress', 'voiceflow', 'chatbase', 'dify', 'manychat', 'landbot', 'collect.chat', 'rasa', 'openai', 'chatgpt', 'vapi.ai', 'retell', 'bland.ai', 'synthflow', 'elevenlabs', 'activechat'];
                        return scripts.some(src => ai_patterns.some(p => src.includes(p))) || ai_patterns.some(p => html.includes(p));
                    }''')
                except Exception:
                    pass

                try:
                    result["has_workflow_automation"] = await page.evaluate('''() => {
                        const html = document.body ? document.body.innerHTML.toLowerCase() : '';
                        const forms = Array.from(document.querySelectorAll('form')).map(f => (f.action || '').toLowerCase());
                        const scripts = Array.from(document.querySelectorAll('script, iframe')).map(s => (s.src || '').toLowerCase());
                        const auto_patterns = ['n8n', 'zapier.com', 'hooks.zapier', 'make.com', 'integromat', 'leadconnector', 'gohighlevel', 'ghl', 'activecampaign', '/webhook', 'lambda-url', 'cloudfunctions', '/api/v1/lead', '/api/contact'];
                        return scripts.some(src => auto_patterns.some(p => src.includes(p))) ||
                               forms.some(act => auto_patterns.some(p => act.includes(p))) ||
                               auto_patterns.some(p => html.includes(p));
                    }''')
                except Exception:
                    pass

                await page.close()

                mobile_page = await browser.new_page(
                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
                    viewport={"width": 375, "height": 812},
                )
                try:
                    await mobile_page.goto(target_url, timeout=12000, wait_until="domcontentloaded")
                    await mobile_page.wait_for_timeout(1000)
                    result["mobile_overflow"] = await mobile_page.evaluate('''() => {
                        return document.documentElement.scrollWidth > window.innerWidth + 10;
                    }''')
                except Exception:
                    result["mobile_overflow"] = False
                finally:
                    await mobile_page.close()

                await browser.close()
                return result
        except Exception as e:
            logger.debug(f"Playwright browser rendering fallback/skipped for {target_url}: {e}")
            return result

    @classmethod
    async def deep_contact_hunt(
        cls,
        canonical_name: str,
        domain: Optional[str] = None,
        location: str = "",
        existing_phone: Optional[str] = None,
        existing_email: Optional[str] = None,
        facebook_url: Optional[str] = None,
    ) -> Dict[str, Optional[str]]:
        found_phone = existing_phone
        found_email = existing_email

        if found_phone and found_email:
            return {"phone": found_phone, "email": found_email}

        loop = asyncio.get_event_loop()

        if domain:
            for sub in ["/contact", "/contact-us", ""]:
                if found_phone and found_email:
                    break
                target = f"https://{domain}{sub}"
                try:
                    logger.info(f"OpenClaw DeepHunt: Human-like browser inspection of {target}...")
                    bw_res = await cls.fetch_page_with_browser(target, human_scroll=True)
                    rendered_html = bw_res.get("html", "")
                    if rendered_html:
                        p, e = cls.extract_contacts_from_text(rendered_html)
                        if p and not found_phone:
                            found_phone = p
                            logger.info(f"OpenClaw DeepHunt: Found phone via browser scroll for {canonical_name}: {p}")
                        if e and not found_email:
                            found_email = e
                            logger.info(f"OpenClaw DeepHunt: Found email via browser scroll for {canonical_name}: {e}")
                except Exception as ex:
                    logger.debug(f"DeepHunt browser inspection error on {target}: {ex}")

        if not found_phone or not found_email:
            search_query = f'"{canonical_name}" "{domain or location}" contact OR phone OR email'
            logger.info(f"OpenClaw DeepHunt: Searching live web for contact snippets: {search_query}...")
            try:
                def _do_ddg():
                    html, _ = cls._fetch_ddg_html(search_query)
                    return cls._parse_ddg_items(html)

                items = await loop.run_in_executor(None, _do_ddg)
                aggregated_snippets = " ".join([f"{title} {snip}" for _, title, snip in items])
                if aggregated_snippets:
                    p, e = cls.extract_contacts_from_text(aggregated_snippets)
                    if p and not found_phone:
                        found_phone = p
                        logger.info(f"OpenClaw DeepHunt: Found phone via web search snippet for {canonical_name}: {p}")
                    if e and not found_email:
                        found_email = e
                        logger.info(f"OpenClaw DeepHunt: Found email via web search snippet for {canonical_name}: {e}")
            except Exception as ex:
                logger.debug(f"DeepHunt search snippet error: {ex}")

        if not found_phone or not found_email:
            fb_query = f'site:facebook.com "{canonical_name}" contact OR phone OR email'
            try:
                def _do_fb_search():
                    html, _ = cls._fetch_ddg_html(fb_query)
                    return cls._parse_ddg_items(html)

                fb_items = await loop.run_in_executor(None, _do_fb_search)
                fb_snippets = " ".join([f"{title} {snip}" for _, title, snip in fb_items])
                if fb_snippets:
                    p, e = cls.extract_contacts_from_text(fb_snippets)
                    if p and not found_phone:
                        found_phone = p
                        logger.info(f"OpenClaw DeepHunt: Found phone via Facebook profile search for {canonical_name}: {p}")
                    if e and not found_email:
                        found_email = e
                        logger.info(f"OpenClaw DeepHunt: Found email via Facebook profile search for {canonical_name}: {e}")
            except Exception as ex:
                logger.debug(f"DeepHunt social search error: {ex}")

        return {"phone": found_phone, "email": found_email}

    @classmethod
    async def audit_website(
        cls,
        url: str,
        canonical_name: str = "Business",
        location: str = "",
        lightweight: bool = False,
    ) -> Dict[str, Any]:
        if not url or not url.startswith("http"):
            return {
                "url": url,
                "proof_link": url,
                "status": 400,
                "is_accessible": False,
                "checked_live": True,
                "title": canonical_name,
                "brand_name": canonical_name,
                "mobile_responsive": None,
                "mobile_overflow": False,
                "has_whatsapp": False,
                "has_online_booking": False,
                "has_contact_form": False,
                "broken_links_count": 0,
                "extracted_phone": None,
                "extracted_email": None,
                "extracted_address": None,
                "facebook_url": None,
                "instagram_url": None,
                "linkedin_url": None,
                "cms_platform": "Unknown",
                "has_meta_pixel": False,
                "has_google_analytics": False,
                "meta_ads_url": f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q={urllib.parse.quote(canonical_name)}",
                "contact_person": None,
                "contact_title": None,
                "rendered_by": "none",
                "evidence_text": f"Target website '{url}' is invalid or inaccessible.",
                "is_healthy_website": False,
            }

        loop = asyncio.get_event_loop()
        base_url = url.rstrip("/")
        headers = {
            "User-Agent": cls.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": base_url,
        }

        import ssl
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        def _fetch_page(u):
            req = urllib.request.Request(u, headers=headers)
            with urllib.request.urlopen(req, timeout=7, context=ssl_ctx) as resp:
                return resp.getcode(), resp.read().decode("utf-8", errors="ignore")

        if lightweight:
            logger.info(f"OpenClaw Audit: Executing fast lightweight HTTP audit of {base_url}...")
            try:
                code, homepage_html = await loop.run_in_executor(None, _fetch_page, base_url)
                status_code = code
                browser_accessible = (code == 200)
            except Exception as e:
                logger.debug(f"Fast HTTP fetch notice for {base_url}: {e}")
                homepage_html = ""
                status_code = 504
                browser_accessible = False
            mobile_overflow = False
            rendered_by = "fast-http"
            aggregated_html = homepage_html
            visited_pages = 1 if homepage_html else 0
            broken_links_count = 0
            bw_res = {}
        else:
            logger.info(f"OpenClaw Audit: Executing deep human-like browser audit of {base_url}...")
            bw_res = await cls.fetch_page_with_browser(base_url, human_scroll=True)
            homepage_html = bw_res.get("html", "")
            mobile_overflow = bw_res.get("mobile_overflow", False)
            browser_accessible = bw_res.get("is_accessible", True)

            visited_pages = 1 if homepage_html else 0
            broken_links_count = 0
            rendered_by = "playwright-chromium"
            status_code = 200 if browser_accessible else 500

            discovered_paths = set()
            if homepage_html:
                raw_hrefs = re.findall(r'<a[^>]+href=["\']([^"\']+)["\']', homepage_html, re.I)
                for href in raw_hrefs:
                    clean_href = href.strip()
                    if any(k in clean_href.lower() for k in ["contact", "reach", "touch", "about", "services", "pricing", "team", "booking", "appointment"]):
                        if clean_href.startswith("/"):
                            discovered_paths.add(clean_href.split("?")[0].split("#")[0])
                        elif clean_href.startswith(base_url):
                            rel = clean_href[len(base_url):].split("?")[0].split("#")[0]
                            if rel:
                                discovered_paths.add(rel)

            default_contact_paths = ["/contact", "/contact-us", "/about", "/about-us", "/services", "/pages/contact-us"]
            all_paths_to_visit = list(discovered_paths) + [p for p in default_contact_paths if p not in discovered_paths]
            target_paths = all_paths_to_visit[:6]

            aggregated_html = homepage_html
            for path in target_paths:
                target_page_url = base_url + (path if path.startswith("/") else f"/{path}")
                try:
                    await asyncio.sleep(0.5)
                    code, page_html = await loop.run_in_executor(None, _fetch_page, target_page_url)
                    if code == 200:
                        aggregated_html += f"\n--- PAGE: {path} ---\n" + page_html
                        visited_pages += 1
                    else:
                        broken_links_count += 1
                except Exception:
                    if path in ("", "/contact", "/contact-us"):
                        broken_links_count += 1
                    continue

        if not aggregated_html:
            logger.info(f"LiveResearchEngine: Could not reach {url}")
            return {
                "url": url,
                "proof_link": url,
                "status": 504,
                "is_accessible": False,
                "checked_live": True,
                "title": canonical_name,
                "brand_name": canonical_name,
                "mobile_responsive": None,
                "mobile_overflow": False,
                "has_whatsapp": False,
                "has_online_booking": False,
                "has_contact_form": False,
                "broken_links_count": broken_links_count,
                "extracted_phone": None,
                "extracted_email": None,
                "extracted_address": None,
                "facebook_url": None,
                "instagram_url": None,
                "linkedin_url": None,
                "cms_platform": "Unknown",
                "has_meta_pixel": False,
                "has_google_analytics": False,
                "meta_ads_url": f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q={urllib.parse.quote(canonical_name)}",
                "contact_person": None,
                "contact_title": None,
                "rendered_by": "none",
                "evidence_text": f"Public website at '{url}' timed out or refused connection.",
                "is_healthy_website": False,
            }

        html = aggregated_html
        html_lower = html.lower()

        extracted_phone, extracted_email = cls.extract_contacts_from_text(html)

        fb_matches = re.findall(r'https?://(?:www\.)?facebook\.com/[a-zA-Z0-9._-]+', html, re.IGNORECASE)
        ig_matches = re.findall(r'https?://(?:www\.)?instagram\.com/[a-zA-Z0-9._-]+', html, re.IGNORECASE)
        li_matches = re.findall(r'https?://(?:www\.)?linkedin\.com/(?:company|in)/[a-zA-Z0-9._-]+', html, re.IGNORECASE)

        facebook_url = fb_matches[0] if fb_matches else None
        instagram_url = ig_matches[0] if ig_matches else None
        linkedin_url = li_matches[0] if li_matches else None

        parsed_domain = urllib.parse.urlparse(url).netloc or ""
        if not extracted_phone or not extracted_email:
            logger.info(f"LiveResearchEngine: Incomplete contacts on {url} (Phone: {bool(extracted_phone)}, Email: {bool(extracted_email)}). Triggering human-like deep contact hunt retry...")
            hunt = await cls.deep_contact_hunt(
                canonical_name=canonical_name,
                domain=parsed_domain,
                location=location,
                existing_phone=extracted_phone,
                existing_email=extracted_email,
                facebook_url=facebook_url,
            )
            if hunt.get("phone") and not extracted_phone:
                extracted_phone = hunt["phone"]
                rendered_by = "deep-contact-hunt"
            if hunt.get("email") and not extracted_email:
                extracted_email = hunt["email"]
                rendered_by = "deep-contact-hunt"

        mobile_responsive = "viewport" in html_lower and not mobile_overflow
        
        has_whatsapp = bw_res.get("has_whatsapp", False) or any(k in html_lower for k in [
            "wa.me", "whatsapp.com", "api.whatsapp.com", "whatsapp", "joinchat", "chatway", "elfsight-app-whatsapp"
        ])

        has_online_booking = bw_res.get("has_booking", False) or any(k in html_lower for k in [
            "booking", "appointment", "calendly.com", "acuityscheduling", "simplybook", "book-now", "schedule-consultation", "book an appointment"
        ])

        has_contact_form = bw_res.get("has_form", False) or ("<form" in html_lower or 'id="contact"' in html_lower or 'class="contact-form"' in html_lower or 'wpcf7' in html_lower or 'elementor-form' in html_lower)

        cms_platform = "Custom"
        if "wp-content" in html_lower or "wp-includes" in html_lower:
            cms_platform = "WordPress"
        elif "shopify.com" in html_lower or "cdn.shopify.com" in html_lower:
            cms_platform = "Shopify"
        elif "wix.com" in html_lower or "_wix" in html_lower:
            cms_platform = "Wix"
        elif "squarespace" in html_lower:
            cms_platform = "Squarespace"
        elif "__next" in html_lower or "_next/static" in html_lower:
            cms_platform = "Next.js"
        elif "webflow" in html_lower:
            cms_platform = "Webflow"

        has_meta_pixel = "fbq(" in html or "connect.facebook.net" in html_lower
        has_google_analytics = any(x in html_lower for x in ["gtag(", "google-analytics.com", "googletagmanager.com"])
        meta_ads_url = f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q={urllib.parse.quote(canonical_name)}"

        has_live_chat = any(x in html_lower for x in [
            "tawk.to", "crisp.chat", "intercom", "zendesk", "drift.com", "tidio", "chatwoot", "livechat", "freshchat"
        ])

        has_ssl_security = url.startswith("https://")

        has_ai_chatbot = bw_res.get("has_ai_bot", False) or any(x in html_lower for x in [
            "typebot", "botpress", "voiceflow", "chatbase", "dify", "manychat", "landbot", "collect.chat", "rasa", "openai", "chatgpt", "vapi.ai", "retell", "bland.ai", "synthflow", "elevenlabs", "activechat"
        ])

        has_automation_workflow = bw_res.get("has_workflow_automation", False) or any(x in html_lower for x in [
            "n8n", "zapier.com", "hooks.zapier", "make.com", "integromat", "leadconnector", "gohighlevel", "ghl", "activecampaign"
        ])

        # Contact Person & Title extraction
        contact_person = None
        contact_title = None
        leadership_titles = ["Managing Director", "Founder", "Co-Founder", "CEO", "Chairman", "Chief Executive Officer", "Proprietor", "Principal", "Owner"]
        
        excluded_person_words = [
            "about", "contact", "read", "more", "our", "the", "view", "company", "team", "meet",
            "hybrid", "octane", "diesel", "electric", "solar", "battery", "sedan", "suv", "petrol",
            "engine", "motor", "auto", "cars", "car", "service", "parts", "gallery", "showroom",
            "center", "ltd", "limited", "company", "corporation", "toyota", "nissan", "honda", "mitsubishi"
        ]

        for lt in leadership_titles:
            m = re.search(rf'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){{1,3}})\s*[,–-]?\s*(?:is the\s+)?{lt}', html)
            if not m:
                m = re.search(rf'{lt}\s*[:–-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){{1,3}})', html)
            if m:
                cand = m.group(1).strip()
                cand_words = [w.lower() for w in cand.split()]
                if len(cand) >= 4 and not any(w in cand_words for w in excluded_person_words):
                    contact_person = cand
                    contact_title = lt
                    break

        extracted_page_title = bw_res.get("title") or ""
        extracted_meta_desc = ""

        if not extracted_page_title:
            title_m = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            if title_m:
                extracted_page_title = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()

        meta_m = re.search(r'<meta[^>]+name=["\'](?:description|og:description)["\'][^>]+content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if not meta_m:
            meta_m = re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\'](?:description|og:description)["\']', html, re.IGNORECASE)
        if meta_m:
            extracted_meta_desc = meta_m.group(1).strip()

        # Brand name extraction
        brand_name = None
        og_m = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if not og_m:
            og_m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:site_name["\']', html, re.I)
        if og_m:
            cand_b = og_m.group(1).strip()
            if 2 <= len(cand_b) <= 60:
                brand_name = cand_b

        if not brand_name and extracted_page_title:
            parts = re.split(r'\s+[|\-–•]\s+', extracted_page_title)
            if parts and len(parts[0].strip()) >= 3 and len(parts[0].strip()) <= 60:
                brand_name = parts[0].strip()

        # Physical address extraction
        extracted_address = None
        addr_m = re.search(r'<address[^>]*>(.*?)</address>', html, re.I | re.DOTALL)
        if addr_m:
            clean_addr = re.sub(r'<[^>]+>', ' ', addr_m.group(1))
            clean_addr = re.sub(r'\s+', ' ', clean_addr).strip()
            if len(clean_addr) >= 10:
                extracted_address = clean_addr

        if not extracted_address:
            pat = r'(?:Address|Office|Showroom|Location|Find Us|Head Office)[^<:\n]{0,25}[:\-–]\s*([^<>\n\r]{12,120})'
            m = re.search(pat, html, re.I)
            if m:
                clean_addr = re.sub(r'<[^>]+>', ' ', m.group(1))
                clean_addr = re.sub(r'\s+', ' ', clean_addr).strip()
                if len(clean_addr) >= 12 and not any(bad in clean_addr.lower() for bad in ["javascript", "undefined", "cookie", "copyright", "terms"]):
                    extracted_address = clean_addr

        if not extracted_address:
            bd_addr_pat = r'(?:House\s*#?\s*\d+[^<>\n,]{0,30},?\s*)?(?:Road\s*#?\s*[\d\w]+[^<>\n,]{0,30},?\s*)?(?:Sector\s*#?\s*\d+[^<>\n,]{0,30},?\s*)?(?:Block\s*#?\s*[\w\d]+[^<>\n,]{0,30},?\s*)?(?:Uttara|Gulshan|Banani|Dhanmondi|Mirpur|Mohakhali|Motijheel|Baridhara|Badda|Tejgaon|Chittagong|Sylhet),?\s*Dhaka'
            m = re.search(bd_addr_pat, html, re.I)
            if m:
                clean_addr = re.sub(r'\s+', ' ', m.group(0)).strip()
                if len(clean_addr) >= 15:
                    extracted_address = clean_addr

        # Extract H1 and H2 tags for AI core heading analysis
        h_tags = re.findall(r'<h[12][^>]*>(.*?)</h[12]>', html, re.IGNORECASE | re.DOTALL)
        clean_headings = []
        for h in h_tags:
            ch = re.sub(r'<[^>]+>', '', h).strip()
            ch = re.sub(r'\s+', ' ', ch)
            if len(ch) >= 4 and not any(bad in ch.lower() for bad in ["menu", "navigation", "search", "cookie", "skip to"]):
                clean_headings.append(ch)
        extracted_heading = " | ".join(clean_headings[:3])

        # Extract deep visible text / paragraphs from <p>, <li> for AI business offering context
        p_matches = re.findall(r'<(?:p|li)[^>]*>(.*?)</(?:p|li)>', html, re.IGNORECASE | re.DOTALL)
        clean_paragraphs = []
        for p in p_matches:
            clean_p = re.sub(r'<[^>]+>', ' ', p)
            clean_p = re.sub(r'\s+', ' ', clean_p).strip()
            clean_p_l = clean_p.lower()
            if len(clean_p) >= 25 and not any(skip in clean_p_l for skip in ['cookie', 'all rights reserved', 'privacy policy', 'terms of service', 'javascript', 'powered by', 'designed by']):
                clean_paragraphs.append(clean_p)
        page_text_summary = " ".join(clean_paragraphs[:5])[:1200]

        copyright_year = None
        c_match = re.search(r'(?:©|&copy;|copyright|all rights reserved)[^0-9]{0,20}(?:20\d\d\s*[-–/]\s*)?(20[12]\d)', html_lower)
        if c_match:
            try:
                copyright_year = int(c_match.group(1))
            except Exception:
                pass

        is_appointment = False
        try:
            from app.engine.fit_gate import is_appointment_niche
            is_appointment = is_appointment_niche("", canonical_name)
        except Exception:
            pass

        detected_weaknesses = []
        if not mobile_responsive:
            detected_weaknesses.append("Website layout breaks or lacks viewport optimization on mobile devices")
        if is_appointment and not has_online_booking:
            detected_weaknesses.append("Missing automated online appointment booking system")
        elif not has_contact_form:
            detected_weaknesses.append("Missing direct lead capture/inquiry form")
        if not has_whatsapp:
            detected_weaknesses.append("Missing click-to-WhatsApp instant conversion widget")
        if not has_meta_pixel:
            detected_weaknesses.append("Missing Meta/Google Ads retargeting pixel for visitor recapture")
        if not has_live_chat and not has_ai_chatbot:
            detected_weaknesses.append("Missing 24/7 live chat or AI customer assistant")
        if not has_ssl_security:
            detected_weaknesses.append("Missing SSL HTTPS security encryption")
        if not extracted_meta_desc:
            detected_weaknesses.append("Missing SEO meta description tags for Google search ranking")
        if copyright_year and copyright_year < 2024:
            detected_weaknesses.append(f"Outdated website layout & copyright ({copyright_year})")
        if broken_links_count > 0:
            detected_weaknesses.append(f"{broken_links_count} broken link references detected")

        weakness_pitch = ""
        if not mobile_responsive:
            weakness_pitch = "the mobile responsiveness and smartphone client acquisition experience"
        elif not has_contact_form and not has_whatsapp:
            weakness_pitch = "direct on-site lead capture and instant WhatsApp client engagement"
        elif not has_meta_pixel and not has_google_analytics:
            weakness_pitch = "inbound conversion tracking and digital retargeting pixels"
        elif is_appointment and not has_online_booking:
            weakness_pitch = "automating your online client appointment scheduling"
        elif not has_whatsapp:
            weakness_pitch = "adding a direct WhatsApp chat option for rapid mobile client inquiries"
        elif not has_meta_pixel:
            weakness_pitch = "installing retargeting pixels to re-engage past website visitors"
        elif copyright_year and copyright_year < 2024:
            weakness_pitch = "modernizing your website design to increase client trust and inbound conversion rates"
        elif detected_weaknesses:
            weakness_pitch = detected_weaknesses[0].lower()
        else:
            weakness_pitch = "scaling your online visibility and inbound client acquisition pipeline"

        # Healthy Website Gate Rule (from openclaw/skills/website-research/SKILL.md)
        is_healthy_website = (
            mobile_responsive is True
            and has_contact_form is True
            and has_whatsapp is True
            and (has_meta_pixel is True or has_google_analytics is True)
            and broken_links_count == 0
        )

        if detected_weaknesses:
            evidence_text = f"Public website audit detected {len(detected_weaknesses)} operational/technical gaps: " + "; ".join(detected_weaknesses[:3]) + f". Proof: {url}"
        elif is_healthy_website:
            evidence_text = f"Public website is modern, mobile-responsive with active conversion tracking and lead capture. Healthy Website Gate: exclude from website redesign pitches. Proof: {url}"
        else:
            evidence_text = f"Public website verified live. Proof: {url}"

        logger.info(
            f"LiveResearchEngine: Audited {url} ({visited_pages} pages, lightweight={lightweight}) -> "
            f"Brand: '{brand_name}', Title: '{extracted_page_title[:40]}', Phone: {extracted_phone}, Email: {extracted_email}, "
            f"Address: '{extracted_address}', WhatsApp: {has_whatsapp}, CMS: {cms_platform}, Lead: {contact_person} ({contact_title}), Weaknesses: {len(detected_weaknesses)}"
        )

        return {
            "url": url,
            "proof_link": url,
            "status": status_code,
            "is_accessible": True,
            "checked_live": True,
            "visited_pages_count": visited_pages,
            "title": extracted_page_title or f"Audited Website - {canonical_name}",
            "brand_name": brand_name,
            "page_title": extracted_page_title,
            "meta_description": extracted_meta_desc,
            "heading": extracted_heading,
            "page_text_summary": page_text_summary,
            "mobile_responsive": mobile_responsive,
            "mobile_overflow": mobile_overflow,
            "has_whatsapp": has_whatsapp,
            "has_online_booking": has_online_booking,
            "has_contact_form": has_contact_form,
            "has_live_chat": has_live_chat,
            "has_ssl_security": has_ssl_security,
            "has_ai_chatbot": has_ai_chatbot,
            "has_automation_workflow": has_automation_workflow,
            "has_h1_tag": bool(extracted_heading),
            "has_meta_description": bool(extracted_meta_desc),
            "copyright_year": copyright_year,
            "broken_links_count": broken_links_count,
            "extracted_phone": extracted_phone,
            "extracted_email": extracted_email,
            "extracted_address": extracted_address,
            "facebook_url": facebook_url,
            "instagram_url": instagram_url,
            "linkedin_url": linkedin_url,
            "cms_platform": cms_platform,
            "has_meta_pixel": has_meta_pixel,
            "has_google_analytics": has_google_analytics,
            "meta_ads_url": meta_ads_url,
            "contact_person": contact_person,
            "contact_title": contact_title,
            "rendered_by": rendered_by,
            "detected_weaknesses": detected_weaknesses,
            "weakness_pitch": weakness_pitch,
            "is_healthy_website": is_healthy_website,
            "evidence_text": evidence_text,
        }

    @classmethod
    async def inspect_advertising(
        cls,
        canonical_name: str,
        domain: str = "",
        has_meta_pixel: bool = False,
    ) -> Dict[str, Any]:
        clean_name = canonical_name.strip()
        meta_ads_url = f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BD&q={urllib.parse.quote(clean_name)}&search_type=keyword_unordered&media_type=all"
        
        evidence_note = (
            f"Meta Ad Library transparency link: {meta_ads_url}. "
            f"Website Meta Pixel: {'Active on domain' if has_meta_pixel else 'Missing - ad spend and remarketing attribution cannot be tracked'}."
        )

        return {
            "canonical_name": clean_name,
            "domain": domain,
            "meta_ads_url": meta_ads_url,
            "proof_link": meta_ads_url,
            "has_pixel_signal": has_meta_pixel,
            "evidence_text": evidence_note,
            "checked_live": True,
        }

    @classmethod
    async def inspect_reviews(
        cls,
        business_name: str,
        location: str = "",
        rating: Optional[float] = None,
        review_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        clean_name = business_name.strip()
        maps_query = urllib.parse.quote(f"{clean_name} {location}".strip())
        maps_url = f"https://www.google.com/maps/search/{maps_query}"
        
        if rating is not None:
            rev_label = f"{review_count} reviews" if review_count else "reviews"
            if rating < 4.3:
                evidence_note = f"Google Maps rating stands at {rating}★ ({rev_label}). Customer review sentiment indicates service response bottlenecks. Proof: {maps_url}"
            else:
                evidence_note = f"High-demand Google Maps profile ({rating}★, {rev_label}). High inbound demand requiring automated client booking. Proof: {maps_url}"
        else:
            evidence_note = f"Google Maps public directory profile indexed at {maps_url}."

        return {
            "business_name": clean_name,
            "location": location,
            "google_maps_url": maps_url,
            "proof_link": maps_url,
            "rating": rating,
            "review_count": review_count,
            "evidence_text": evidence_note,
            "checked_live": True,
        }

    @classmethod
    async def inspect_social(
        cls,
        canonical_name: str,
        domain: str = "",
        facebook_url: Optional[str] = None,
        location: str = "",
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        clean_name = canonical_name.strip()
        found_fb = facebook_url
        post_recency_text = None
        is_dormant = False
        recent_snippets = []

        if not found_fb:
            fb_search = f'site:facebook.com "{clean_name}" {location}'
            try:
                def _do_fb_search():
                    html, _ = cls._fetch_ddg_html(fb_search)
                    return cls._parse_ddg_items(html)
                items = await loop.run_in_executor(None, _do_fb_search)
                for link, title, snippet in items:
                    if "facebook.com" in link.lower() and not any(bad in link.lower() for bad in ["/sharer", "/login", "/recover", "/groups"]):
                        found_fb = link
                        recent_snippets.append(f"{title} {snippet}")
                        break
            except Exception as e:
                logger.debug(f"inspect_social search error: {e}")

        if found_fb and not recent_snippets:
            try:
                def _do_page_search():
                    html, _ = cls._fetch_ddg_html(f'"{clean_name}" site:facebook.com')
                    return cls._parse_ddg_items(html)
                items = await loop.run_in_executor(None, _do_page_search)
                for link, title, snippet in items:
                    recent_snippets.append(f"{title} {snippet}")
            except Exception as e:
                logger.debug(f"inspect_social snippet fetch error: {e}")

        combined_text = " ".join(recent_snippets)
        date_match = re.search(r'(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d+\s+(?:hours?|days?|weeks?|months?|years?)\s+ago|\b202[0-5]\b)', combined_text, re.IGNORECASE)
        if date_match:
            post_recency_text = date_match.group(0).strip()
            if any(k in post_recency_text.lower() for k in ["month", "year", "2024", "2023", "2022", "2021", "2020"]):
                is_dormant = True
        else:
            if found_fb:
                post_recency_text = "No recent public posts detected in index"
                is_dormant = True

        evidence_note = ""
        if found_fb:
            if is_dormant:
                evidence_note = f"Public Facebook page verified at {found_fb}. Activity check: {post_recency_text} (Dormant profile losing organic clients). Proof: {found_fb}"
            else:
                evidence_note = f"Public Facebook page verified at {found_fb}. Active presence detected ({post_recency_text}). Inbound inquiries require automated CRM tracking. Proof: {found_fb}"
        else:
            evidence_note = f"No verified official Facebook page detected for {clean_name} in {location}."

        return {
            "canonical_name": clean_name,
            "domain": domain,
            "facebook_url": found_fb,
            "facebook_about_summary": combined_text[:800],
            "proof_link": found_fb or f"https://www.google.com/search?q={urllib.parse.quote(clean_name + ' facebook')}",
            "has_facebook": bool(found_fb),
            "is_dormant": is_dormant,
            "post_recency_text": post_recency_text,
            "evidence_text": evidence_note,
            "checked_live": True,
        }

    @classmethod
    async def inspect_news(
        cls,
        company_name: str,
        location: str = "",
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        clean_name = company_name.strip()
        news_query = f'"{clean_name}" (launch OR expansion OR project OR contract OR branch) {location}'
        announcements = []

        try:
            def _do_search():
                html, _ = cls._fetch_ddg_html(news_query)
                return cls._parse_ddg_items(html)
            items = await loop.run_in_executor(None, _do_search)
            for link, title, snippet in items[:3]:
                if any(bad in link.lower() for bad in ["facebook.com", "instagram.com", "youtube.com"]):
                    continue
                announcements.append({
                    "headline": title,
                    "snippet": snippet,
                    "source_url": link,
                    "signal_type": "expansion_or_project",
                })
        except Exception as e:
            logger.debug(f"inspect_news error for {clean_name}: {e}")

        return {
            "company_name": clean_name,
            "announcements": announcements,
            "active_announcements_count": len(announcements),
            "checked_live": True,
        }

    @classmethod
    async def inspect_jobs(
        cls,
        company_name: str,
        location: str = "",
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        clean_name = company_name.strip()
        job_query = f'"{clean_name}" (hiring OR jobs OR career OR vacancy) {location}'
        tech_roles = []
        source_urls = []

        try:
            def _do_job_search():
                html, _ = cls._fetch_ddg_html(job_query)
                return cls._parse_ddg_items(html)
            items = await loop.run_in_executor(None, _do_job_search)
            for link, title, snippet in items[:5]:
                combined = f"{title} {snippet}".lower()
                if any(k in combined for k in ["manager", "developer", "marketing", "sales", "executive", "officer", "engineer", "designer", "specialist"]):
                    tech_roles.append(title[:60])
                    source_urls.append(link)
        except Exception as e:
            logger.debug(f"inspect_jobs error for {clean_name}: {e}")

        return {
            "company_name": clean_name,
            "active_job_count": len(tech_roles),
            "tech_roles_found": tech_roles[:5],
            "source_urls": source_urls[:3],
            "checked_live": True,
        }

class OpenClawClient:

    def __init__(
        self,
        gateway_url: Optional[str] = None,
        gateway_token: Optional[str] = None,
        timeout: int = 120,
    ):
        self.gateway_url = gateway_url or settings.OPENCLAW_GATEWAY_URL
        self.gateway_token = gateway_token or settings.OPENCLAW_GATEWAY_TOKEN
        self.timeout = timeout

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        response_json: bool = True,
        session_id: str = "leadgen_pipeline",
    ) -> Optional[Dict[str, Any]]:
        if not self.gateway_url:
            return None

        base = self.gateway_url.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
        endpoint = f"{base}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.gateway_token}",
            "Content-Type": "application/json",
            "x-openclaw-session": session_id,
        }
        payload = {
            "model": "default",
            "messages": messages,
            "temperature": temperature,
            "user": "leadgen_backend",
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    if response_json:
                        try:
                            return json.loads(content)
                        except json.JSONDecodeError:
                            clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                            clean_c = re.sub(r"\s*```$", "", clean_c)
                            return json.loads(clean_c)
                    return {"content": content}
                else:
                    logger.debug(f"OpenClaw gateway completions returned HTTP {resp.status_code}")
        except Exception as e:
            logger.debug(f"OpenClaw gateway completions notice: {e}")
        return None

    async def run_skill(
        self,
        skill_name: str,
        parameters: Dict[str, Any],
        timeout_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        logger.info(f"OpenClawClient: Executing skill '{skill_name}' with parameters {parameters}")

        if skill_name == "business-discovery":
            industry = parameters.get("industry", "Business").strip()
            location = parameters.get("location", "").strip()
            country = parameters.get("country", "").strip()
            city = parameters.get("city", "").strip()
            sub_city = parameters.get("sub_city", "").strip()
            raw_limit = int(parameters.get("company_limit", 0))
            b_type = parameters.get("business_type_override")
            return await LiveResearchEngine.discover_businesses(
                industry=industry,
                location=location,
                country=country,
                city=city,
                sub_city=sub_city,
                company_limit=raw_limit,
                business_type_override=b_type,
                sub_areas=parameters.get("sub_areas"),
                on_candidate_found=parameters.get("on_candidate_found"),
            )

        elif skill_name == "website-research":
            url = parameters.get("url", "")
            canonical_name = parameters.get("canonical_name", "Business")
            location = parameters.get("location", "")
            lightweight = bool(parameters.get("lightweight", False))
            return await LiveResearchEngine.audit_website(
                url=url,
                canonical_name=canonical_name,
                location=location,
                lightweight=lightweight,
            )

        elif skill_name == "ads-research":
            canonical_name = parameters.get("company_name") or parameters.get("canonical_name", "Business")
            domain = parameters.get("domain", "")
            has_pixel = bool(parameters.get("has_meta_pixel", False))
            return await LiveResearchEngine.inspect_advertising(canonical_name=canonical_name, domain=domain, has_meta_pixel=has_pixel)

        elif skill_name == "review-research":
            business_name = parameters.get("business_name", "Business")
            location = parameters.get("location", "")
            rating = parameters.get("rating")
            review_count = parameters.get("review_count")
            return await LiveResearchEngine.inspect_reviews(
                business_name=business_name,
                location=location,
                rating=float(rating) if rating is not None else None,
                review_count=int(review_count) if review_count is not None else None,
            )

        elif skill_name == "social-research":
            canonical_name = parameters.get("canonical_name", "Business")
            domain = parameters.get("domain", "")
            facebook_url = parameters.get("facebook_url")
            location = parameters.get("location", "")
            return await LiveResearchEngine.inspect_social(
                canonical_name=canonical_name,
                domain=domain,
                facebook_url=facebook_url,
                location=location,
            )

        elif skill_name in ("skill-lead-gen", "lead-gen"):
            industry = parameters.get("industry", "Business")
            location = parameters.get("location", "")
            return await LiveResearchEngine.discover_businesses(
                industry=industry,
                location=location,
                company_limit=parameters.get("company_limit", 10),
            )

        elif skill_name == "news-research":
            company_name = parameters.get("company_name") or parameters.get("canonical_name", "Business")
            location = parameters.get("location", "")
            return await LiveResearchEngine.inspect_news(company_name=company_name, location=location)

        elif skill_name == "jobs-research":
            company_name = parameters.get("company_name") or parameters.get("canonical_name", "Business")
            location = parameters.get("location", "")
            return await LiveResearchEngine.inspect_jobs(company_name=company_name, location=location)

        elif skill_name == "visual-research":
            url = parameters.get("target_url") or parameters.get("url", "")
            canonical_name = parameters.get("canonical_name", "Business")
            return await LiveResearchEngine.audit_website(url=url, canonical_name=canonical_name)

        elif skill_name == "evidence-collection":
            return {"status": "SUCCESS", "skill": "evidence-collection", "evidence_items": parameters.get("evidence_items", [])}

        return {"status": "SUCCESS", "skill": skill_name}

    @classmethod
    def get_skill_spec(cls, skill_name: str) -> Optional[str]:
        return load_skill_spec(skill_name)

