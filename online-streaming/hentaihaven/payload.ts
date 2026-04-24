/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

// ---------- Types ----------
type HentaiHavenSearchResult = {
    title: string;
    slug: string;
    url: string;
}

type HentaiHavenEpisode = {
    number: number;
    title: string;
    url: string;
    slug: string;
}



// ---------- Utility Functions ----------
function cleanTitle(title: string): string {
    return title
        .replace(/\s+/g, " ")
        .replace(/\b(And|and)\b/g, "&")
        .trim();
}

function extractSlugFromUrl(url: string): string {
    const match = url.match(/\/watch\/([^\/]+)/);
    return match ? match[1] : "";
}

function rot13(str: string): string {
    const i = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
    const e = "NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm".split("");
    const t = i.reduce((acc, char, idx) => Object.assign(acc, { [char]: e[idx] }), {} as any);
    return str.split("").map(n => t[n] || n).join("");
}

function decodeToken(token: string): any {
    try {
        // The token has a "sha512-" prefix that needs to be removed
        let e = token.replace("sha512-", "");
        // The token is decoded 3 times using ROT13 and Base64 in that specific order
        for (let i = 0; i < 3; i++) {
            e = rot13(e);
            e = Buffer.from(e, 'base64').toString('utf8');
        }
        return JSON.parse(e);
    } catch (e) {
        console.log("Error decoding token:", e);
        return null;
    }
}

// ---------- Main Class ----------
class Provider {
    private readonly BASE_URL = "https://hentaihaven.xxx";
    private readonly SEARCH_URL = `${this.BASE_URL}/`;

