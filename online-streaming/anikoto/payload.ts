/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

const BASE_URL = "https://anikoto.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class Provider {

    getSettings(): Settings {
        return {
            episodeServers: ["Vidstream", "MegaCloud"],
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
            const html = await this.doFetch(`${BASE_URL}/search?keyword=${encodeURIComponent(opts.query)}`);
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
                results.push({
                    id: slug,
                    title,
                    url: `${BASE_URL}/watch/${slug}`,
                    subOrDub: isDub ? "dub" : "sub",
                });
            }

            console.log(`Found ${results.length} search results`);
            if (results.length === 0) return [];

            if (results.length > 1) {
                const best = $scannerUtils.findBestMatch(opts.query, results.map(r => r.title));
                const match = results.find(r => r.title === best);
                if (match) return [match];
            }
            return [results[0]];
        } catch (e: any) {
            console.error(`Search error: ${e.message}`);
            return [];
        }
    }

    // ── episodes ────────────────────────────────────────────────────────

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        console.log(`findEpisodes: slug="${id}"`);
        try {
            // Step 1: Get the show page to extract the internal numeric ID
            const pageHtml = await this.doFetch(`${BASE_URL}/watch/${id}`);

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

                // Store dataIds in the episode ID for server lookup
                episodes.push({
                    id: `${id}|${dataIds}`,
                    number: num,
                    url: `${BASE_URL}/watch/${id}/ep-${num}`,
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
            const dataIds = parts.length > 1 ? parts.slice(1).join("|") : "";
            if (!dataIds) { console.log("No data-ids"); return empty; }

            // Step 1: Fetch server list
            const srvJson = await this.doFetch(
                `${BASE_URL}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`,
                { "X-Requested-With": "XMLHttpRequest" }
            );

            const srvData = JSON.parse(srvJson);
            if (!srvData.result) { console.log("No server data"); return empty; }

            const $srv = LoadDoc(srvData.result);
            const serverItems = $srv("[data-link-id]");
            const serverTarget = server.toLowerCase();

            let linkId = "";
            let matchedName = "";

            for (let i = 0; i < serverItems.length(); i++) {
                const li = serverItems.eq(i);
                const name = li.text().trim();
                console.log(`  Server: "${name}"`);

                if (!linkId) {
                    const nl = name.toLowerCase();
                    if (nl.includes(serverTarget) || serverTarget.includes(nl.replace(/[-\d]/g, "").trim())) {
                        linkId = li.attr("data-link-id") || "";
                        matchedName = name;
                    }
                }
            }

            if (!linkId && serverItems.length() > 0) {
                linkId = serverItems.eq(0).attr("data-link-id") || "";
                matchedName = serverItems.eq(0).text().trim();
                console.log(`  Fallback: "${matchedName}"`);
            }

            if (!linkId) { console.log("No link-id"); return empty; }
            console.log(`Using: "${matchedName}"`);

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
            const videoSources = await this.extractVideoSources(embedUrl, matchedName || server);
            const referer = embedUrl.split("/").slice(0, 3).join("/");

            return {
                server: matchedName || server,
                headers: { Referer: referer, "User-Agent": UA },
                videoSources,
            };
        } catch (e: any) {
            console.error(`findEpisodeServer error: ${e.message}`);
            return empty;
        }
    }

    // ── video extraction ────────────────────────────────────────────────

    private async extractVideoSources(embedUrl: string, serverName: string): Promise<VideoSource[]> {
        console.log(`extractVideoSources: ${embedUrl}`);
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
                        var html = document.documentElement.outerHTML;
                        var m = html.match(/(?:file|src|source)["'\\s]*[:=]\\s*["'](https?:\\/\\/[^"']+\\.m3u8[^"']*)['"]/i);
                        if(m) return JSON.stringify({url:m[1]});
                        m = html.match(/(?:file|src|source)["'\\s]*[:=]\\s*["'](https?:\\/\\/[^"']+\\.mp4[^"']*)['"]/i);
                        if(m) return JSON.stringify({url:m[1]});
                        return JSON.stringify({url:''});
                    })()
                `);
                await browser.close();

                const parsed = JSON.parse(raw);
                if (!parsed.url) { console.log("No video source found"); return []; }
                console.log(`Source: ${parsed.url.substring(0, 80)}`);

                if (parsed.url.includes(".m3u8")) return await this.parseM3u8(parsed.url, embedUrl, serverName);
                return [{ url: parsed.url, type: "mp4", quality: `${serverName} - auto`, subtitles: [] }];
            } catch (inner: any) {
                try { await browser.close(); } catch (_) {}
                throw inner;
            }
        } catch (e: any) {
            console.error(`extractVideoSources error: ${e.message}`);
            return [];
        }
    }

    private async parseM3u8(m3u8Url: string, referer: string, serverName: string): Promise<VideoSource[]> {
        try {
            const text = await this.doFetch(m3u8Url, { Referer: referer });
            if (!text.includes("#EXT-X-STREAM-INF")) {
                return [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles: [] }];
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
                    sources.push({ url, type: "m3u8", quality: `${serverName} - ${qual || "auto"}`, subtitles: [] });
                    qual = "";
                }
            }
            return sources.length > 0 ? sources : [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles: [] }];
        } catch (e: any) {
            return [{ url: m3u8Url, type: "m3u8", quality: `${serverName} - auto`, subtitles: [] }];
        }
    }
}
