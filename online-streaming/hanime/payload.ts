/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

// ---------- Types ----------
type RawSearchResult = {
    id: number;
    name: string;
    titles: string[];
    slug: string;
    description: string;
    views: number;
    interests: number;
    poster_url: string;
    cover_url: string;
    brand: string;
    brand_id: number;
    duration_in_ms: number;
    is_censored: boolean;
    likes: number;
    rating: number;
    dislikes: number;
    downloads: number;
    monthly_rank: number;
    tags: string[];
    created_at: number;
    released_at: number;
    dub: SubOrDub;
};

type HanimeResponse = {
    layout: string;
    data: any[];
    error: null;
    serverRendered: boolean;
    state: State;
    videos_manifest?: VideosManifest;
    pr?: boolean;
};

type State = {
    scrollY: number;
    version: number;
    is_new_version: boolean;
    r: null;
    country_code: null;
    page_name: string;
    user_agent: string;
    ip: null;
    referrer: null;
    geo: null;
    is_dev: boolean;
    is_wasm_supported: boolean;
    is_mounted: boolean;
    is_loading: boolean;
    is_searching: boolean;
    browser_width: number;
    browser_height: number;
    system_msg: string;
    data: Data;
    auth_claim: null;
    session_token: string;
    session_token_expire_time_unix: number;
    env: Env;
    user: null;
    user_setting: null;
    playlists: null;
    shuffle: boolean;
    account_dialog: AccountDialog;
    contact_us_dialog: ContactUsDialog;
    general_confirmation_dialog: GeneralConfirmationDialog;
    snackbar: Snackbar;
    search: Search;
}

type Data = {
    video: Video;
}

type Video = {
    player_base_url: string;
    hentai_video: HentaiVideo;
    hentai_tags: HentaiTag[];
    hentai_franchise: HentaiFranchise;
    hentai_franchise_hentai_videos: HentaiVideo[];
    hentai_video_storyboards: HentaiVideoStoryboard[];
    brand: Brand;
    watch_later_playlist_hentai_videos: null;
    like_dislike_playlist_hentai_videos: null;
    playlist_hentai_videos: null;
    similar_playlists_data: null;
    next_hentai_video: HentaiVideo;
    next_random_hentai_video: HentaiVideo;
    videos_manifest?: VideosManifest;
    user_license: null;
    bs: Bs;
    ap: number;
    pre: string;
    encrypted_user_license: null;
    host: string;
}

type HentaiVideo = {
    id: number;
    is_visible: boolean;
    name: string;
    slug: string;
    created_at: string;
    released_at: string;
    description?: string;
    views: number;
    interests: number;
    poster_url: string;
    cover_url: string;
    is_hard_subtitled: boolean;
    brand: string;
    duration_in_ms: number;
    is_censored: boolean;
    rating: number;
    likes: number;
    dislikes: number;
    downloads: number;
    monthly_rank: number;
    brand_id: string;
    is_banned_in: string;
    preview_url: null;
    primary_color: null;
    created_at_unix: number;
    released_at_unix: number;
    hentai_tags?: HentaiTag[];
    titles?: any[];
}

type HentaiTag = {
    id: number;
    text: string;
    count?: number;
    description?: string;
    wide_image_url?: string;
    tall_image_url?: string;
}

type HentaiFranchise = {
    id: number;
    name: string;
    slug: string;
    title: string;
}

type HentaiVideoStoryboard = {
    id: number;
    num_total_storyboards: number;
    sequence: number;
    url: string;
    frame_width: number;
    frame_height: number;
    num_total_frames: number;
    num_horizontal_frames: number;
    num_vertical_frames: number;
}

type Brand = {
    id: number;
    title: string;
    slug: string;
    website_url: null;
    logo_url: null;
    email: null;
    count: number;
}

type VideosManifest = {
    servers: Server[];
}

type Server = {
    id: number;
    name: string;
    slug: string;
    na_rating: number;
    eu_rating: number;
    asia_rating: number;
    sequence: number;
    is_permanent: boolean;
    streams: Stream[];
}

