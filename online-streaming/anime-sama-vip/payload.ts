/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

//#region console

const DevMode = true;
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
    if (DevMode) {
        originalConsoleLog.apply(console, args);
    }
};

//#endregion

//#region types

type MovieJson = {
    title: string,
    link: string,
    postId: string,
    label: string, // e.g. "Anime", "Film", "Saison 1 Episode 3"
}

enum ScoreWeight {
    Title = 3.6,
    ReleaseDate = 1,
    EpisodeCount = 1,
    MaxScore = 10,
}

//#endregion

class Provider {

    //#region variables

    readonly BASE_URL = "https://v11.anime-sama.vip/";
    readonly SEARCH_URL = "https://v11.anime-sama.vip/index.php";
    readonly AJAX_URL = "https://v11.anime-sama.vip/engine/ajax/controller.php";
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    _Server = "";

    //#endregion

    //#region methods

    getSettings(): Settings {
        return {
            episodeServers: [
                "vidmoly", "myvi", "vudeo", "dood", "mixdrop", "ok", "mail", "rutube", "fembed", "mp4upload", "sibnet"
            ],
            supportsDub: true,
        }
    }

    //#endregion

    //#region utility

    private getWordVector(word: string): number[] {
        return Array.from(word).map(char => char.charCodeAt(0));
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        const dotProduct = vec1.reduce((sum, val, i) => sum + val * (vec2[i] || 0), 0);
        const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
        return magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
    }

