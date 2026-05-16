/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

//#region constants

//#region types

enum ScoreWeight {
    // query
    Title = 3.6,
    // dub
    Language = 2.5,
    // media.format
    SeasonOrFilm = 2.1,
    // year
    ReleaseDate = 1,
    // media.episodeCount
    EpisodeCount = 1,

    MaxScore = 10,
}

const languageMap: Record<string, string> = {
    "en": "English",
    "eng": "English",
    "es": "Spanish",
    "spa": "Spanish",
    "fr": "French",
    "it": "Italian",
    "ja": "Japanese",
    "jp": "Japanese",
};

//#endregion

class Provider {

    //#region variables

    readonly SEARCH_URL = "https://ww.animesultra.org/";
    readonly EPISODE_URL = "https://ww.animesultra.org/engine/ajax/full-story.php?"

    _Server = "";

    //#endregion

    //#region methods

    private async proxyFetch(url: string, init?: RequestInit): Promise<string> {
        try {
            const res = await fetch(url, init);
            if (!res) throw new Error(`Fetch returned undefined. The domain may be blocked or unreachable.`);
            if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
            const text = await res.text();
            if (text.includes("cf-challenge") || text.includes("Checking your browser")) {
                throw new Error("Cloudflare challenge detected");
            }
            return text;
        } catch (e: any) {
            console.error(`[FETCH ERROR] ${url}: ${e.message}`);
            if (init && init.method && init.method !== "GET") {
                throw e; // Do not use ChromeDP for non-GET requests
            }
            console.log(`[proxyFetch] Falling back to ChromeDP for ${url}`);
            try {
                const browser = await ChromeDP.newBrowser({ headless: true, timeout: 30000 });
                await browser.navigate(url);
                await browser.sleep(6000); // Wait for potential Cloudflare challenge to resolve
                
                let result = "";
                if (url.includes("ajax")) {
                    result = await browser.evaluate("document.body.innerText");
                } else {
                    result = await browser.evaluate("document.documentElement.outerHTML");
                }
                await browser.close();
                if (url.includes("vidstream")) {
                    console.log("VIDSTREAM HTML DUMP: " + result.substring(0, 500));
                }
                return result;
            } catch (ce: any) {
                console.error(`[ChromeDP ERROR] ${url}: ${ce.message}`);
                throw new Error(`Fetch and ChromeDP both failed for ${url}`);
            }
        }
    }

    getSettings(): Settings {
        return {
            episodeServers: [
                "vidmoly", "sendvid", "sibnet", "vidcdn", "mystream", "streamtape", "uqload", "cdnt2", "vip", "vid", "vidfast", "verystream", "rapids",
                "cloudvideo", "mytv", "myvi", "uptostream", "gtv", "fembed", "hydrax", "gou", "cdnt", "rapidvideo", "namba", "kaztube", "tune", "netu",
                "rutube", "dailymotion", "openload", "yandex", "ok", "vidspot", "cloudy", "google", "youtube", "moevideo", "mail", "mail2", "daisukianime"
            ],
            supportsDub: true,
        }
    }

    //#endregion

