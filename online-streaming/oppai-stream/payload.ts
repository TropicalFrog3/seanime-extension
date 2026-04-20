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

    readonly SEARCH_URL = "https://oppai.stream/actions/search.php?order=recent&page=1&limit=35&genres=&blacklist=&studio=&ibt=0&swa=1&text=";
    // idk yet how to get the api url of seanime, so i just hardcoded it
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    _Server = "";

    //#endregion

    //#region methods

    getSettings(): Settings {
        return {
            // i don't think they have more server...
            episodeServers: [
                "oppai.stream"
            ],
            supportsDub: false,
        }
    }

    //#endregion

    //#region utility

    private getWordVector(word: string): number[] {
        // Dummy implementation: convert word to a vector of character codes
        // I'll probably change it one in an other update
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

    private scoreStringMatch(weight: number, text: string | undefined, query: string | undefined): number {
        // Simple scoring mechanism: 
        // +2 point if it the same
        // split into words: 
        //      TOTAL: +2/nb words
        //          -0% point to total per exact word match (case insensitive)
        //          -5% point to total if word query and word text have 80% similarity
        //          -10% point to total if word query and word text have 50% similarity
        //          -15% point to total if word query and word text have 30% similarity
        //          -20% point to total if word query and word text have 10% similarity
        //          -100% point to total if word query and word text have 0% similarity
        // Higher score means better match
        // below 0 means no match, Warn all my test were correct, but i didn't test them all

        if (!text || !query) return 0;

        text = text.toLowerCase();
        query = query.toLowerCase();

        let score = 0;
        if (text === query)
            return ScoreWeight.MaxScore * weight;

        const textWords = text.split(" ");
        const queryWords = query.split(" ");

        for (const word of queryWords) {
            if (textWords.includes(word)) {
                score += ScoreWeight.MaxScore / textWords.length;
            }
            else {
                const similarity = this.getWordSimilarity(word, textWords);
                score -= similarity * ScoreWeight.MaxScore / textWords.length;
            }
        }

        return score * weight;
    }

    private findBestTitle(movies: { Title: string; Url: string }[], opts: string): { Title: string; Url: string } | undefined {
        let bestScore = 0;
        let bestMovie: { Title: string; Url: string } | undefined;

        for (const movie of movies) {
            let score: number = 0;
            let strOutput = ""
            // TITLE
            score += this.scoreStringMatch(2, movie.Title, opts);
            strOutput += `Title: ${movie.Title} VS ${opts}, Current Score: ${score}\n`;

            console.log(`Movie: ${movie.Title}\n${strOutput}Total Score: ${score}\n--------------------`);

            if (score > bestScore) {
                bestScore = score;
                bestMovie = movie;
            }
        }

        if (bestMovie) {
            console.log("Best movie found:", bestMovie);
            return bestMovie;
        }
        return undefined;
    }

    private async findSubtitles(html, serverUrl: string, unpacked?: string): Promise<VideoSubtitle[]> {
        let subtitles: VideoSubtitle[] = [];
        const subtitleRegex = /<track\s+[^>]*src=["']([^"']+\.vtt(?:\?[^"']*)?)["'][^>]*>/gi;
        let trackMatches = html.matchAll(subtitleRegex);

        for (const match of trackMatches) {
            const src = match[1];
            const fullTag = match[0];

            let url = src.startsWith("http") ? src : `${serverUrl.split("/").slice(0, 3).join("/")}${src}`;

            // Attempt to extract language info
            const langMatch = fullTag.match(/(?:label|srclang)=["']?([a-zA-Z\-]{2,})["']?/i);
            const langCode = langMatch?.[1]?.toLowerCase() || "";

            const language = languageMap[langCode] || langCode || "Unknown";

            const isDefault = /default/i.test(fullTag);

            subtitles.push({
                id: `sub-${subtitles.length}`,
                url,
                language,
                isDefault,
            });
        }

        // Fallback: look for direct .vtt URLs (if <track> not used)
        if (subtitles.length === 0) {
            const rawSubtitleRegex = /https?:\/\/[^\s'"]+\.vtt(?:\?[^'"\s]*)?/g;
            let subtitleMatches = html.match(rawSubtitleRegex) || unpacked?.match(rawSubtitleRegex) || [];

            if (subtitleMatches.length > 0) {
                if (!subtitleMatches.some(url => url.startsWith("http"))) {
                    const baseUrl = serverUrl.split("/").slice(0, 3).join("/");
                    subtitleMatches = subtitleMatches.map(url => `${baseUrl}${url}`);
                }

                subtitles = subtitleMatches.map((url, idx) => {
                    const filename = url.split("/").pop() || "";
                    const codeMatch = filename.match(/([a-z]{2,3})(?=\.vtt)/i);
                    const langCode = codeMatch?.[1]?.toLowerCase() || "";
                    const language = languageMap[langCode] || langCode || "Unknown";

                    return {
                        id: `sub-${idx}`,
                        url,
                        language,
                        isDefault: idx === 0,
                    };
                });
            }
        }

        if (subtitles) {
            console.log("Subtitles found:", subtitles);
        }

        return subtitles;
    }

    private async findMediaUrls(type: VideoSourceType, html, serverUrl: string, resolutionMatch?: RegExpMatchArray, unpacked?: string): Promise<VideoSource[] | VideoSource | undefined> {

        const regex = new RegExp('https?:\\/\\/[^\'"]+\\.' + type + '(?:\\?[^\\s\'"]*)?(?:#[^\\s\'"]*)?', 'g');

        let VideoMatch = html.match(regex)
            || unpacked?.match(regex)
            || html.match(new RegExp(`"([^"]+\\.${type})"`, "g"))
            || unpacked?.match(new RegExp(`"([^"]+\\.${type})"`, "g"));

        if (VideoMatch) {
            if (!VideoMatch.some(url => url.startsWith("http"))) {
                const serverurldomain = serverUrl.split("/").slice(0, 3).join("/");
                VideoMatch = VideoMatch.map(url => `${serverurldomain}${url}`.replaceAll(`"`, ""));
            }

            if (VideoMatch.length > 1) {
                // If found multiple, euhm we are cooked... idk yet let me think of it lmao
                console.warn(`Found multiple ${type} URLs:`, VideoMatch);
                // for now take the first one idk
                VideoMatch.forEach(element => {
                    if (VideoMatch[0] !== element) {
                        VideoMatch.pop();
                    }
                });
            }
            else {
                console.log(`Found ${type} URL:`, VideoMatch[0]);
            }

            if (VideoMatch[0].includes(`master.${type}`)) {
                // fetch the match to see if the m3u8 is main or extension
                // get the referer of the ServerUrl
                const ref = serverUrl.split("/").slice(0, 3).join("/");
                const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(VideoMatch[0])}`);
                let reqHtml = await req.text();
                reqHtml = decodeURIComponent(reqHtml);
                let qual = "";
                let url = "";
                const videos: VideoSource[] = [];
                if (reqHtml.includes("#EXTM3U")) {
                    reqHtml.split("\n").forEach(line => {
                        if (line.startsWith("#EXT-X-STREAM-INF")) {
                            qual = line.split("RESOLUTION=")[1]?.split(",")[0] || "unknown";
                            const height = parseInt(qual.split("x")[1]) || 0;

                            if (height >= 1080) {
                                qual = "1080p";
                            } else if (height >= 720) {
                                qual = "720p";
                            } else if (height >= 480) {
                                qual = "480p";
                            } else if (height >= 360) {
                                qual = "360p";
                            } else {
                                qual = "unknown";
                            }
                        }
                        else if (line.startsWith("/api/v1/proxy?url=http")) {
                            url = line.replace("/api/v1/proxy?url=", "");
                        }

                        if (url && qual) {
                            videos.push({
                                url: url,
                                type: type,
                                quality: `${this._Server} - ${qual}`,
                                subtitles: []
                            })
                            url = "";
                            qual = "";
                        }
                    });
                }

                if (videos.length > 0) {
                    for (const video of videos) {
                        video.subtitles = await this.findSubtitles(html, serverUrl, unpacked);
                    }
                    return videos.sort((a, b) => {
                        const resolutionOrder = ["1080p", "720p", "480p", "360p", "unknown"];
                        const aIndex = resolutionOrder.indexOf(a.quality.split(" ")[2]);
                        const bIndex = resolutionOrder.indexOf(b.quality.split(" ")[2]);
                        return aIndex - bIndex;
                    });
                }
                else {
                    console.warn(`${type} master is not in a correct format`)
                }
            }
            else {
                console.warn(`No ${type} master URL found`);
            }


            // oppai stream quality exception
            const regex = /\/(\d{3,4})\//;
            const resolutionMatch = VideoMatch[0].match(regex);

            return {
                url: VideoMatch[0],
                quality: resolutionMatch ? resolutionMatch[1] : `${this._Server} - unknown`,
                type: type,
                subtitles: await this.findSubtitles(html, serverUrl, unpacked)
            };

        }

        return undefined;
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {

        const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`);
        if (!req.ok) {
            console.log("Failed to fetch server URL:", serverUrl, "Status:", req.status);
            return [];
        }

        const html = await req.text();

        // special case Dean Edwards’ Packer
        // .match(/eval\(function\(p,a,c,k,e,d\)(.*?)\)\)/s);
        function unpack(p, a, c, k) { while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]); return p }
        // regex is weird here so i did it manually
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
                const content = str.substring(start + openTag.length, end);
                results.push(content);
                pos = end + closeTag.length;
            }

            return results;
        }

        let unpacked;
        const scriptContents = extractScripts(html);
        for (const c of scriptContents) {
            let c2 = c;
            // change c for each 200 char put \n (it too long)
            for (let j = 0; j < c.length; j += 900) {
                c2 = c2.substring(0, j) + "\n" + c2.substring(j);
            }
            if (c.includes("eval(function(p,a,c,k,e,d)")) {

                console.log("Unpacked has been found.");
                const fullRegex = /eval\(function\([^)]*\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/;
                const match = c2.match(fullRegex);

                if (match) {
                    const packed = match[1];
                    const base = parseInt(match[2], 10);
                    const count = parseInt(match[3], 10);
                    const dict = match[4].split('|');

                    unpacked = unpack(packed, base, count, dict);
                    // decode unicode example \uXXXX
                    unpacked = unpacked.replace(/\\u([\d\w]{4})/gi, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
                        .replace(/%3C/g, '<').replace(/%3E/g, '>')
                        .replace(/%3F/g, '?')
                        .replace(/%3A/g, ':')
                        .replace(/%2C/g, ',')
                        .replace(/%2F/g, '/')
                        .replace(/%2B/g, '+')
                        .replace(/%20/g, ' ')
                        .replace(/%21/g, '!')
                        .replace(/%22/g, '"')
                        .replace(/%27/g, "'")
                        .replace(/%28/g, '(').replace(/%29/g, ')')
                        .replace(/%3B/g, ';');
                }
            }
        }

        // exception for oppai-stream
        // const resolutionRegex = /(?:^|[^a-zA-Z0-9])(\d{3,4})p(?=[^a-zA-Z0-9]|$)/;
        // const resolutionMatch =
        //     html.match(resolutionRegex) ||
        //     unpacked?.match(resolutionRegex);

        // if (resolutionMatch) {
        //     const resolution = resolutionMatch[1];
        //     console.log("Found resolution:", resolution);
        // }

        // look for .m3u8
        const m3u8Videos = await this.findMediaUrls("m3u8", html, serverUrl, undefined, unpacked);
        if (m3u8Videos !== undefined) {
            console.log("Found m3u8: ", m3u8Videos);
            return m3u8Videos;
        }

        // look for .mp4 do the same as .m3u8
        const mp4Videos = await this.findMediaUrls("mp4", html, serverUrl, undefined, unpacked);
        if (mp4Videos !== undefined) {
            console.log("Found mp4: ", mp4Videos);
            return mp4Videos;
        }

        console.warn("No m3u8 or mp4 URLs found in the server URL:", serverUrl, ". Make sure this is true.");
        return [];
    }

    //#endregion

    //#region main

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let tempquery = opts.query;

        while (tempquery !== "") {
            console.log(`Searching for query: "${tempquery}".`);
            const html = await fetch(this.SEARCH_URL + encodeURIComponent(tempquery)).then(res => res.text());
            const $ = await LoadDoc(html);
            const movies = $("div.in-grid.episode-shown")
            if (movies.length() <= 0) {
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }

            const movieList: { Title: string; Url: string }[] = [];
            movies.each((_, el) => {
                const title = el.find(".title-ep").text().trim();
                const url = el.find("a").attr("href")?.replace("&for=search", "");
                if (title && url) {
                    movieList.push({ Title: title, Url: url });
                }
            });
            const bestMovie = this.findBestTitle(movieList, opts.query);
            if (!bestMovie) {
                return [];
            }

            return <SearchResult[]>[{
                id: bestMovie.Url,
                title: bestMovie.Title,
                url: bestMovie.Url,
                subOrDub: opts.dub ? "dub" : "sub",
            }];
        }

        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        if (id === "" || !id) {
            return [];
        }
        const MainHtml = await fetch(id).then(res => res.text());
        const $ = await LoadDoc(MainHtml);
        const episodeDetails: EpisodeDetails[] = [];
        // map all episode URLs
        const eps = $("div.other-episodes.more-same-eps div.in-grid.episode-shown");

        eps.each((_, el) => {
            const id = el.attr("idgt");
            if (id) {
                const url = el.find("a").attr("href")?.replace("&for=episode-more", "") || "";
                episodeDetails.push({
                    id: url,
                    number: parseInt(el.find("h5 .ep").text(), 10),
                    title: el.find("h5 .title").text(),
                    url: url,
                });
            }
        });

        return episodeDetails;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        this._Server = _server;
        const servers = episode.id.split(",");
        // get the right url server
        const serverUrl = servers.find(server => server.includes(_server));
        const videoSources = <VideoSource[]>[];
        if (serverUrl && _server !== "") {
            console.log(`Handling server URL: ${serverUrl}`);
            const result = await this.HandleServerUrl(serverUrl);
            if (Array.isArray(result)) {
                videoSources.push(...result);
            } else {
                videoSources.push(result);
            }
        }
        else {
            console.log(`Server not found: ${_server}\n Try with these servers:\n- ${servers.map(url => {
                const parts = url.split("/");
                const partsServerName = parts[2] ? parts[2].split(".") : [];
                const serverName = partsServerName.length >= 3 ? partsServerName[1] : partsServerName[0];
                return serverName;
            }).join("\n- ")}`);
            if (servers.includes(_server)) {
                return <EpisodeServer>{
                    headers: {},
                    server: "",
                    videoSources: []
                }
            } else {
                return <EpisodeServer>{
                    headers: {},
                    server: "",
                    videoSources: []
                };
            }

        }

        if (videoSources.length > 0) {
            const ref = serverUrl.split("/").slice(0, 3).join("/");
            return {
                headers: {
                    referer: ref
                },
                server: _server,
                videoSources: videoSources
            };
        }
        else {
            console.log(`No video sources found for server: ${_server}`);
            return <EpisodeServer>{
                headers: {},
                server: "",
                videoSources: []
            }
        }
    }

    //#endregion
}