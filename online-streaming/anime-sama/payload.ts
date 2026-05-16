/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

const DevMode = true;
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
    if (DevMode) {
        originalConsoleLog.apply(console, args);
    }
};

class Provider {
    readonly BASE_URL = "https://anime-sama.to";
    readonly CATALOGUE_URL = "https://anime-sama.to/catalogue/";
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    private readonly VOICES_VALUES = ["vostfr", "vf", "vf1", "vf2", "va", "vcn", "vj", "vkr", "vqc"];
    private readonly SUPPORTED_SERVERS = ["sibnet", "vk", "sendvid", "vidmoly", "movearnpre", "oneupload"];

    _Server = "";

    getSettings(): Settings {
        return {
            episodeServers: this.SUPPORTED_SERVERS,
            supportsDub: true,
        };
    }

    private async fetchAnimeSeasons(animeUrl: string): Promise<any[]> {
        try {
            const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(animeUrl)}`);
            if (!response.ok) return [];

            const html = await response.text();
            const $ = await LoadDoc(html);

            const animeName = $("#titreOeuvre").text() || "";
            const thumbnail = $("#coverOeuvre").attr("src") || "";
            const description = $("h2:contains(synopsis)").next("p").text() || "";
            const genre = $("h2:contains(genres)").next("a").text() || "";

            const scripts = $("h2").next("p").next("div").find("script").text() ||
                $("h2").next("div").find("script").text() || "";

            const uncommented = scripts.replace(/\/\*[\s\S]*?\*\//g, "");
            const seasonRegex = /^\s*panneauAnime\("([^"]+)",\s*"([^"]+)"\)/gm;

            const seasons: any[] = [];
            let match;

            while ((match = seasonRegex.exec(uncommented)) !== null) {
                const [, seasonName, seasonStem] = match;

                if (seasonStem.includes("film")) {
                    const moviesUrl = `${animeUrl}/${seasonStem}`;
                    const moviePlayers = await this.fetchPlayers(moviesUrl);

                    if (moviePlayers.length > 0) {
                        const movieResponse = await fetch(`${this.SEANIME_API}${encodeURIComponent(moviesUrl)}`);
                        if (movieResponse.ok) {
                            const movieHtml = await movieResponse.text();
                            const movieNameRegex = /^\s*newSPF\("([^"]+)"\)/gm;
                            const movieNames: string[] = [];
                            let nameMatch;

                            while ((nameMatch = movieNameRegex.exec(movieHtml)) !== null) {
                                movieNames.push(nameMatch[1]);
                            }

                            for (let i = 0; i < moviePlayers.length; i++) {
                                const title = movieNames.length > i ?
                                    `${animeName} ${movieNames[i]}` :
                                    moviePlayers.length === 1 ? `${animeName} Film` : `${animeName} Film ${i + 1}`;

                                seasons.push({
                                    title,
                                    url: `${moviesUrl}#${i}`,
                                    status: "COMPLETED",
                                    thumbnail,
                                    description,
                                    genre
                                });
                            }
                        }
                    }
                } else {
                    seasons.push({
                        title: `${animeName} ${seasonName}`,
                        url: `${animeUrl}/${seasonStem}`,
                        status: "UNKNOWN",
                        thumbnail,
                        description,
                        genre
                    });
                }
            }

            return seasons;
        } catch (error) {
            console.error("Error fetching anime seasons:", error);
            return [];
        }
    }

    private async fetchPlayers(url: string): Promise<any[]> {
        try {
            const docUrl = `${url}/episodes.js`;
            const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(docUrl)}`);

            if (!response.ok) return [];

            const jsContent = await response.text();
            const episodeArrays: string[][] = [];

            for (let i = 0; i < 10; i++) {
                const regex = new RegExp(`var\\s+eps${i}\\s*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
                const match = regex.exec(jsContent);

                if (match) {
                    const urls = match[1]
                        .split(',')
                        .map(url => url.trim().replace(/['"]/g, ''))
                        .filter(url => url && url !== '');

                    if (urls.length > 0) {
                        episodeArrays.push(urls);
                    }
                }
            }

            if (episodeArrays.length === 0) return [];

            const maxEpisodes = Math.max(...episodeArrays.map(arr => arr.length));
            const episodes: any[] = [];

            for (let episodeIndex = 0; episodeIndex < maxEpisodes; episodeIndex++) {
                const episodeUrls: string[] = [];

                for (const voiceArray of episodeArrays) {
                    const url = voiceArray[episodeIndex];
                    if (url) {
                        const fixedUrl = url.replace(/vidmoly\.to/g, 'vidmoly.net');
                        episodeUrls.push(fixedUrl);
                    }
                }

                if (episodeUrls.length > 0) {
                    episodes.push(episodeUrls);
                }
            }

            return episodes;
        } catch (error) {
            console.error("Error fetching players:", error);
            return [];
        }
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[]> {
        const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`);
        if (!req.ok) {
            console.log("Failed to fetch server URL:", serverUrl, "Status:", req.status);
            return [];
        }

        const html = await req.text();

        function unpack(p: string, a: number, c: number, k: string[]): string {
            while (c--) {
                if (k[c]) {
                    p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
                }
            }
            return p;
        }

        let unpacked: string | undefined;
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let match;

        while ((match = scriptRegex.exec(html)) !== null) {
            const script = match[1];
            if (script.includes("eval(function(p,a,c,k,e,d)")) {
                const fullRegex = /eval\(function\([^)]*\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/;
                const unpackMatch = script.match(fullRegex);

                if (unpackMatch) {
                    const packed = unpackMatch[1];
                    const base = parseInt(unpackMatch[2], 10);
                    const count = parseInt(unpackMatch[3], 10);
                    const dict = unpackMatch[4].split('|');

                    unpacked = unpack(packed, base, count, dict);
                    break;
                }
            }
        }

        // Look for video URLs
        const m3u8Regex = /(?:https?:\/\/|\/)[^\s'"]+\.m3u8(?:\?[^\s'"]*)?/g;
        const mp4Regex = /(?:https?:\/\/|\/)[^\s'"]+\.mp4(?:\?[^\s'"]*)?/g;

        let videoUrls: string[] = [];
        const m3u8Matches = html.match(m3u8Regex);
        const mp4Matches = html.match(mp4Regex);

        if (m3u8Matches) videoUrls = videoUrls.concat(m3u8Matches);
        if (mp4Matches) videoUrls = videoUrls.concat(mp4Matches);

        if (unpacked) {
            const unpackedM3u8 = unpacked.match(m3u8Regex);
            const unpackedMp4 = unpacked.match(mp4Regex);
            if (unpackedM3u8) videoUrls = videoUrls.concat(unpackedM3u8);
            if (unpackedMp4) videoUrls = videoUrls.concat(unpackedMp4);
        }

        const videos: VideoSource[] = [];
        
        let origin = "";
        try {
            const urlObj = new URL(serverUrl);
            origin = urlObj.origin;
        } catch(e) {}

        for (const url of videoUrls) {
            let finalUrl = url;
            if (url.startsWith("/")) {
                if (origin === "") continue;
                finalUrl = origin + url;
            }
            const type = finalUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
            videos.push({
                url: finalUrl,
                type: type as VideoSourceType,
                quality: `${this._Server} - unknown`,
                subtitles: []
            });
        }

        return videos;
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let tempquery = opts.query;

        const queryEnglish = opts.media.englishTitle || opts.query;
        const seasonMatch = queryEnglish.toLowerCase().match(/season\s*(\d+)/i);
        const seasonMatch2 = queryEnglish.toLowerCase().match(/(\d+)/);

        let seasonNumberOpts: number;
        if (seasonMatch) {
            seasonNumberOpts = parseInt(seasonMatch[1], 10);
        } else {
            seasonNumberOpts = seasonMatch2 ? parseInt(seasonMatch2[1], 10) : opts.media.format === "TV" ? 1 : -1;
        }

        while (tempquery !== "") {
            console.log(`Searching for query: "${tempquery}".`);

            const searchUrl = new URL(this.CATALOGUE_URL);
            searchUrl.searchParams.set("search", tempquery);
            searchUrl.searchParams.set("page", "1");

            const response = await fetch(searchUrl.toString());
            if (!response.ok) {
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }

            const html = await response.text();
            const $ = await LoadDoc(html);
            const searchResults = $("#list_catalog > div a");

            if (searchResults.length() <= 0) {
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }

            const firstResult = searchResults.first();
            const animeUrl = firstResult.attr("href");

            if (!animeUrl) {
                return [];
            }

            console.log("Found anime URL:", animeUrl);

            const seasons = await this.fetchAnimeSeasons(animeUrl);

            if (seasons.length === 0) {
                return [];
            }

            let filteredSeasons = seasons.filter((season: any) => {
                const seasonUrl = season.url;

                if (opts.media.format === "MOVIE" && !seasonUrl.includes("film")) {
                    return false;
                }
                if (opts.media.format !== "MOVIE" && seasonUrl.includes("film")) {
                    return false;
                }

                if (seasonNumberOpts !== -1) {
                    const regex = new RegExp(`saison${seasonNumberOpts}(?!\\d)`);
                    if (!seasonUrl.match(regex)) {
                        return false;
                    }
                }

                return true;
            });

            if (filteredSeasons.length === 0) {
                filteredSeasons = seasons;
            }

            const bestSeason = filteredSeasons[0];

            let finalUrl = bestSeason.url;
            if (opts.dub && !finalUrl.includes("film")) {
                const dubUrl = finalUrl.replace("/vostfr", "/vf");
                const dubResponse = await fetch(`${this.SEANIME_API}${encodeURIComponent(dubUrl)}`);
                if (dubResponse.ok) {
                    finalUrl = dubUrl;
                } else {
                    const vf1Url = dubUrl + "1";
                    const vf1Response = await fetch(`${this.SEANIME_API}${encodeURIComponent(vf1Url)}`);
                    if (vf1Response.ok) {
                        finalUrl = vf1Url;
                    }
                }
            }

            return [{
                id: finalUrl,
                title: bestSeason.title,
                url: finalUrl,
                subOrDub: opts.dub ? "dub" : "sub",
            }];
        }

        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const animeUrl = id.split("#")[0];
        const movieIndex = id.split("#")[1];

        const episodesUrl = `${animeUrl}/episodes.js`;
        const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(episodesUrl)}`);

        if (!response.ok) {
            console.error("Failed to fetch episodes.js");
            return [];
        }

        const episodesText = await response.text();
        const episodeDetails: EpisodeDetails[] = [];
        const episodeArrays: string[][] = [];

        for (let i = 0; i < 10; i++) {
            const regex = new RegExp(`var\\s+eps${i}\\s*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
            const match = regex.exec(episodesText);

            if (match) {
                const urls = match[1]
                    .split(",")
                    .map(url => url.trim().replace(/['"]/g, ""))
                    .filter(url => url && url !== "");

                if (urls.length > 0) {
                    const fixedUrls = urls.map(url => url.replace(/vidmoly\.to/g, 'vidmoly.net'));
                    episodeArrays.push(fixedUrls);
                }
            }
        }

        if (episodeArrays.length === 0) {
            return [];
        }

        if (movieIndex !== undefined) {
            const movieIdx = parseInt(movieIndex, 10);
            const movieUrls: string[] = [];

            for (const voiceArray of episodeArrays) {
                if (voiceArray[movieIdx]) {
                    movieUrls.push(voiceArray[movieIdx]);
                }
            }

            if (movieUrls.length > 0) {
                return [{
                    id: movieUrls.join(","),
                    url: id,
                    number: 1
                }];
            }
            return [];
        }

        const maxEpisodes = Math.max(...episodeArrays.map(arr => arr.length));

        for (let episodeIndex = 0; episodeIndex < maxEpisodes; episodeIndex++) {
            const episodeUrls: string[] = [];

            for (const voiceArray of episodeArrays) {
                if (voiceArray[episodeIndex]) {
                    episodeUrls.push(voiceArray[episodeIndex]);
                }
            }

            if (episodeUrls.length > 0) {
                episodeDetails.push({
                    id: episodeUrls.join(","),
                    url: id,
                    number: episodeIndex + 1
                });
            }
        }

        return episodeDetails.reverse();
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        this._Server = _server;
        const servers = episode.id.split(",");

        const serverUrl = servers.find(server => {
            const parts = server.split("/");
            const domain = parts[2];
            if (!domain) return false;

            const domainParts = domain.split(".");
            const serverName = domainParts.length >= 3 ? domainParts[1] : domainParts[0];
            return serverName === _server;
        });

        if (serverUrl && _server !== "") {
            console.log(`Handling server URL: ${serverUrl}`);
            const videoSources = await this.HandleServerUrl(serverUrl);

            if (videoSources.length > 0) {
                const referer = serverUrl.split("/").slice(0, 3).join("/");
                return {
                    headers: { referer: referer },
                    server: _server,
                    videoSources: videoSources
                };
            }
        }

        console.log(`Server not found: ${_server}`);
        return <EpisodeServer>{
            headers: {},
            server: "",
            videoSources: []
        };
    }
}