type Stream = {
    id: number;
    server_id: number;
    slug: string;
    kind: string;
    extension: string;
    mime_type: string;
    width: number;
    height: string;
    duration_in_ms: number;
    filesize_mbs: number;
    filename: string;
    url: string;
    is_guest_allowed: boolean;
    is_member_allowed: boolean;
    is_premium_allowed: boolean;
    is_downloadable: boolean;
    compatibility: string;
    hv_id: number;
    server_sequence: number;
    video_stream_group_id: string;
    extra2: null;
}

type Bs = {
    ntv_1: Ntv1;
    ntv_2: Ntv2;
    footer_0: Footer0;
    native_1: Native1;
    native_0: Native0;
    ntv_0: Ntv0;
}

type Ntv1 = {
    desktop: DesktopAd;
}

type Ntv2 = {
    desktop: DesktopAd;
}

type Footer0 = {
    mobile: MobileAd;
    desktop: DesktopAd;
}

type Native1 = {
    mobile: NativeAd;
}

type Native0 = {
    mobile: NativeAd;
}

type Ntv0 = {
    desktop: DesktopAd;
}

type DesktopAd = {
    id: number;
    ad_id: string;
    ad_type: string;
    placement: string;
    image_url: null;
    iframe_url: string;
    click_url: null | string;
    width: number;
    height: number;
    page: string;
    form_factor: string;
    video_url: null;
    impressions: number;
    clicks: number;
    seconds: number;
    placement_x: null;
}

type MobileAd = {
    id: number;
    ad_id: string;
    ad_type: string;
    placement: string;
    image_url: null;
    iframe_url: string;
    click_url: null;
    width: number;
    height: number;
    page: string;
    form_factor: string;
    video_url: null;
    impressions: number;
    clicks: number;
    seconds: number;
    placement_x: null;
}

type NativeAd = {
    id: number;
    ad_id: string;
    ad_type: string;
    placement: string;
    image_url: string;
    iframe_url: null;
    click_url: string;
    width: number;
    height: number;
    page: string;
    form_factor: string;
    video_url: null;
    impressions: number;
    clicks: number;
    seconds: number;
    placement_x: string;
}

type Env = {
    vhtv_version: number;
    premium_coin_cost: number;
    mobile_apps: MobileApps;
}

type MobileApps = {
    code_name: string;
    _build_number: number;
    _semver: string;
    _md5: string;
    _url: string;
}

type AccountDialog = {
    is_visible: boolean;
    active_tab_id: string;
    tabs: Tab[];
}

type Tab = {
    id: string;
    icon: string;
    title: string;
}

type ContactUsDialog = {
    is_visible: boolean;
    is_video_report: boolean;
    subject: string;
    email: string;
    message: string;
    is_sent: boolean;
}

type GeneralConfirmationDialog = {
    is_visible: boolean;
    is_persistent: boolean;
    is_mini_close_button_visible: boolean;
    is_cancel_button_visible: boolean;
    cancel_button_text: string;
    title: string;
    body: string;
    confirm_button_text: string;
    confirmation_callback: null;
}

type Snackbar = {
    timeout: number;
    context: string;
    mode: string;
    y: string;
    x: string;
    is_visible: boolean;
    text: string;
}

type Search = {
    cache_sorting_config: any[];
    cache_tags_filter: null;
    cache_active_brands: null;
    cache_blacklisted_tags_filter: null;
    search_text: string;
    search_response_payload: null;
    total_search_results_count: number;
    order_by: string;
    ordering: string;
    tags_match: string;
    page_size: number;
    offset: number;
    page: number;
    number_of_pages: number;
    tags: any[];
    active_tags_count: number;
    brands: any[];
    active_brands_count: number;
    blacklisted_tags: any[];
    active_blacklisted_tags_count: number;
    is_using_preferences: boolean;
}

// ---------- Utility Functions ----------
function mapToSearchResult(raw: RawSearchResult): SearchResult {
    return {
        id: String(raw.id),
        title: raw.name,
        url: raw.slug,
        subOrDub: raw.dub ? "dub" : "sub",
    };
}

