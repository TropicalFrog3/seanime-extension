/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

class Provider {
    private readonly URL = "https://watchhentai.net";
    private nonce = "";

    getSettings(): Settings {
        return {
            episodeServers: ["WatchHentai"],
            supportsDub: false,
        };
    }

    private async getNonce() {
        if (this.nonce) return this.nonce;
        const html = await fetch(this.URL).then(res => res.text());
        const match = html.match(/"nonce":"([^"]+)"/);
        if (match) {
            this.nonce = match[1];
        }
        return this.nonce;
    }

    private decodeBase64(str: string): string {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch(e) {
            // fallback if atob is missing
            const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc = "", tmp_arr = [];
            if (!str) return str;
            str += '';
            do {
                h1 = b64.indexOf(str.charAt(i++));
                h2 = b64.indexOf(str.charAt(i++));
                h3 = b64.indexOf(str.charAt(i++));
                h4 = b64.indexOf(str.charAt(i++));
                bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
                o1 = bits >> 16 & 0xff;
                o2 = bits >> 8 & 0xff;
                o3 = bits & 0xff;
                if (h3 == 64) {
                    tmp_arr[ac++] = String.fromCharCode(o1);
                } else if (h4 == 64) {
                    tmp_arr[ac++] = String.fromCharCode(o1, o2);
                } else {
                    tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
                }
            } while (i < str.length);
            enc = tmp_arr.join('');
            return decodeURIComponent(escape(enc));
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const nonce = await this.getNonce();
        const res = await fetch(`${this.URL}/wp-json/dooplay/search/?keyword=${encodeURIComponent(opts.query)}&nonce=${nonce}`);
        if (!res.ok) return [];
        
        const json = await res.json();
        const results: SearchResult[] = [];
        
        for (const key in json) {
            const item = json[key];
            if (item && item.title && item.url) {
                results.push({
                    id: item.url,
                    title: item.title,
                    url: item.url,
                    subOrDub: "sub"
                });
            }
        }
        
        return results;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const html = await fetch(id).then(res => res.text());
        const $ = LoadDoc(html);
        const episodes: EpisodeDetails[] = [];
        
        $(".episodios li").each((i, el) => {
            const numText = el.find(".numerando").text();
            let num = i + 1;
            if (numText) {
                const match = numText.match(/\d+/g);
                if (match && match.length > 0) {
                    num = parseInt(match[match.length - 1], 10);
                }
            }
            
            const titleElem = el.find(".episodiotitle a");
            const epUrl = titleElem.attr("href");
            const epTitle = titleElem.text() || "Episode " + num;
            
            if (epUrl) {
                episodes.push({
                    id: epUrl,
                    number: num,
                    url: epUrl,
                    title: epTitle
                });
            }
        });
        
        episodes.sort((a, b) => a.number - b.number);
        
        return episodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const html = await fetch(episode.url).then(res => res.text());
        const $ = LoadDoc(html);
        
        let videoUrl = "";
        
        const iframe = $("#search_iframe");
        if (iframe.length() > 0) {
            let src = iframe.attr("data-litespeed-src") || iframe.attr("src");
            if (src && src !== "about:blank") {
                // Manually parse query parameters to avoid URL class issues
                const queryIndex = src.indexOf("?");
                if (queryIndex !== -1) {
                    const queryString = src.substring(queryIndex + 1);
                    const pairs = queryString.split("&");
                    for (const pair of pairs) {
                        const [key, value] = pair.split("=");
                        if (key === "source" && value) {
                            const decodedValue = decodeURIComponent(value);
                            if (decodedValue.startsWith("http")) {
                                videoUrl = decodedValue;
                            } else {
                                videoUrl = this.decodeBase64(decodedValue);
                            }
                            break;
                        }
                    }
                }
            }
        }
        
        if (videoUrl) {
            try {
                const headRes = await fetch(videoUrl, { method: "HEAD", headers: { "Referer": this.URL } });
                if (!headRes.ok) {
                    videoUrl = "";
                }
            } catch (e) {
                // Ignore fetch errors; if we can't verify, we'll try returning it anyway or bail if it failed completely
                // But typically if it's completely unreachable we might want to bail
                videoUrl = "";
            }
        }
        
        if (!videoUrl) {
            return { server: _server, headers: {}, videoSources: [] };
        }
        
        let type: VideoSourceType = "mp4";
        if (videoUrl.includes(".m3u8")) type = "m3u8";
        
        return {
            server: _server,
            headers: {
                "Referer": this.URL
            },
            videoSources: [
                {
                    url: videoUrl,
                    quality: "default",
                    type: type,
                    subtitles: []
                }
            ]
        };
    }
}
