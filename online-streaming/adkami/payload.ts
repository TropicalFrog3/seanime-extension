/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

class ProviderNOTFINISH {
    private readonly SEARCH_URL = "https://www.adkami.com/video?search=";

    getSettings(): Settings {
        return {
            episodeServers: ["voe", "Dood stream", "vidguard", "vtuber", "streamtape", "Videoza", "Sendvid"],
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        // 1. Fetch search results page
        const searchResp = await fetch(this.SEARCH_URL + encodeURIComponent(opts.query));
        const html = await searchResp.text();
        const $ = LoadDoc(html);

        const items = $("div.video-item-list");
        const baseResults: { id: string; title: string; url: string }[] = [];

        // 2. Extract and filter results
        for (let i = 0; i < items.length(); i++) {
            const element = items.eq(i);
            const linkEl = element.find("a").first();
            const url = linkEl.attr("href")?.trim() || "";
            const title = element.find("span.title").text().trim();
            console.log(`Processing item ${i + 1}/${items.length()}: ${title} (${url})`);

            const idMatch = url.match(/\/(\d+)(?:\/)?$/);
            const id = idMatch ? idMatch[1] : "";

            if (id && title && url) {
                baseResults.push({ id, title, url });
            }
        }

        console.log(`Base results: ${JSON.stringify(baseResults)} for query "${opts.query}"`);

        // 3. Fetch detail pages in parallel
        const detailPromises = baseResults.map(async (result) => {
            try {
                const detailResp = await fetch(result.url);
                const detailHtml = await detailResp.text();
                const $$ = LoadDoc(detailHtml);

                let hasSub = false;
                let hasDub = false;

                const episodes = $$("div.ul-episodes ul a");
                for (let j = 0; j < episodes.length(); j++) {
                    const epText = episodes.eq(j).text().toLowerCase();
                    if (epText.includes("vostfr")) hasSub = true;
                    if (epText.includes("vf") && !epText.includes("vostfr")) hasDub = true;
                }

                let subOrDub: SubOrDub =
                    hasSub && hasDub ? "both" : hasDub ? "dub" : "sub";

                return { ...result, subOrDub };
            } catch (err) {
                console.error(`Failed to fetch detail page for ${result.id}:`, err);
                return { ...result, subOrDub: "sub" as SubOrDub };
            }
        });

        const details = await Promise.allSettled(detailPromises);

        // 4. Keep only fulfilled results
        const results: SearchResult[] = [];
        for (const res of details) {
            if (res.status === "fulfilled") {
                results.push(res.value);
            }
        }

        return results;
    }


    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        return [];
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        return {} as EpisodeServer;
    }
}