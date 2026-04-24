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
    readonly BASE_URL = "https://vostfree.ws";
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    };

    private readonly SUPPORTED_SERVERS = ["sibnet", "uqload", "voe", "vudeo", "mytv", "ok", "mycloud", "vidoza", "doodstream", "mystream"];

    getSettings(): Settings {
        return {
            episodeServers: this.SUPPORTED_SERVERS,
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let tempquery = opts.query;
        console.log(`Searching for: ${tempquery}`);


        while (tempquery !== "") {
            const searchUrl = `${this.BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(tempquery)}`;

            const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(searchUrl)}`, {
                headers: this.HEADERS
            });

            if (!response.ok) {
                console.log(`Fetch failed: ${response.status} ${response.statusText} for ${searchUrl}`);
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }

            const html = await response.text();

            // Check if we are being blocked
            if (html.includes("FortiGuard") || html.includes("Access Blocked")) {
                console.error("Network block detected (FortiGuard). Results may be empty.");
            }

            const $ = await LoadDoc(html);

            // DLE search result item selector
            const results = $(".search-result");

            if (results.length() > 0) {
                const resultsList: SearchResult[] = [];
                results.each((i, el) => {
                    const titleEl = el.find(".title a");
                    const title = titleEl.text().trim();
                    const url = titleEl.attr("href");

                    if (url && (url.includes("vostfr") || url.includes("vf"))) {
                        resultsList.push({
                            id: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
                            title: title,
                            url: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
                            subOrDub: url.toLowerCase().includes("vf") ? "dub" : "sub"
                        });
                    }
                });

                if (resultsList.length > 0) {
                    const filtered = resultsList.filter(r => {
                        const titleMatch = r.title.toLowerCase().includes(opts.query.toLowerCase().split(" ")[0]);
                        const subDubMatch = opts.dub ? r.subOrDub === "dub" : r.subOrDub === "sub";
                        return titleMatch && subDubMatch;
                    });
                    return filtered.length > 0 ? filtered : [resultsList[0]];
                }
            }

            tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
        }

        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        console.log(`Fetching episodes for: ${id}`);
        const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(id)}`, {
            headers: this.HEADERS
        });
        if (!response.ok) return [];

        const html = await response.text();
        const $ = await LoadDoc(html);

        const episodes: EpisodeDetails[] = [];
        const episodeOptions = $(".new_player_selector option");

        if (episodeOptions.length() > 0) {
            episodeOptions.each((i, opt) => {
                const title = opt.text().trim();
                const value = opt.attr("value");

                const epNumberMatch = title.match(/(\d+)/);
                const epNumber = epNumberMatch ? parseInt(epNumberMatch[1]) : i + 1;

                episodes.push({
                    id: `${id}|${value}`,
                    url: id,
                    number: epNumber
                });
            });
        } else {
            episodes.push({
                id: `${id}|0`,
                url: id,
                number: 1
            });
        }

        return episodes.reverse();
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const [url, playerValue] = episode.id.split("|"); // playerValue is "buttons_1"
        console.log(`Fetching server ${server} for episode ${episode.number} (player ${playerValue})`);

        const response = await fetch(`${this.SEANIME_API}${encodeURIComponent(url)}`, {
            headers: this.HEADERS
        });
        if (!response.ok) return <EpisodeServer>{};

        const html = await response.text();
        const $ = await LoadDoc(html);

        const serverContainer = $(`#${playerValue}`); // #buttons_1
        if (serverContainer.length() === 0) {
            console.log(`Server container not found: #${playerValue}`);
            return <EpisodeServer>{};
        }

        let playerId = "";
        serverContainer.find("div").each((i, btn) => {
            const btnText = btn.text().toLowerCase();
            if (btnText.includes(server.toLowerCase())) {
                playerId = btn.attr("id") || ""; // e.g. "player_2"
            }
        });

        if (!playerId) {
            console.log(`Server button not found for: ${server}`);
            return <EpisodeServer>{};
        }

        const index = playerId.replace("player_", "");
        const playerBox = $(`#content_player_${index}`);
        let rawData = playerBox.text().trim();

        if (!rawData) {
            console.log(`Player box data not found for index: ${index}`);
            return <EpisodeServer>{};
        }

        let serverUrl = "";
        const lowerServer = server.toLowerCase();
        if (lowerServer === "sibnet") {
            serverUrl = rawData.includes("http") ? rawData : `https://video.sibnet.ru/shell.php?videoid=${rawData}`;
        } else if (lowerServer === "uqload") {
            serverUrl = rawData.includes("http") ? rawData : `https://uqload.io/embed-${rawData}.html`;
        } else if (rawData.startsWith("//")) {
            serverUrl = `https:${rawData}`;
        } else if (rawData.includes("http")) {
            serverUrl = rawData;
        } else {
            serverUrl = rawData;
        }

        if (serverUrl) {
            let directUrl = serverUrl;
            if (lowerServer === "sibnet" || lowerServer === "uqload") {
                console.log(`Extracting direct URL from: ${serverUrl}`);
                const embedRes = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`, {
                    headers: { ...this.HEADERS, Referer: this.BASE_URL }
                });
                if (embedRes.ok) {
                    const embedHtml = await embedRes.text();
                    if (lowerServer === "sibnet") {
                        const match = embedHtml.match(/src:\s*"(\/v\/.*?\.mp4)"/);
                        if (match) directUrl = `https://video.sibnet.ru${match[1]}`;
                    } else if (lowerServer === "uqload") {
                        const match = embedHtml.match(/sources:\s*\["([^"]+)"\]/);
                        if (match) directUrl = match[1];
                    }
                }
            }

            return {
                headers: { Referer: serverUrl },
                server: server,
                videoSources: [{
                    url: directUrl,
                    type: directUrl.includes(".m3u8") ? "m3u8" : "mp4",
                    quality: "auto"
                }]
            };
        }

        return <EpisodeServer>{};
    }
}
