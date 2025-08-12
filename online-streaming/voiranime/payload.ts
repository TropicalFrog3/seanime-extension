/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

class ProviderNOTWORKING {
    getSettings(): Settings {
        return {
            episodeServers: ["myTV", "MOON", "VOE", "Stape", "FHD1"],
            supportsDub: true,
        };
    }

    private readonly SEARCH_URL = "https://v6.voiranime.com/?s="
    private readonly SEARCH_PARAMS = "&post_type=wp-manga&op=&author=&artist=&release=&adult=&type=&language=";

    private readonly ANIME_URL = "https://v6.voiranime.com/anime/"

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        // 1. Fetch search results page
        const url = this.SEARCH_URL + encodeURIComponent(opts.query) + this.SEARCH_PARAMS;
        const req = await fetch(url);
        const html = await req.text();
        const $ = LoadDoc(html);

        const baseResults: SearchResult[] = [];
        const items = $("div.c-tabs-item__content");

        let isDub = false;
        for (let i = 0; i < items.length(); i++) {
            const element = items.eq(i);
            const linkEl = element.find("a").first();
            const url = linkEl.attr("href")?.trim() || "";
            const title = linkEl.attr("title")?.trim() || "";
            // id is between the last two slashes
            const id = url.split("/").slice(-2, -1)[0];
            if (linkEl.find("manga-vf-flag")) {
                isDub = true;
            }
            if (id && title && url) {
                baseResults.push({ id, title, url, subOrDub: isDub ? "dub" : "sub" });
                console.log(`Found ${isDub ? "dub" : "sub"}: ${title} (${url})`);
            }
        }

        return baseResults;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        // VOSTFR
        const url = this.ANIME_URL + id;
        const req = await fetch(url);
        const html = await req.text();
        const $ = LoadDoc(html);



        // ul class="version-chap"
        const items = $("ul.version-chap li a");

        const episodes: EpisodeDetails[] = [];
        for (let i = 0; i < items.length(); i++) {
            const url = items.eq(i).attr("href")?.trim() || "";
            const title = items.eq(i).text().trim();

            const id = url.split("/").slice(-2, -1)[0];

            episodes.push({
                id: id,
                number: items.length() - i,
                url,
                title
            });
        }

        // VF
        const urlVF = url.replace(/\/([^\/]+)\/?$/, "/$1-vf/");
        const reqVF = await fetch(urlVF);
        const htmlVF = await reqVF.text();
        const $VF = LoadDoc(htmlVF);
        const vfItems = $VF("ul.version-chap li a");

        for (let i = 0; i < vfItems.length(); i++) {
            const url = vfItems.eq(i).attr("href")?.trim() || "";
            const title = vfItems.eq(i).text().trim();

            const id = url.split("/").slice(-2, -1)[0];

            episodes.push({
                id: id,
                number: vfItems.length() - i,
                url,
                title
            });
        }

        return episodes;
    }

    async solveRecaptcha(siteKey: string, pageUrl: string, apiKey: string) {
        const request = await fetch(
            `https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`
        );
        const requestData = await request.json();

        if (!requestData.status) {
            throw new Error(requestData.request);
        }
        const requestId = requestData.request;

        // Poll for the result
        let result;
        while (true) {
            await new Promise(res => setTimeout(res, 20000));
            const res = await fetch(
                `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`
            );
            result = await res.json();
            if (result.status && result.request !== "CAPCHA_NOT_READY") {
                break;
            }
        }

        // Insert token into response field
        (document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement).value = result.request;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        // NOT POSSIBLE WITHOUT A CAPTCHA SOLVING API KEY
        return {} as EpisodeServer;
    }
}