    private getWordSimilarity(word1: string, words: string[]): number {
        const word1Vector = this.getWordVector(word1);
        let maxSimilarity = 0;
        for (const word2 of words) {
            const word2Vector = this.getWordVector(word2);
            const similarity = this.cosineSimilarity(word1Vector, word2Vector);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        return maxSimilarity;
    }

    private scoreStringMatch(weight: ScoreWeight, text: string | undefined, query: string | undefined): number {
        if (!text || !query) return 0;
        text = text.toLowerCase();
        query = query.toLowerCase();
        if (text === query) return ScoreWeight.MaxScore * weight;
        if (text.replace(/\s/g, '') === query.replace(/\s/g, '')) return ScoreWeight.MaxScore * weight * 0.9;

        let score = 0;
        const textWords = text.split(" ");
        const queryWords = query.split(" ");

        for (const word of queryWords) {
            if (textWords.includes(word)) {
                score += ScoreWeight.MaxScore / textWords.length;
            } else {
                const similarity = this.getWordSimilarity(word, textWords);
                score -= (1 - similarity) * ScoreWeight.MaxScore / textWords.length;
            }
        }
        return score * weight;
    }

    private findBestTitle(movies: MovieJson[], opts: SearchOptions): MovieJson | undefined {
        let bestScore = -Infinity;
        let bestMovie: MovieJson | undefined;

        for (const movie of movies) {
            let score = this.scoreStringMatch(ScoreWeight.Title, movie.title, opts.query);

            // Check if format matches (Film vs Anime)
            const isFilm = movie.label.toLowerCase().includes("film");
            const requestedFilm = opts.media.format === "MOVIE";
            if (isFilm !== requestedFilm) {
                score -= 5;
            }

            console.log(`Movie: ${movie.title}, Label: ${movie.label}, Score: ${score}`);

            if (score > bestScore) {
                bestScore = score;
                bestMovie = movie;
            }
        }

        if (bestMovie && bestScore > 0) {
            console.log("Best movie found:", bestMovie.title);
            return bestMovie;
        }
        return undefined;
    }

    private async findMediaUrls(type: VideoSourceType, html, serverUrl: string, resolutionMatch?: RegExpMatchArray, unpacked?: string): Promise<VideoSource[] | VideoSource | undefined> {
        const regex = new RegExp('https?:\\/\\/[^\'"]+\\.' + type + '(?:\\?[^\\s\'"]*)?(?:#[^\\s\'"]*)?', 'g');
        const relativeRegex = new RegExp('[\'"](\\/[^\'"]+\\.' + type + '(?:\\?[^\\s\'"]*)?(?:#[^\\s\'"]*)?)[\'"]', 'g');
        let VideoMatch = html.match(regex)
            || unpacked?.match(regex)
            || html.match(relativeRegex)
            || unpacked?.match(relativeRegex);

        if (VideoMatch) {
            console.log(`[DEBUG] findMediaUrls: Found ${VideoMatch.length} matches for ${type}`);
            VideoMatch = VideoMatch.map(url => url.replace(/['"]/g, ""));
            if (!VideoMatch[0].startsWith("http")) {
                if (VideoMatch[0].startsWith("//")) {
                    VideoMatch = VideoMatch.map(url => `https:${url}`);
                } else {
                    const serverurldomain = serverUrl.split("/").slice(0, 3).join("/");
                    VideoMatch = VideoMatch.map(url => `${serverurldomain}${url.startsWith("/") ? "" : "/"}${url}`);
                }
            }

            console.log(`Found ${type} URL:`, VideoMatch[0]);

            if (VideoMatch[0].includes(`master.${type}`)) {
                const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(VideoMatch[0])}`);
                let reqHtml = await req.text();
                reqHtml = decodeURIComponent(reqHtml);
                const videos: VideoSource[] = [];
                if (reqHtml.includes("#EXTM3U")) {
                    let qual = "";
                    let url = "";
                    reqHtml.split("\n").forEach(line => {
                        if (line.startsWith("#EXT-X-STREAM-INF")) {
                            qual = line.split("RESOLUTION=")[1]?.split(",")[0] || "unknown";
                            const height = parseInt(qual.split("x")[1]) || 0;
                            if (height >= 1080) qual = "1080p";
                            else if (height >= 720) qual = "720p";
                            else if (height >= 480) qual = "480p";
                            else if (height >= 360) qual = "360p";
                            else qual = "unknown";
                        } else if (line.startsWith("http") || line.startsWith("/api/v1/proxy?url=http")) {
                            url = line.replace("/api/v1/proxy?url=", "");
                        }

                        if (url && qual) {
                            videos.push({
                                url: url,
                                type: type,
                                quality: `${this._Server} - ${qual}`,
                                subtitles: []
                            });
                            url = ""; qual = "";
                        }
                    });
                }

                if (videos.length > 0) {
                    return videos.sort((a, b) => {
                        const resolutionOrder = ["1080p", "720p", "480p", "360p", "unknown"];
                        const qA = a.quality.includes(" - ") ? a.quality.split(" - ")[1] : a.quality;
                        const qB = b.quality.includes(" - ") ? b.quality.split(" - ")[1] : b.quality;
                        return resolutionOrder.indexOf(qA) - resolutionOrder.indexOf(qB);
                    });
                }
            }

            return {
                url: VideoMatch[0],
                quality: resolutionMatch ? resolutionMatch[1] : `${this._Server} - unknown`,
                type: type,
                subtitles: []
            };
        }
        return undefined;
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {
        const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`);
        if (!req.ok) return [];
        const html = await req.text();

        function unpack(p, a, c, k) { while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]); return p }
        function extractScripts(str: string): string[] {
            const results: string[] = [];
            const openTag = "<script type='text/javascript'>";
            const closeTag = "</script>";
            let pos = 0;
            while (pos < str.length) {
                const start = str.indexOf(openTag, pos);
                if (start === -1) break;
                const end = str.indexOf(closeTag, start);
                if (end === -1) break;
                results.push(str.substring(start + openTag.length, end));
                pos = end + closeTag.length;
            }
            return results;
        }

        let unpacked;
        const scriptContents = extractScripts(html);
        for (const c of scriptContents) {
            if (c.includes("eval(function(p,a,c,k,e,d)")) {
                const fullRegex = /eval\(function\([^)]*\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/;
                const match = c.match(fullRegex);
                if (match) {
                    unpacked = unpack(match[1], parseInt(match[2], 10), parseInt(match[3], 10), match[4].split('|'));
                    unpacked = unpacked.replace(/\\u([\d\w]{4})/gi, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
                }
            }
        }

        const resolutionMatch = html.match(/(\d{3,4})p(?=[" ])/) || unpacked?.match(/(\d{3,4})p(?=[" ])/);
        const m3u8Videos = await this.findMediaUrls("m3u8", html, serverUrl, resolutionMatch, unpacked);
        if (m3u8Videos) return m3u8Videos;

        const mp4Videos = await this.findMediaUrls("mp4", html, serverUrl, resolutionMatch, unpacked);
        if (mp4Videos) return mp4Videos;

        console.log(`[DEBUG] HandleServerUrl: No videos found for ${serverUrl}`);
        return [];
    }

    //#endregion

    //#region main

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const url = `${this.SEARCH_URL}?do=search&subaction=search&story=${encodeURIComponent(opts.query)}`;
        console.log(`Searching for: ${opts.query} at ${url}`);

        const html = await fetch(url).then(res => res.text());

        const $ = await LoadDoc(html);
        const movies: MovieJson[] = [];

        const items = $("li.short-list_item");

        items.each((_, el) => {
            const a = el.find("a.poster-short");
            const title = a.find(".poster-short_title").text().trim();
            const link = a.attr("href") || "";
            const label = a.find(".poster-label_text").text().trim();
            const match = link.match(/\/(\d+)-/);
            const postId = match ? match[1] : "";

            if (title && link) {
                movies.push({ title, link, postId, label });
            }
        });

        if (movies.length === 0) {
            return [];
        }

        const bestMovie = this.findBestTitle(movies, opts);
        if (bestMovie) {
            return [{
                id: `${bestMovie.link}|${bestMovie.postId}`,
                title: bestMovie.title,
                url: bestMovie.link,
                subOrDub: "both", // Site provides both on the same page
            }];
        }
        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const [url, postId] = id.split("|");
        const ajaxUrl = `${this.AJAX_URL}?mod=iframe_player&post_id=${postId}`;
        const data = await fetch(ajaxUrl).then(res => res.json());

        if (!data.success || !data.selectors) return [];

        const $ = await LoadDoc(data.selectors);
        const episodes: EpisodeDetails[] = [];

        // Find correct dubbing
        // 1 = VF, 3 = VOSTFR (common values, we'll try to be smart)
        let dubbingVal = "3"; // Default to VOSTFR
        $("select[name='dubbing'] option").each((_, opt) => {
            const text = opt.text().toLowerCase();
            if (text.includes("vostfr")) dubbingVal = opt.attr("value") || "3";
        });

        // Find correct source (Saison)
        // For now, take the first one or try to match if multiple seasons are on the same page
        let sourceVal = $("select[name='source'] option:first").attr("value") || "1";

        $("select[name='series'] option").each((_, opt) => {
            const epNum = parseInt(opt.text().replace("Episode ", "").trim());
            const seriesVal = opt.attr("value");
            if (!isNaN(epNum) && seriesVal) {
                episodes.push({
                    id: `${postId}|source=${sourceVal}&series=${seriesVal}&dubbing=${dubbingVal}`,
                    number: epNum,
                    url: url
                });
            }
        });

        return episodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        this._Server = _server;
        const [postId, selectStr] = episode.id.split("|");
        
        // 1. Fetch selectors to find the correct source for the requested server
        const selectorUrl = `${this.AJAX_URL}?mod=iframe_player&post_id=${postId}`;
        const selectorData = await fetch(selectorUrl).then(res => res.json());
        
        let finalSelect = selectStr;
        if (selectorData.success && selectorData.selectors) {
            const $s = await LoadDoc(selectorData.selectors);
            let sourceVal = "";
            $s("select[name='source'] option").each((_, opt) => {
                const text = opt.text().toLowerCase();
                if (text.includes(_server.toLowerCase())) {
                    sourceVal = opt.attr("value") || "";
                }
            });
            
            if (sourceVal) {
                // Replace the source=X part in the select string
                finalSelect = selectStr.replace(/source=\d+/, `source=${sourceVal}`);
                console.log(`[DEBUG] findEpisodeServer: Found matching source "${sourceVal}" for server "${_server}"`);
            }
        }

        const ajaxUrl = `${this.AJAX_URL}?mod=iframe_player&post_id=${postId}&select=${encodeURIComponent(finalSelect)}`;
        const data = await fetch(ajaxUrl).then(res => res.json());

        if (!data.success || !data.player) {
            return { server: _server, headers: {}, videoSources: [] };
        }

        const $ = await LoadDoc(data.player);
        const iframeSrc = $("iframe").attr("src");

        if (iframeSrc) {
            console.log(`Handling server URL: ${iframeSrc}`);
            const result = await this.HandleServerUrl(iframeSrc);
            const videoSources = Array.isArray(result) ? result : [result];

            if (videoSources.length > 0) {
                const ref = iframeSrc.split("/").slice(0, 3).join("/");
                return {
                    headers: { referer: ref },
                    server: _server,
                    videoSources: videoSources
                };
            }
        }

        return { server: _server, headers: {}, videoSources: [] };
    }

    //#endregion
}