    getSettings(): Settings {
        return {
            episodeServers: ["HentaiHaven"],
            supportsDub: false,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let query = cleanTitle(opts.query);

        console.log(`Searching for: "${query}"`);

        const searchUrl = `${this.SEARCH_URL}?s=${encodeURIComponent(query)}`;
        console.log(`Search URL: ${searchUrl}`);

        let html = "";
        try {
            const response = await fetch(searchUrl);
            if (response.ok) {
                html = await response.text();
            }
        } catch (e) {
            console.log("Fetch failed, likely Cloudflare challenge");
        }

        // If fetch failed or returned a challenge page (often identified by length or specific content)
        if (!html || html.length < 5000 || html.includes("cf-challenge") || html.includes("Checking your browser")) {
            console.log("Cloudflare detected or fetch failed, using ChromeDP for search");
            try {
                const browser = await ChromeDP.newBrowser({ timeout: 30000 });
                await browser.navigate(searchUrl);
                await browser.sleep(8000); // Wait for challenge
                html = await browser.evaluate("document.documentElement.outerHTML");
                await browser.close();
            } catch (e) {
                console.log(`ChromeDP search failed: ${e}`);
                return [];
            }
        }

        const $ = await LoadDoc(html);
        const results: SearchResult[] = [];
        const seenUrls = new Set<string>();

        // Try multiple selectors to find content
        const selectors = [
            ".c-tabs-item",
            ".in-grid",
            "div[class*='grid']",
            "a[href*='/watch/']",
            ".item-summary",
            ".related-reading-wrap",
            ".popular-item-wrap",
            ".col-md-zarat",
            ".c-page__content"
        ];

        for (const selector of selectors) {
            const entries = $(selector);
            if (entries.length() > 0) {
                entries.each((_, el) => {
                    let title = "";
                    let href = "";

                    if (el.attr("href")) {
                        href = el.attr("href") || "";
                        title = el.text().trim() || el.attr("title") || "";
                    } else {
                        const linkEl = el.find("a[href*='/watch/']");
                        if (linkEl.length() > 0) {
                            href = linkEl.attr("href") || "";
                            title = linkEl.text().trim() || linkEl.attr("title") || "";
                        }
                    }

                    if (href && href.includes("/watch/") && !href.includes("/episode-")) {
                        const fullUrl = href.startsWith("http") ? href : `${this.BASE_URL}${href}`;
                        const slug = extractSlugFromUrl(fullUrl);

                        if (slug && !seenUrls.has(fullUrl)) {
                            seenUrls.add(fullUrl);
                            const cleanedTitle = title.replace(/\s*-?\s*Episode\s*\d+/i, "").trim();
                            if (cleanedTitle) {
                                results.push({
                                    id: slug,
                                    title: cleanedTitle,
                                    url: fullUrl,
                                    subOrDub: "sub",
                                });
                            }
                        }
                    }
                });
                if (results.length > 0) break;
            }
        }

        console.log(`Found ${results.length} results`);
        return results;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const url = `${this.BASE_URL}/watch/${id}`;
        console.log(`Fetching episodes from: ${url}`);

        let html = "";
        try {
            const response = await fetch(url);
            if (response.ok) {
                html = await response.text();
            }
        } catch (e) { }

        if (!html || html.length < 5000 || html.includes("cf-challenge")) {
            console.log("Using ChromeDP for episodes");
            const browser = await ChromeDP.newBrowser({ timeout: 30000 });
            await browser.navigate(url);
            await browser.sleep(5000);
            html = await browser.evaluate("document.documentElement.outerHTML");
            await browser.close();
        }

        const $ = await LoadDoc(html);
        const episodes: EpisodeDetails[] = [];
        const seenEpisodes = new Set<string>();

        const episodeLinks = $("a[href*='/episode-'], option[data-redirect*='/episode-']");
        episodeLinks.each((_, el) => {
            const href = el.attr("href") || el.attr("data-redirect");
            let text = el.text().trim();

            if (href && !seenEpisodes.has(href)) {
                seenEpisodes.add(href);
                const episodeMatch = href.match(/episode-(\d+)/i) || text.match(/episode\s*(\d+)/i);
                const episodeNum = episodeMatch ? parseInt(episodeMatch[1], 10) : episodes.length + 1;

                const fullUrl = href.startsWith("http") ? href : `${this.BASE_URL}${href}`;
                const episodeSlug = href.split("/").filter(Boolean).pop() || "";

                if (fullUrl.includes(id)) {
                    episodes.push({
                        id: episodeSlug,
                        number: episodeNum,
                        url: fullUrl,
                        title: text || `Episode ${episodeNum}`,
                    });
                }
            }
        });

        episodes.sort((a, b) => a.number - b.number);
        console.log(`Found ${episodes.length} episodes`);
        return episodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        if (!server || server !== "HentaiHaven") {
            return { server: "", headers: {}, videoSources: [] };
        }

        console.log(`Fetching video sources for episode: ${episode.url}`);

        let videoSources: VideoSource[] = [];
        let subs: VideoSubtitle[] = [];
        let browser: any;
        try {
            // 1. Try to get everything via fetch first (it often bypasses Turnstile better than headless)
            let playerUrl = "";
            let token = "";

            console.log("Attempting extraction via fetch...");
            const response = await fetch(episode.url);
            if (response.ok) {
                const html = await response.text();
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) {
                    playerUrl = iframeMatch[1];
                    if (playerUrl.startsWith("//")) playerUrl = "https:" + playerUrl;
                    console.log(`Found player URL: ${playerUrl}`);

                    const playerResponse = await fetch(playerUrl, {
                        headers: { "Referer": episode.url }
                    });
                    if (playerResponse.ok) {
                        const playerHtml = await playerResponse.text();
                        const metaRegex = /<meta[^>]+name=["']x-secure-token["'][^>]+content=["']([^"']+)["']/i;
                        const tokenMatch = playerHtml.match(metaRegex);
                        if (tokenMatch) {
                            token = tokenMatch[1];
                            console.log("Token extracted via fetch");
                        }
                    }
                }

                // verifify if theres subs
                // response
                /* 
                NO SUBTITLE: <div id="subtitle-wrapper" class="control-btn" style="display: none;">
                SUBTITLE:    <div id="subtitle-wrapper" class="control-btn" style="display: flex;">
                */
                // const subtitleWrapper = html.match(/<div[^>]+id="subtitle-wrapper"[^>]*>.*?<\/div>/i);
                // if (subtitleWrapper) {
                //     if (!subtitleWrapper?.[1]?.includes("none")) {
                //         HaveSubs = true;
                //     }
                // }
            }

            // 2. If fetch failed, fallback to ChromeDP
            if (!token) {
                console.log("Fetch failed or no token, falling back to ChromeDP...");
                browser = await ChromeDP.newBrowser({ timeout: 60000 });
                await browser.navigate(episode.url);

                let retries = 0;
                while (retries < 15) {
                    const title = await browser.evaluate("document.title");
                    if (title && title !== "Just a moment...") break;
                    await browser.sleep(3000);
                    retries++;
                }

                const pageData = await browser.evaluate(`
                    (() => {
                        const iframe = document.querySelector('iframe[src*="player.php"]') || 
                                     Array.from(document.querySelectorAll('iframe')).find(i => i.src.includes('player-logic'));
                        let token = null;
                        if (iframe) {
                            try {
                                token = iframe.contentWindow.document.querySelector('meta[name="x-secure-token"]')?.content;
                            } catch (e) {}
                        }
                        return { playerUrl: iframe?.src, token: token };
                    })()
                `);
                playerUrl = playerUrl || pageData?.playerUrl;
                token = pageData?.token;

                if (playerUrl && !token) {
                    if (playerUrl.startsWith("//")) playerUrl = "https:" + playerUrl;
                    await browser.navigate(playerUrl);
                    await browser.sleep(5000);
                    token = await browser.evaluate("document.querySelector('meta[name=\"x-secure-token\"]')?.content");
                }
            }

            if (token) {
                const config = decodeToken(token);
                if (config && config.en && config.iv && config.uri) {
                    let baseUri = config.uri;
                    if (baseUri.startsWith("//")) baseUri = "https:" + baseUri;
                    else if (!baseUri.startsWith("http")) baseUri = this.BASE_URL + (baseUri.startsWith("/") ? "" : "/") + baseUri;

                    const apiUrl = baseUri.endsWith("/") ? `${baseUri}api.php` : `${baseUri}/api.php`;
                    console.log(`Calling API: ${apiUrl}`);

                    const fd = new FormData();
                    fd.append("action", "zarat_get_data_player_ajax");
                    fd.append("a", config.en);
                    fd.append("b", config.iv);

                    const apiResponse = await fetch(apiUrl, {
                        method: "POST",
                        body: fd,
                        headers: {
                            "Referer": playerUrl || episode.url,
                            "Origin": "https://hentaihaven.xxx"
                        }
                    }).then(res => res.json()).catch(e => ({ status: false, error: e.message }));

                    if (apiResponse && apiResponse.status && apiResponse.data && apiResponse.data.sources) {
                        for (const source of apiResponse.data.sources) {
                            const idMatch = source.src.match(/octopusmanifest\.org\/([^\/]+)/);
                            const currentSubId = source.id || apiResponse.data.id || (idMatch ? idMatch[1] : undefined);

                            if (currentSubId != undefined && subs.length === 0) {
                                // get subs if exist
                                //https://octopusmanifest.org/aad59e72-ead1-4e3f-8cf3-6ac881217430/s/fr.ass
                                const LANGUAGE_NAMES: Record<string, string> = {
                                    en: 'English', es: 'Spanish', de: 'German', fr: 'French',
                                    id: 'Indonesian', pl: 'Polish', pt: 'Portuguese', tr: 'Turkish',
                                    ru: 'Russian', it: 'Italian', ar: 'Arabic', nl: 'Dutch',
                                    zh: 'Chinese', ko: 'Korean', ja: 'Japanese', hu: 'Hungarian',
                                    cs: 'Czech', vi: 'Vietnamese', ro: 'Romanian', sv: 'Swedish',
                                    th: 'Thai', da: 'Danish', he: 'Hebrew', el: 'Greek',
                                    fi: 'Finnish', uk: 'Ukrainian'
                                };

                                const subtitlePromises = Object.entries(LANGUAGE_NAMES).map(async ([code, name]) => {
                                    try {
                                        const baseUrl = `https://octopusmanifest.org/${currentSubId}/s/${code}`;

                                        // 1. Try VTT first (hosted on manifest server)
                                        const vttUrl = `${baseUrl}.vtt`;
                                        const vttRes = await fetch(vttUrl, { method: "HEAD", timeout: 5 });

                                        if (vttRes.ok) {
                                            subs.push({
                                                id: code,
                                                url: vttUrl,
                                                language: name,
                                                isDefault: code === "en"
                                            });
                                        } else {
                                            // 2. Fallback to ASS
                                            const assUrl = `${baseUrl}.ass`;
                                            const assRes = await fetch(assUrl, { method: "HEAD", timeout: 5 });
                                            if (assRes.ok) {
                                                subs.push({
                                                    id: code,
                                                    url: assUrl,
                                                    language: name,
                                                    isDefault: code === "en"
                                                });
                                            }
                                        }
                                    } catch (e) { }
                                });
                                await Promise.all(subtitlePromises);
                                console.log(`Found ${subs.length} subtitles for ID ${currentSubId}`);
                            }

                            videoSources.push({
                                url: source.src,
                                type: source.src.includes(".m3u8") ? "m3u8" : "mp4",
                                quality: source.label || "auto",
                                subtitles: [...subs]
                            });
                        }
                        console.log(`Found ${videoSources.length} sources`);
                    } else {
                        console.log("API Error or No Sources:", JSON.stringify(apiResponse));
                    }
                }
            }

            // Final fallback to network inspection if needed and browser is open
            if (videoSources.length === 0 && browser) {
                const networkSources = await browser.evaluate(`
                    performance.getEntries()
                        .filter(e => e.entryType === 'resource' && (e.name.includes('.m3u8') || e.name.includes('.mp4')))
                        .map(e => e.name)
                `);
                networkSources?.forEach((url: string) => {
                    if (!videoSources.find(s => s.url === url)) {
                        videoSources.push({ url, type: url.includes('.m3u8') ? 'm3u8' : 'mp4', quality: 'auto', subtitles: [] });
                    }
                });
            }
        } catch (e: any) {
            console.log(`Error: ${e.message}`);
        } finally {
            if (browser) await browser.close();
        }

        return {
            server: "HentaiHaven",
            headers: {
                "Referer": "https://hentaihaven.xxx/",
                "Origin": "https://hentaihaven.xxx",
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            videoSources: videoSources,
        };
    }
}

