/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

const BASE_URL = "https://anikoto.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class Provider {

    getSettings(): Settings {
        return {
            episodeServers: ["Vidstream", "VidCloud"],
            supportsDub: true,
        };
    }

    private extractSlug(url: string): string {
        const m = url.match(/\/watch\/([^\/]+)/);
        return m ? m[1] : url;
    }

    private async doFetch(url: string, extraHeaders?: Record<string, string>): Promise<string> {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, "Referer": BASE_URL, ...(extraHeaders || {}) },
        });
        if (!res) throw new Error(`Fetch returned undefined for ${url}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.text();
    }

    // ── search ──────────────────────────────────────────────────────────

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        console.log(`--- SEARCH --- query="${opts.query}" dub=${opts.dub}`);
        try {
            const html = await this.doFetch(`${BASE_URL}/filter?keyword=${encodeURIComponent(opts.query)}`);
            const $ = LoadDoc(html);

            const links = $("a.name.d-title, a.d-title");
            const results: SearchResult[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < links.length(); i++) {
                const a = links.eq(i);
                const title = a.text().trim();
                let href = a.attr("href") || "";
                if (!title || !href) continue;
                if (!href.startsWith("http")) href = BASE_URL + href;
                const slug = this.extractSlug(href);
                if (seen.has(slug)) continue;
                seen.add(slug);
                const isDub = title.toLowerCase().includes("(dub)");
                if (isDub) {
                    results.push({
                        id: `${slug}|dub`,
                        title,
                        url: `${BASE_URL}/watch/${slug}`,
                        subOrDub: "dub",
                    });
                } else {
                    results.push({
                        id: `${slug}|sub`,
                        title: `${title} (Sub)`,
                        url: `${BASE_URL}/watch/${slug}`,
                        subOrDub: "sub",
                    });
                    results.push({
                        id: `${slug}|dub`,
                        title: `${title} (Dub)`,
                        url: `${BASE_URL}/watch/${slug}`,
                        subOrDub: "dub",
                    });
                }
            }

            console.log(`Found ${results.length} search results`);
            if (results.length === 0) return [];

            if (results.length > 1) {
                // If there's an exact match in the original titles, we can return the sub and dub versions of it
                const best = $scannerUtils.findBestMatch(opts.query, results.map(r => r.title.replace(" (Sub)", "").replace(" (Dub)", "")));
                const matches = results.filter(r => r.title.replace(" (Sub)", "").replace(" (Dub)", "") === best);
                if (matches.length > 0) return matches;
            }
            return results;
        } catch (e: any) {
            console.error(`Search error: ${e.message}`);
            return [];
        }
    }

    // ── episodes ────────────────────────────────────────────────────────

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const parts = id.split("|");
        const slug = parts[0];
        const type = parts.length > 1 ? parts[1] : "sub";
        console.log(`findEpisodes: slug="${slug}", type="${type}"`);
        try {
            // Step 1: Get the show page to extract the internal numeric ID
            const pageHtml = await this.doFetch(`${BASE_URL}/watch/${slug}`);

            // The show ID is in a data-id attribute
            const m = pageHtml.match(/data-id="(\d+)"/);
            const showId = m ? m[1] : "";
            console.log(`Show ID: ${showId}`);
            if (!showId) { console.log("Could not find show ID"); return []; }

            // Step 2: Fetch episode list via AJAX API
            const epJson = await this.doFetch(
                `${BASE_URL}/ajax/episode/list/${showId}`,
                { "X-Requested-With": "XMLHttpRequest" }
            );

            const epData = JSON.parse(epJson);
            if (!epData.result) { console.log("No episode data"); return []; }

            const $ep = LoadDoc(epData.result);
            const epLinks = $ep("a[data-num]");
            const episodes: EpisodeDetails[] = [];

            for (let i = 0; i < epLinks.length(); i++) {
                const a = epLinks.eq(i);
                const num = parseInt(a.attr("data-num") || "") || (i + 1);
                const dataIds = a.attr("data-ids") || "";
                const titleEl = a.find("span.d-title");
                const title = titleEl.text().trim() || `Episode ${num}`;

                // Store dataIds and type in the episode ID for server lookup
                episodes.push({
                    id: `${slug}|${dataIds}|${type}`,
                    number: num,
                    url: `${BASE_URL}/watch/${slug}/ep-${num}`,
                    title: title,
                });
            }

            console.log(`Found ${episodes.length} episodes`);
            return episodes;
        } catch (e: any) {
            console.error(`findEpisodes error: ${e.message}`);
            return [];
        }
    }

    // ── server ──────────────────────────────────────────────────────────

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        console.log(`findEpisodeServer: server="${server}" ep=${episode.number}`);
        const empty: EpisodeServer = { server, headers: {}, videoSources: [] };
        try {
            const parts = episode.id.split("|");
            const slug = parts[0];
            const dataIds = parts.length > 1 ? parts[1] : "";
            const type = parts.length > 2 ? parts[2] : "sub";
            if (!dataIds) { console.log("No data-ids"); return empty; }

            // Step 1: Fetch server list
            const srvJson = await this.doFetch(
                `${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`,
                { "X-Requested-With": "XMLHttpRequest" }
            );

            const srvData = JSON.parse(srvJson);
            if (!srvData.result) { console.log("No server data"); return empty; }

            const $srv = LoadDoc(srvData.result);
            const typeDiv = $srv(`div.type[data-type="${type}"]`);
            if (typeDiv.length() === 0) {
                console.log(`No servers for type ${type}`);
                return empty;
            }

            const serverItems = typeDiv.find("[data-link-id]");
            const serverTarget = server.toLowerCase();

            let linkId = "";
            let matchedName = "";

            for (let i = 0; i < serverItems.length(); i++) {
                const li = serverItems.eq(i);
                const name = li.text().trim();
                const lid = li.attr("data-link-id") || "";
                console.log(`  Server: "${name}" (link-id: ${lid})`);
                if (lid) {
                    const nl = name.toLowerCase();
                    if (nl.includes(serverTarget) || serverTarget.includes(nl.replace(/[-\d]/g, "").trim())) {
                        linkId = lid;
                        matchedName = name;
                        break;
                    }
                }
            }

            if (!linkId) {
                console.log(`Server "${server}" not found`);
                return empty;
            }

            console.log(`Trying server: "${matchedName}"`);

            try {
                // Step 2: Get embed URL
                const embedJson = await this.doFetch(
                    `${BASE_URL}/ajax/server?get=${encodeURIComponent(linkId)}`,
                    { "X-Requested-With": "XMLHttpRequest" }
                );

                const embedData = JSON.parse(embedJson);
                let embedUrl = embedData?.result?.url || "";
                if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
                console.log(`Embed: ${embedUrl}`);
                if (!embedUrl) return empty;

                // Step 3: Extract video sources
                const videoSources = await this.extractVideoSources(embedUrl, matchedName);
                if (videoSources.length === 0) {
                    console.log(`No sources from "${matchedName}"`);
                    return empty;
                }

                const referer = embedUrl.split("/").slice(0, 3).join("/");
                return {
                    server: matchedName,
                    headers: { Referer: referer, "User-Agent": UA },
                    videoSources,
                };
            } catch (serverErr: any) {
                console.log(`Server "${matchedName}" failed: ${serverErr.message}`);
                return empty;
            }
        } catch (e: any) {
            console.error(`findEpisodeServer error: ${e.message}`);
            return empty;
        }
    }

    // ── video extraction ────────────────────────────────────────────────

    /**
     * Extract video sources from an embed URL.
     * Flow:
     *   1. Fetch embed page HTML to extract data-id
     *   2. Call /stream/getSources?id={data-id} API to get m3u8 + subtitles
     *   3. Fall back to ChromeDP if the API approach fails
     */
    private async extractVideoSources(embedUrl: string, serverName: string): Promise<VideoSource[]> {
        console.log(`extractVideoSources: ${embedUrl}`);

        // Determine the embed host (e.g. https://vidwish.live)
        const embedHost = embedUrl.split("/").slice(0, 3).join("/");

        try {
            // Step 1: Fetch the embed page HTML
            const embedHtml = await this.doFetch(embedUrl, { Referer: BASE_URL });

            // Check for 410 / file-not-found error
            if (embedHtml.includes("Error Code: 410") || embedHtml.includes("can't find the file")) {
                console.log("Embed returned 410 / file not found");
                return [];
            }

            // Step 2: Extract the data-id from the player div
            const dataIdMatch = embedHtml.match(/data-id="(\d+)"/);
            if (!dataIdMatch) {
                console.log("No data-id found in embed page, trying ChromeDP fallback");
                return await this.extractViaChromedp(embedUrl, serverName);
            }
            const sourceId = dataIdMatch[1];
            console.log(`Source ID: ${sourceId}`);

            // Step 3: Call the getSources API
            const sourcesJson = await this.doFetch(
                `${embedHost}/stream/getSources?id=${sourceId}`,
                {
                    "X-Requested-With": "XMLHttpRequest",
                    Referer: embedUrl,
                    Accept: "application/json, text/javascript, */*; q=0.01",
                }
            );

            const sourcesData = JSON.parse(sourcesJson);
            console.log(`getSources response keys: ${Object.keys(sourcesData).join(", ")}`);

            // Extract the m3u8 URL
            let fileUrl = "";
            if (sourcesData.sources) {
                if (typeof sourcesData.sources === "string") {
                    fileUrl = sourcesData.sources;
                } else if (sourcesData.sources.file) {
                    fileUrl = sourcesData.sources.file;
                } else if (Array.isArray(sourcesData.sources) && sourcesData.sources.length > 0) {
                    fileUrl = sourcesData.sources[0].file || sourcesData.sources[0].url || "";
                }
            }

            if (!fileUrl) {
                console.log("No file URL in getSources response");
                return await this.extractViaChromedp(embedUrl, serverName);
            }

            console.log(`Video URL: ${fileUrl.substring(0, 80)}...`);

            // Extract subtitles from tracks
            const subtitles: VideoSubtitle[] = [];
            if (sourcesData.tracks && Array.isArray(sourcesData.tracks)) {
                for (let i = 0; i < sourcesData.tracks.length; i++) {
                    const track = sourcesData.tracks[i];
                    if (track.file && (track.kind === "captions" || track.kind === "subtitles")) {
                        subtitles.push({
                            id: `sub-${i}`,
                            url: track.file,
                            language: track.label || "Unknown",
                            isDefault: !!track.default,
                        });
                    }
                }
                console.log(`Found ${subtitles.length} subtitle track(s)`);
            }

            // Step 4: Parse the m3u8 for quality variants
            if (fileUrl.includes(".m3u8")) {
                return await this.parseM3u8(fileUrl, embedUrl, serverName, subtitles);
            }

            return [{ url: fileUrl, type: "mp4", quality: `${serverName} - auto`, subtitles }];
        } catch (e: any) {
            console.error(`extractVideoSources API error: ${e.message}`);
            return await this.extractViaChromedp(embedUrl, serverName);
        }
    }

    /**
     * ChromeDP fallback for video extraction when the API approach fails.
     */
    private async extractViaChromedp(embedUrl: string, serverName: string): Promise<VideoSource[]> {
        console.log(`extractViaChromedp: ${embedUrl}`);
        try {
            const browser = await ChromeDP.newBrowser({ headless: true, timeout: 35000 });
            try {
                await browser.navigate(embedUrl);
                await browser.sleep(8000);

                const raw = await browser.evaluate(`
                    (function(){
                        var v = document.querySelector('video');
                        if(v && v.src && !v.src.startsWith('blob:')) return JSON.stringify({url:v.src});
                        var s = document.querySelector('video source');
                        if(s && s.src) return JSON.stringify({url:s.src});
                        var entries = performance.getEntriesByType('resource');
                        for(var i=0;i<entries.length;i++){
                            var n = entries[i].name;
                            if(n.indexOf('.m3u8')!==-1 || n.indexOf('.mp4')!==-1)
                                return JSON.stringify({url:n});
                        }
                        return JSON.stringify({url:''});
                    })()
                `);
                await browser.close();

                const parsed = JSON.parse(raw);
                if (!parsed.url) { console.log("ChromeDP: No video source found"); return []; }
                console.log(`ChromeDP source: ${parsed.url.substring(0, 80)}`);

                if (parsed.url.includes(".m3u8")) return await this.parseM3u8(parsed.url, embedUrl, serverName, []);
                return [{ url: parsed.url, type: "mp4", quality: `${serverName} - auto`, subtitles: [] }];
            } catch (inner: any) {
                try { await browser.close(); } catch (_) {}
                throw inner;
            }
        } catch (e: any) {
            console.error(`extractViaChromedp error: ${e.message}`);
            return [];
        }
    }

    private async parseM3u8(
        m3u8Url: string,
        referer: string,
        serverName: string,
        subtitles: VideoSubtitle[],
    ): Promise<VideoSource[]> {
        try {
            const text = await this.doFetch(m3u8Url, { Referer: referer });
            if (!text.includes("#EXT-X-STREAM-INF")) {
                return [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles }];
            }
            const sources: VideoSource[] = [];
            const lines = text.split("\n");
            let qual = "";
            for (const line of lines) {
                if (line.includes("#EXT-X-STREAM-INF")) {
                    const rm = line.match(/RESOLUTION=\d+x(\d+)/);
                    qual = rm ? rm[1] + "p" : "auto";
                } else if (!line.startsWith("#") && line.trim()) {
                    let url = line.trim();
                    if (!url.startsWith("http")) url = m3u8Url.substring(0, m3u8Url.lastIndexOf("/")) + "/" + url;
                    sources.push({ url, type: "m3u8", quality: `${serverName} - ${qual || "auto"}`, subtitles });
                    qual = "";
                }
            }
            return sources.length > 0 ? sources : [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles }];
        } catch (e: any) {
            return [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles }];
        }
    }
}
