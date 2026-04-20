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
    nbEp: number,
    SeasonOrFilm: SorF,
    details: MovieDetails,
}

type SorF = "saison" | "film";

type MovieDetails = {
    synopsis: string,
    director: string,
    actors: string[],
    releaseDate: string,
    version: string,
}

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

//#endregion

class Provider {

    //#region variables

    readonly SEARCH_URL_2 = "https://french-anime.com/&do=search&subaction=search&story=";
    readonly SEARCH_URL_3 = "https://french-anime.com/";
    // idk yet how to get the api url of seanime, so i just hardcoded it
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    _Server = "";

    //#endregion

    //#region methods

    getSettings(): Settings {
        return {
            episodeServers: [
                "vidmoly", "jilliandescribecompany", "luluvid", "uqload", "filelions", "getvid", "sibnet", "ups2up",
                "myvi", "mixdrop", "ok", "mail", "iframedream", "rutube", "fembed", "mp4upload", "gvstream", "gvlod", "upvid", "dood",
                "ninjastream", "streamtape", "vudeo", "sbfast", "streamlare", "sbfull", "sbthe", "upstream", "vvide0", "hqq", "mvidoo", "vido",
                "sbspeed", "sblanh", "upvideo", "streamvid", "streamhide", "lvturbo", "guccihide", "likessb", "streamhub",
                "charlestoughrace", "up4fun", "savefiles"
            ],
            supportsDub: true,
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

    private scoreStringMatch(weight: ScoreWeight, text: string | undefined, query: string | undefined): number {
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

    private findBestTitle(movies: MovieJson[], opts: SearchOptions): MovieJson | undefined {
        let bestScore = 0;
        let bestMovie: MovieJson | undefined;

        for (const movie of movies) {
            let score: number = 0;
            let balance: number = 0;
            let strOutput = ""
            // TITLE
            score += this.scoreStringMatch(ScoreWeight.Title, movie.title, opts.query);
            strOutput += `Title: ${movie.title} VS ${opts.query}, Current Score: ${score}\n`;

            // Gerer au elementtojson
            // // LANGUAGE
            // const queryLang = opts.dub ? "FRENCH" : "VOSTFR";
            // const LangScore = this.scoreStringMatch(ScoreWeight.Language, movie.details.version, queryLang);
            // score = score + LangScore;
            // strOutput += `Language: ${movie.details.version} VS ${queryLang}, Score: ${LangScore}\n`;

            // Gerer au elementtojson
            // // SEASON OR FILM
            // const queryFormat = opts.media.format === "MOVIE" ? "Film" : "Saison";
            // const FormatScore = this.scoreStringMatch(ScoreWeight.SeasonOrFilm, movie.SeasonOrFilm, queryFormat);
            // score = score + FormatScore;
            // strOutput += `Format: ${movie.SeasonOrFilm} VS ${queryFormat}, Score: ${FormatScore}\n`;

            // RELEASE DATE
            const queryReleaseDate = opts.year?.toString();
            if (queryReleaseDate) {
                score += this.scoreStringMatch(ScoreWeight.ReleaseDate, movie.details.releaseDate, queryReleaseDate);
                strOutput += `Release Date: ${movie.details.releaseDate} VS ${queryReleaseDate}, Current Score: ${score}\n`;
            }
            else
                balance++;

            // EPISODE COUNT
            const queryEpisodeCount = opts.media.episodeCount?.toString();
            if (queryEpisodeCount) {
                score += this.scoreStringMatch(ScoreWeight.EpisodeCount, movie.nbEp.toString(), queryEpisodeCount);
                strOutput += `Episode Count: ${movie.nbEp} VS ${queryEpisodeCount}, Current Score: ${score}\n`;
            }
            else
                balance++;

            if (balance > 0) {
                // without balance it is 3/3
                // with balance it is 3/2
                // need to balance to /3
                score = score * (3 / (3 - balance));
            }

            console.log(`Movie: ${movie.title}\n${strOutput}Total Score: ${score}\n--------------------`);

            if (score > bestScore) {
                bestScore = score;
                bestMovie = movie;
            }
        }

        if (bestMovie) {
            console.log("Best movie found:", bestMovie.title);
            return bestMovie;
        }
        return undefined;
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
                console.warn("Found multiple m3u8 URLs:", VideoMatch);
                // for now take the first one idk
                VideoMatch.forEach(element => {
                    if (VideoMatch[0] !== element) {
                        VideoMatch.pop();
                    }
                });
            }
            else {
                console.log("Found m3u8 URL:", VideoMatch[0]);
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
                    return videos.sort((a, b) => {
                        const resolutionOrder = ["1080p", "720p", "480p", "360p", "unknown"];
                        const aIndex = resolutionOrder.indexOf(a.quality.split(" ")[2]);
                        const bIndex = resolutionOrder.indexOf(b.quality.split(" ")[2]);
                        return aIndex - bIndex;
                    });
                }
                else {
                    console.warn("m3u8 master is not in a correct format")
                }
            }
            else {
                console.warn("No master m3u8 URL found");
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

        // look for resolution: [4 to 3 numbers]p, have " or [space] after p if its the [space] it must be between to [space]
        // example: 1080p" or 1080p
        const resolutionMatch = html.match(/(\d{3,4})p(?=[" ])/) || unpacked?.match(/(\d{3,4})p(?=[" ])/);
        if (resolutionMatch) {
            const resolution = resolutionMatch[1];
            console.log("Found resolution:", resolution);
        }

        // look for .m3u8
        const m3u8Videos = await this.findMediaUrls("m3u8", html, serverUrl, resolutionMatch, unpacked);
        if (m3u8Videos !== undefined) {
            console.log("Found m3u8: ", m3u8Videos);
            return m3u8Videos;
        }

        // look for .mp4 do the same as .m3u8
        const mp4Videos = await this.findMediaUrls("mp4", html, serverUrl, resolutionMatch, unpacked);
        if (mp4Videos !== undefined) {
            console.log("Found mp4: ", mp4Videos);
            return mp4Videos;
        }

        console.warn("No m3u8 or mp4 URLs found in the server URL:", serverUrl, ". Make sure this is true.");
        return [];
    }

    private parseMovieElement(
        el: DocSelection,
        opts: SearchOptions,
        seasonNumberOpts?: number
    ): MovieJson | undefined {
        const nbEpisodes = parseInt(el.find("div.mov-m").text().trim(), 10) || 0;
        const titleLink = el.find("a.mov-t.nowrap");
        const title = titleLink.text().trim();
        const link = titleLink.attr("href") || "";

        const bloc1_2 = el.find("div.nbloc1-2");
        const SeasonOrFilm: SorF =
            bloc1_2.find("span.block-sai").length() > 0 ? "saison" : "film";

        // Extract season number if applicable
        const words = bloc1_2
            .find("span.block-sai")
            .text()
            .trim()
            .replaceAll(`\t`, "")
            .replaceAll(`\n`, "")
            .split(" ")
            .filter((word) => word !== "");

        const seasonNumber = SeasonOrFilm === "saison" ? parseInt(words[1]) : 0;

        const details: MovieDetails = {
            synopsis: "",
            director: "",
            actors: [],
            releaseDate: "",
            version: "",
        };

        const movieLine = el.find("ul.movie-lines li");
        movieLine.each((i, line) => {
            const text = line.text().trim().toLocaleLowerCase();
            const cat = text.split(":")[0].trim();
            switch (cat) {
                case "synopsis":
                    details.synopsis = text.replace("synopsis:", "").trim();
                    break;
                case "date de sortie":
                    details.releaseDate = text.replace("date de sortie:", "").trim();
                    break;
                case "réalisateur":
                    details.director = text.replace("réalisateur:", "").trim();
                    break;
                case "acteurs":
                    details.actors = text.replace("acteurs:", "").trim().split(", ");
                    break;
                case "version":
                    details.version = text.replace("version:", "").trim();
                    break;
            }
        });

        if (
            !title ||
            details.version.toLocaleLowerCase() !== (opts.dub ? "french" : "vostfr") ||
            SeasonOrFilm.toLocaleLowerCase() !==
            (opts.media.format === "MOVIE" ? "film" : "saison")
        ) {
            return undefined;
        }


        if (seasonNumber && seasonNumberOpts && seasonNumber !== seasonNumberOpts) {
            return undefined;
        }

        return {
            title,
            link,
            nbEp: nbEpisodes,
            SeasonOrFilm,
            details,
        };
    }

    //#endregion

    //#region main

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        // why the f*ck dan da dan s1 is not in the search lmao
        const moviesJson: MovieJson[] = [];
        let tempquery = opts.query;

        const queryEnglish = opts.media.englishTitle || opts.query;
        const seasonMatch = queryEnglish.toLowerCase().match(/season\s*(\d+)/i);
        let seasonNumberOpts;
        if (seasonMatch) {
            seasonNumberOpts = parseInt(seasonMatch[1], 10);
            console.log("Found season number:", seasonNumberOpts);
        }
        else {
            seasonNumberOpts = 1;
        }

        while (tempquery !== "") {
            console.log(`Searching for query: "${tempquery}".`);
            const html = await fetch(this.SEARCH_URL_2 + encodeURIComponent(tempquery), {
                method: "POST",
            }).then(res => res.text());
            const $ = await LoadDoc(html);
            const movies = $("#dle-content").find("div.mov.clearfix");
            if (movies.length() <= 0) {
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }
            const parsedmovies = movies.map((_, el) => this.parseMovieElement(el, opts, seasonNumberOpts));
            const filteredMovies = parsedmovies.filter(m => m !== undefined && m !== null);
            moviesJson.push(...filteredMovies);

            const pagination = $("#dle-content").find(".search-page .berrors").text().trim();
            console.log("Pagination info:", pagination);
            if (pagination.includes("Résultats de la requête")) {
                const numbers = pagination.match(/\d+/g);
                if (numbers && numbers.length >= 3) {
                    const TotalResults = parseInt(numbers[0], 10);
                    const CurrentPage = parseInt(numbers[1], 10);
                    const ResultsFrom = parseInt(numbers[2], 10);
                    console.log(`Total results: ${TotalResults}, Current page: ${CurrentPage}, Results from: ${ResultsFrom}`);

                    const resultsPerPage = 10;
                    const totalPages = Math.ceil(TotalResults / resultsPerPage);
                    console.log(`Total results: ${TotalResults}, Total pages: ${totalPages}`);
                    for (let i = 2; i <= totalPages; i++) {
                        const url = `${this.SEARCH_URL_3}?do=search&subaction=search&search_start=${(i)}&full_search=0&result_from=${ResultsFrom}&story=${encodeURIComponent(tempquery)}`;
                        console.log(`Fetching page ${i}... with url ${url}`);
                        const html = await fetch(url, {
                            method: "POST",
                        }).then(res => res.text());
                        const $$ = await LoadDoc(html);
                        const movies2 = $$("#dle-content").find("div.mov.clearfix");
                        const parsedmovies2 = movies2.map((_, el) => this.parseMovieElement(el, opts, seasonNumberOpts));
                        const filteredMovies2 = parsedmovies2.filter(m => m !== undefined && m !== null);
                        moviesJson.push(...filteredMovies2);
                    }
                }
            }

            if (movies.length() > 0) {
                break;
            }
        }


        if (moviesJson && moviesJson.length > 0) {
            console.log(`Found ${moviesJson.length} movies matching the criteria with query: ${opts.query}`);

            const bestMovie = this.findBestTitle(moviesJson, opts);
            if (bestMovie) {
                return <SearchResult[]>[{
                    id: bestMovie?.link,
                    title: bestMovie?.title,
                    url: bestMovie?.link,
                    subOrDub: opts.dub ? "dub" : "sub",
                }];
            }
        }

        const newQuery = tempquery !== "" ? tempquery.split(/[\s:']+/).slice(0, -1).join(" ") : "";
        if (tempquery === "" || newQuery === "") {
            console.warn("No movies matched the dub and format criteria.")
            return [];
        }

        console.log("retrying with query:", newQuery);
        const newresults = await this.search({
            query: newQuery,
            dub: opts.dub,
            media: opts.media
        });

        if (newresults && newresults.length > 0) {
            return newresults;
        }
        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {

        const $ = await fetch(id).then(res => res.text()).then(LoadDoc);

        const results: EpisodeDetails[] = [];
        let ServerToAdd: string[] = [];

        const eps = $("div[class='eps']").text().trim().split("\n").filter(line => line.trim() !== "");
        eps.forEach(line => {
            const [episodeNumber, ...urls] = line.split("!");
            urls.forEach(url => {
                results.push({
                    // if url last character is a , remove it
                    id: url.trim().replace(/,$/, ""),
                    url: id,
                    number: parseInt(episodeNumber.trim())
                });
                // DEV CHECK TO FIND MISSING SERVERS
                if (DevMode) {
                    for (const element of url.trim().replace(/,$/, "").split(",")) {
                        // get the server name of the element
                        const parts = element.split("/");

                        const PartsServerName = parts[2] ? parts[2].split(".") : [];
                        const serverName = PartsServerName.length >= 3 ? PartsServerName[1] : PartsServerName[0];
                        // check if servername is in the list of the episode servers
                        if (serverName !== undefined && !this.getSettings().episodeServers.includes(serverName) && !ServerToAdd.includes(serverName)) {
                            ServerToAdd.push(serverName);
                        }
                    }
                }
            });
        });

        if (ServerToAdd.length > 0) {
            console.warn(`Need to add server: "${ServerToAdd.join(`","`)}"`);
            this.getSettings().episodeServers.push(...ServerToAdd);
        }

        return results;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        // TODO: FIX vvide0 (its dood stream servers): 171018
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
                server: _server + " (video not found)",
                videoSources: <VideoSource[]>[
                    {
                        url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
                        type: "m3u8",
                        quality: "video not found",
                        subtitles: []
                    }
                ]

            };
        }
    }

    //#endregion
}