    //#region utility
    private generateQueryVariants(query: string, maxVariants = 3): string[] {
        const parts = query.trim().split(/[\s:']+/);
        const variants = [];
        for (let i = parts.length; i >= Math.max(parts.length - maxVariants + 1, 1); i--) {
            variants.push(parts.slice(0, i).join(" "));
        }
        return [...new Set(variants)];
    }

    private getWordVector(word: string): number[] {
        const vec = [];
        for (let i = 0; i < word.length; i++) vec.push(word.charCodeAt(i));
        return vec;
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        const len = Math.max(vec1.length, vec2.length);
        for (let i = 0; i < len; i++) {
            const v1 = vec1[i] || 0;
            const v2 = vec2[i] || 0;
            dotProduct += v1 * v2;
            mag1 += v1 * v1;
            mag2 += v2 * v2;
        }
        return mag1 && mag2 ? dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;
    }

    private getWordSimilarity(word1: string, words: string[]): number {
        const v1 = this.getWordVector(word1);
        let max = 0;
        for (let i = 0; i < words.length; i++) {
            const sim = this.cosineSimilarity(v1, this.getWordVector(words[i]));
            if (sim > max) max = sim;
        }
        return max;
    }

    private scoreStringMatch(weight: number, text: string | undefined, query: string | undefined): number {
        if (!text || !query) return 0;
        text = text.toLowerCase();
        query = query.toLowerCase();
        if (text === query) return ScoreWeight.MaxScore * weight;

        const textWords = text.split(" ");
        const queryWords = query.split(" ");
        let score = 0;

        for (let i = 0; i < queryWords.length; i++) {
            const word = queryWords[i];
            if (textWords.indexOf(word) !== -1) {
                score += ScoreWeight.MaxScore / textWords.length;
            } else {
                const similarity = this.getWordSimilarity(word, textWords);
                score -= similarity * ScoreWeight.MaxScore / textWords.length;
            }
        }
        return score * weight;
    }

    private findBestTitle(movies: { Title: string; Url: string }[], opts: string): { Title: string; Url: string } | undefined {
        let bestScore = -1000;
        let bestMovie: { Title: string; Url: string } | undefined;

        for (let i = 0; i < movies.length; i++) {
            const movie = movies[i];
            const score = this.scoreStringMatch(2, movie.Title, opts);
            if (score > bestScore) {
                bestScore = score;
                bestMovie = movie;
            }
        }
        return bestMovie;
    }

    private async findSubtitles(html: string, serverUrl: string, unpacked?: string): Promise<VideoSubtitle[]> {
        let subtitles: VideoSubtitle[] = [];
        const subtitleRegex = /<track\s+[^>]*src=["']([^"']+\.vtt(?:\?[^"']*)?)["'][^>]*>/gi;
        let match;
        while ((match = subtitleRegex.exec(html)) !== null) {
            const src = match[1];
            const fullTag = match[0];
            let url = src.startsWith("http") ? src : `${serverUrl.split("/").slice(0, 3).join("/")}${src}`;
            const langMatch = fullTag.match(/(?:label|srclang)=["']?([a-zA-Z\-]{2,})["']?/i);
            const langCode = langMatch ? langMatch[1].toLowerCase() : "";
            const language = languageMap[langCode] || langCode || "Unknown";
            subtitles.push({ id: `sub-${subtitles.length}`, url, language, isDefault: /default/i.test(fullTag) });
        }
        return subtitles;
    }

    private async findMediaUrls(type: string, html: string, serverUrl: string, resolutionMatch?: RegExpMatchArray | null, unpacked?: string): Promise<VideoSource[] | VideoSource | undefined> {
        const VideoMatch: string[] = [];
        
        // 1. Dedicated JWPlayer Source Extractor (Very reliable for Vidmoly)
        const jwMatch = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/i) || 
                        unpacked?.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/i);
        if (jwMatch) VideoMatch.push(jwMatch[1]);

        // 2. Aggressive Regex patterns
        const patterns = [
            new RegExp('https?:\\\\/\\\\/[^\\\\s\\\'\\\"<>]+?\\\\.' + type + '[^\\\\s\\\'\\\"<>]*', 'gi'), 
            new RegExp('https?:\\\\/\\\\/[^\\\\s\\\'\\\"<>]+?/' + type + '[^\\\\s\\\'\\\"<>]*', 'gi')
        ];

        const cleanHtml = html.replace(/\\\\\\//g, "/").replace(/\\\\/g, "");
        const cleanUnpacked = (unpacked || "").replace(/\\\\\\//g, "/").replace(/\\\\/g, "");

        for (let i = 0; i < patterns.length; i++) {
            const m = cleanHtml.match(patterns[i]) || cleanUnpacked.match(patterns[i]);
            if (m) VideoMatch.push(...m);
        }
        
        const simpleRegex = new RegExp(`(?:https?:\\/\\/|\\/)[^\\s'"]+\\.${type}(?:\\?[^\\s'"]*)?`, 'gi');
        const simpleMatches = cleanHtml.match(simpleRegex) || cleanUnpacked.match(simpleRegex);
        if (simpleMatches) VideoMatch.push(...simpleMatches);

        if (VideoMatch.length === 0) return undefined;
        
        // Deduplicate and clean URLs
        let origin = "";
        try { origin = new URL(serverUrl).origin; } catch(e) {}
        const serverurldomain = origin || serverUrl.split("/").slice(0, 3).join("/");
        
        const uniqueUrls = Array.from(new Set(VideoMatch.map(url => {
            let cleaned = url.replace(/[\"\'\\]/g, "").trim();
            if (cleaned.startsWith("/")) cleaned = origin + cleaned;
            return cleaned.startsWith("http") ? cleaned : `${serverurldomain}${cleaned.startsWith("/") ? "" : "/"}${cleaned}`;
        })));

        const subtitles = await this.findSubtitles(html, serverUrl, unpacked);
        const results: VideoSource[] = [];

        for (const currentUrl of uniqueUrls) {
            if (currentUrl.indexOf("master." + type) !== -1 || currentUrl.indexOf(".urlset") !== -1) {
                try {
                    // CRITICAL: Pass referer for verification
                    const reqHtml = await this.proxyFetch(currentUrl, { headers: { "Referer": serverUrl } });
                    if (reqHtml.indexOf("#EXTM3U") !== -1) {
                        let qual = "";
                        const lines = reqHtml.split("\n");
                        for (const line of lines) {
                            if (line.indexOf("#EXT-X-STREAM-INF") !== -1) {
                                const rMatch = line.match(/RESOLUTION=\d+x(\d+)/);
                                qual = rMatch ? rMatch[1] + "p" : "";
                            } else if (line.indexOf("#") === -1 && line.trim()) {
                                let segmentUrl = line.trim();
                                if (!segmentUrl.startsWith("http")) {
                                    segmentUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/')) + "/" + segmentUrl;
                                }
                                results.push({ url: segmentUrl, quality: `${this._Server} - ${qual || "auto"}`, type: type as any, subtitles: subtitles });
                                qual = "";
                            }
                        }
                    }
                } catch (e) {}
            } else {
                results.push({ url: currentUrl, quality: `${this._Server} - auto`, type: type as any, subtitles: subtitles });
            }
        }
        
        return results.length > 0 ? results : undefined;
    }

    unpack(p: string, a: number, c: number, k: string[]) {
        while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
        return p;
    }

    extractScripts(str: string): string[] {
        const results: string[] = [];
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scriptRegex.exec(str)) !== null) {
            if (match[1].trim()) results.push(match[1]);
        }
        return results;
    }

    async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {
        console.log(`HandleServerUrl: Starting for ${serverUrl}`);
        try {
            const html = await this.proxyFetch(serverUrl);
            
            // Specialized extraction for Voe and other obfuscated servers via ChromeDP evaluation
            if (serverUrl.includes("voe.sx") || serverUrl.includes("vidmoly") || serverUrl.includes("sendvid")) {
                console.log(`HandleServerUrl: Using ChromeDP evaluation for obfuscated server: ${serverUrl}`);
                try {
                    const browser = await ChromeDP.newBrowser({ headless: true, timeout: 30000 });
                    await browser.navigate(serverUrl);
                    await browser.sleep(5000); // Wait for scripts to run
                    
                    const extracted = await browser.evaluate(`
                        (function() {
                            const results = [];
                            // 1. Performance entries (very reliable for HLS/MP4)
                            const entries = performance.getEntriesByType("resource");
                            for (const entry of entries) {
                                if (entry.name.includes(".m3u8") || entry.name.includes(".mp4")) {
                                    results.push({ url: entry.name, type: entry.name.includes(".m3u8") ? "m3u8" : "mp4" });
                                }
                            }
                            // 2. Common player objects
                            if (window.jwplayer && typeof window.jwplayer === "function") {
                                try {
                                    const playlist = window.jwplayer().getPlaylist();
                                    if (playlist && playlist[0] && playlist[0].file) {
                                        results.push({ url: playlist[0].file, type: playlist[0].file.includes(".m3u8") ? "m3u8" : "mp4" });
                                    }
                                } catch(e) {}
                            }
                            // 3. Raw regex in the DOM
                            const html = document.documentElement.outerHTML;
                            const m3u8Match = html.match(/https?:\\/\\/[^\\s\\'\\"<>]+?\\.m3u8[^\\s\\'\\"<>]*/gi);
                            if (m3u8Match) m3u8Match.forEach(u => results.push({ url: u, type: "m3u8" }));
                            
                            return JSON.stringify(results);
                        })()
                    `);
                    await browser.close();
                    
                    const sources = JSON.parse(extracted);
                    if (sources && sources.length > 0) {
                        const unique = Array.from(new Set(sources.map((s: any) => s.url)));
                        const finalSources: VideoSource[] = [];
                        for (const url of unique as string[]) {
                            const s = sources.find((src: any) => src.url === url);
                            finalSources.push({
                                url: url,
                                type: s.type as VideoSourceType,
                                quality: "Auto",
                                subtitles: []
                            });
                        }
                        console.log(`HandleServerUrl: ChromeDP found ${finalSources.length} sources`);
                        return finalSources;
                    }
                } catch (ce: any) {
                    console.log(`HandleServerUrl: ChromeDP evaluation failed: ${ce.message}`);
                }
            }

            let unpacked: string | undefined;
            const scriptContents = this.extractScripts(html);
            for (let i = 0; i < scriptContents.length; i++) {
                const c = scriptContents[i];
                if (c.indexOf("eval(function(p,a,c,k,e,d)") !== -1) {
                    const match = c.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/);
                    if (match) {
                        unpacked = this.unpack(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'));
                        unpacked = unpacked.replace(/\\u([\d\w]{4})/gi, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
                        console.log(`HandleServerUrl: Unpacked script length: ${unpacked.length}`);
                    }
                }
            }
            const resRegex = /(?:^|[^a-zA-Z0-9])(\d{3,4})p(?=[^a-zA-Z0-9]|$)/;
            const resMatch = html.match(resRegex) || unpacked?.match(resRegex);
            const m3u8 = await this.findMediaUrls("m3u8", html, serverUrl, resMatch, unpacked);
            if (m3u8) return m3u8;
            return await this.findMediaUrls("mp4", html, serverUrl, resMatch, unpacked) || [];
        } catch (e: any) {
            return [];
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        console.log("--- SEARCH STARTED --- " + opts.query);
        try {
            const queryVariants = this.generateQueryVariants(opts.query);
            
            // Search variants sequentially for faster early exit
            for (const variant of queryVariants) {
                console.log(`Searching variant: ${variant}`);
                const params = new URLSearchParams({ do: "search", subaction: "search", full_search: "0", result_from: "1", story: variant });
                try {
                    const html = await this.proxyFetch(`${this.SEARCH_URL}?${params.toString()}`);
                    const $ = await LoadDoc(html);
                    let movies = $("div#dle-content .flw-item");
                    if (!movies || movies.length() === 0) movies = $("div#dle-content .short-story, .movie-item");
                    
                    const variantList: { Title: string; Url: string }[] = [];
                    for (let i = 0; i < movies.length(); i++) {
                        const el = movies.eq(i);
                        const Poster = el.find("a.film-poster-ahref");
                        const title = Poster.attr("title")?.trim() || el.find(".film-name").text().trim() || "";
                        const url = Poster.attr("href")?.trim() || "";
                        if (title && url) variantList.push({ Title: title, Url: url });
                    }

                    const best = this.findBestTitle(variantList, opts.query);
                    if (best) {
                        return [{ 
                            id: best.Url.split("/").pop()!.split("-")[0], 
                            title: best.Title, 
                            url: best.Url, 
                            subOrDub: best.Title.toLowerCase().indexOf("vf") !== -1 ? "dub" : "sub" 
                        }];
                    }
                } catch (e) {}
            }
            return [];
        } catch (error: any) {
            return [];
        }
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        try {
            console.log("findEpisodes: Fetching AJAX for " + id);
            const ajaxHtml = await this.proxyFetch(`${this.EPISODE_URL}newsId=${id}&d=${new Date().getTime()}`);
            const ajaxDoc = await LoadDoc(JSON.parse(ajaxHtml).html);
            const epsUrl = ajaxDoc(".ep-item");
            const episodeDetails: EpisodeDetails[] = [];
            for (let i = 0; i < epsUrl.length(); i++) {
                const el = epsUrl.eq(i);
                episodeDetails.push({
                    id: id,
                    number: parseInt(el.attr("data-number") || "0"),
                    url: el.attr("href") || "",
                    title: el.attr("title") || `Episode ${i + 1}`
                });
            }
            return episodeDetails;
        } catch (error: any) {
            return [];
        }
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        this._Server = _server;
        try {
            console.log(`findEpisodeServer: Target="${_server}" URL=${episode.url}`);
            const episodeHtml = await this.proxyFetch(episode.url);
            const episodeDoc = await LoadDoc(episodeHtml);
            const serverItems = episodeDoc(".server-item");
            const serverUrls: string[] = [];
            let ajaxHtml = "";
            let ajaxDoc: any = null;

            for (let i = 0; i < serverItems.length(); i++) {
                const serverEl = serverItems.eq(i);
                const serverName = serverEl.text().trim().toLowerCase();
                const target = _server.toLowerCase();
                
                console.log(`SERVER ITEM ${i}: name="${serverName}" embed="${serverEl.attr("data-embed")}" sid="${serverEl.attr("data-server-id")}" href="${serverEl.attr("href")}" durl="${serverEl.attr("data-url")}" dsrc="${serverEl.attr("data-src")}"`);
                
                if (serverName.indexOf(target) !== -1 || target.indexOf(serverName) !== -1) {
                    console.log(`findEpisodeServer: Found matching server element: "${serverName}"`);
                    let url = serverEl.attr("data-embed") || serverEl.attr("href") || serverEl.attr("data-url") || serverEl.attr("data-src");
                    
                    if (!url) {
                        const sid = serverEl.attr("data-server-id");
                        if (!ajaxDoc) {
                            console.log("findEpisodeServer: Fetching fallback AJAX...");
                            ajaxHtml = await this.proxyFetch(`${this.EPISODE_URL}newsId=${episode.id}&d=${new Date().getTime()}`);
                            console.log(`AJAX RESPONSE (first 200 chars): ${ajaxHtml.substring(0, 200)}`);
                            try {
                                const parsed = JSON.parse(ajaxHtml);
                                ajaxHtml = parsed.html || "";
                                console.log(`AJAX PARSED HTML (first 200 chars): ${ajaxHtml.substring(0, 200)}`);
                                ajaxDoc = await LoadDoc(ajaxHtml);
                            } catch (e) {
                                console.log("findEpisodeServer: AJAX parse failed");
                            }
                        }
                        
                        if (ajaxDoc) {
                            const playerEl = ajaxDoc(`#content_player_${sid}`);
                            url = playerEl.text().trim();
                            console.log(`findEpisodeServer: Player element text for sid=${sid}: "${url}"`);
                            // Fallback: If text is empty, check for iframes or scripts inside the container
                            if (!url) {
                                const container = ajaxDoc(`#content_player_${sid}`);
                                url = container.find("iframe").attr("src") || container.find("script").attr("src") || "";
                            }
                        }
                        
                        // Last resort: Regex search in the raw AJAX HTML for the specific player ID
                        if (!url && ajaxHtml) {
                            const regex = new RegExp(`id=["']content_player_${sid}["'][^>]*>(.*?)<\/div>`, "is");
                            const match = ajaxHtml.match(regex);
                            if (match && match[1]) {
                                const inner = match[1];
                                const urlMatch = inner.match(/src=["']([^"']+)["']/i) || inner.match(/https?:\/\/[^\s"'<>]+/i);
                                if (urlMatch) url = urlMatch[1] || urlMatch[0];
                            }
                        }
                    }

                    if (url) {
                        if (/^\d+$/.test(url)) url = `https://video.sibnet.ru/shell.php?videoid=${url}`;
                        if (url.startsWith("//")) url = "https:" + url;
                    }

                    // Global HTML fallback: If the extracted URL is empty or suspicious (e.g. vidstream.pro), 
                    // scan the entire episode HTML for known server patterns
                    if (!url || url.includes("vidstream.pro")) {
                        console.log(`findEpisodeServer: URL is suspicious or empty ("${url}"), scanning global HTML...`);
                        const patterns = [
                            /https?:\/\/voe\.sx\/e\/[a-zA-Z0-9]+/i,
                            /https?:\/\/video\.sibnet\.ru\/shell\.php\?videoid=\d+/i,
                            /https?:\/\/sendvid\.com\/embed\/[a-zA-Z0-9]+/i,
                            /https?:\/\/vidmoly\.to\/embed-[a-zA-Z0-9]+\.html/i
                        ];
                        const episodeHtml = await this.proxyFetch(episode.url);
                        for (const pattern of patterns) {
                            const match = episodeHtml.match(pattern);
                            if (match) {
                                // Only use it if it matches the server name we're looking for
                                if (match[0].includes(target) || (target === "sibnet" && match[0].includes("sibnet"))) {
                                    url = match[0];
                                    console.log(`findEpisodeServer: Found global match for ${target}: ${url}`);
                                    break;
                                }
                            }
                        }
                    }

                    if (url) {
                        console.log(`findEpisodeServer: Final extracted URL: ${url.substring(0, 50)}...`);
                        serverUrls.push(url);
                    }
                }
            }

            let finalReferer = serverUrls[0]?.split("/").slice(0, 3).join("/") || "";
            
            // Extract all servers in parallel
            const serverResults = await Promise.all(serverUrls.map(async (url) => {
                try {
                    const res = await this.HandleServerUrl(url);
                    if (res && (Array.isArray(res) ? res.length > 0 : true)) {
                        return { res, url };
                    }
                } catch (e) {}
                return null;
            }));

            const videoSources: VideoSource[] = [];
            for (const result of serverResults) {
                if (result) {
                    if (Array.isArray(result.res)) videoSources.push(...result.res);
                    else videoSources.push(result.res);
                    // Use the domain of the first successful server as primary referer
                    if (videoSources.length === (Array.isArray(result.res) ? result.res.length : 1)) {
                        finalReferer = result.url.split("/").slice(0, 3).join("/");
                    }
                }
            }

            return { 
                headers: { 
                    "Referer": finalReferer,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }, 
                server: _server, 
                videoSources: videoSources 
            };
        } catch (error: any) {
            console.log("findEpisodeServer error: " + error.message);
            return { headers: {}, server: "", videoSources: [] };
        }
    }
}