function replaceAndWithAmpersand(text: string): string {
    return text.replace(/\b(And|and)\b/g, "&");
}

function generateSignature(length = 32): string {
    return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function parseHits(hits: string): SearchResult[] {
    return (JSON.parse(hits) as RawSearchResult[]).map(mapToSearchResult);
}

// ---------- Main Class ----------
class Provider {
    private readonly SEARCH_URL = "https://search.htv-services.com";
    private readonly EPISODE_URL = "https://h.freeanimehentai.net/api/v8/video?id=";
    private readonly API = "https://hanime.tv";
    private readonly REFERER_API = "https://player.hanime.tv";

    getSettings(): Settings {
        return {
            // idk if there's other ones so...
            episodeServers: ["Shiva"],
            supportsDub: false,
        };
    }

    private async fetchSearchResults(searchText: string, page: number) {
        const response = await fetch(this.SEARCH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: "__ddg1_=;__ddg2_=;"
            },
            body: JSON.stringify({
                blacklist: [],
                brands: [],
                order_by: "created_at_unix",
                page: page - 1,
                tags: [],
                search_text: searchText,
                tags_mode: "AND",
            }),
        });
        return response.json() as Promise<{
            page: number;
            nbPages: number;
            nbHits: number;
            hitsPerPage: number;
            hits: string;
        }>;
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let page = 1;
        let query = replaceAndWithAmpersand(opts.query.trim());

        let data = await this.fetchSearchResults(query, page);
        let results = parseHits(data.hits);

        while (data.nbHits === 0 && query.split(" ").length > 3) {
            query = replaceAndWithAmpersand(query.split(" ").slice(0, -1).join(" "));
            data = await this.fetchSearchResults(query, page);
            results = parseHits(data.hits);
        }

        while (data.nbPages > page) {
            page++;
            data = await this.fetchSearchResults(query, page);
            results.push(...parseHits(data.hits));
        }

        // if (results.length > 0) {
        //     console.log(`Best match for "${opts.query}":\n> ${results.map(r => r.title).join("\n> ")}`);
        // }

        results.forEach(result => {
            result.id = result.url;
            result.url = `${this.API}/videos/hentai/${result.url}`.replace(/-\d+$/, "");
            result.title = result.title.replace(/\s*\d+$/, "");
        });

        return results;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const episodes: EpisodeDetails[] = [];
        const req = await fetch(`${this.API}/videos/hentai/${id}`);
        const html = await req.text();
        
        const nuxtScript = html.split('window.__NUXT__=')[1].split(';</script>')[0];
        
        const json = eval(`(${nuxtScript})`) as HanimeResponse;
        
        const videoData = json.state.data.video;
        videoData.hentai_franchise_hentai_videos.forEach((video) => {
            episodes.push({
                id: video.id.toString(),
                number: videoData.hentai_franchise_hentai_videos.indexOf(video) + 1,
                url: `${this.EPISODE_URL}${video.slug}`,
                title: videoData.hentai_franchise.name,
            });
        });
        return episodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        if (!_server) return {} as EpisodeServer;

        const req = await fetch(episode.url);

        const result = await req.json();
        if (!result?.videos_manifest) {
            // console.log(`No videos manifest for ${episode.title}`);
            return <EpisodeServer>{};
        }
        const videos: VideoSource[] = [];
        result.videos_manifest.servers.forEach((serverElement: any) => {
            if (_server !== serverElement.name) return;

            const allowedStreams = serverElement.streams.filter((s: any) => s.is_guest_allowed);
            allowedStreams.forEach((stream: any) => {
                videos.push({
                    url: stream.url,
                    type: "m3u8" as VideoSourceType,
                    quality: `${stream.height}p`,
                    subtitles: [],
                });
            });
        });

        return <EpisodeServer>{
            server: _server,
            headers: {
                Referer: `${this.REFERER_API}`,
            },
            videoSources: videos,
        };
    }
}
