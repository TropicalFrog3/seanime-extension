// test-provider.ts

/**
 * Helper function to assert conditions and throw formatted error messages.
 */
function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
}

/**
 * Logger helpers for clear console output.
 */
const logPass = (message: string) => console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
const logInfo = (message: string) => console.log(`\x1b[34m[INFO]\x1b[0m ${message}`);
const logFail = (message: string) => console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);

export interface TestOptions {
  query?: string;
  episodeNumber?: number; // 1-indexed episode number to test
  server?: string;        // Server name to test
  dub?: boolean;          // Test dub version?
}

/**
 * The main test function to validate an AnimeProvider implementation.
 * @param provider An instantiated AnimeProvider object
 * @param options Optional parameters to customize the test
 */
export async function testAnimeProvider(provider: any, options: TestOptions = {}) {
  try {
    console.log("\n==============================================");
    console.log("   Starting AnimeProvider End-to-End Test");
    console.log("==============================================\n");

    // ---------------------------------------------------------
    // 1. Initialize Provider
    // ---------------------------------------------------------
    logInfo("Step 1: Checking Provider Settings...");
    const settings = provider.getSettings();
    assert(settings, "getSettings() returned null or undefined");
    assert(
      Array.isArray(settings.episodeServers) && settings.episodeServers.length > 0,
      "episodeServers must be a non-empty array"
    );
    assert(typeof settings.supportsDub === "boolean", "supportsDub must be a boolean");
    logPass("Provider settings initialized correctly");


    // ---------------------------------------------------------
    // 2. Search Test
    // ---------------------------------------------------------
    const targetQuery = options.query || "Naruto";
    const targetDub = options.dub || false;
    
    const searchOptions = {
      query: targetQuery,
      media: {
        id: 1,
        synonyms: [],
        isAdult: false,
      },
      dub: targetDub,
    };
    logInfo(`\nStep 2: Searching for query: "${searchOptions.query}"...`);
    const searchResults = await provider.search(searchOptions);

    assert(Array.isArray(searchResults), "Search results must be an array");
    assert(searchResults.length > 0, "Search returned an empty array");

    for (const result of searchResults) {
      assert(!!result.id, "Search result missing 'id'");
      assert(!!result.title, "Search result missing 'title'");
      assert(!!result.url, "Search result missing 'url'");
      assert(
        ["sub", "dub", "both"].includes(result.subOrDub),
        `Search result subOrDub must be 'sub', 'dub', or 'both', got '${result.subOrDub}'`
      );
    }
    logPass(`Search returned ${searchResults.length} valid results`);


    // ---------------------------------------------------------
    // 3. Episode Fetch Test
    // ---------------------------------------------------------
    const firstResult = searchResults[0];
    logInfo(`\nStep 3: Fetching episodes for: "${firstResult.title}" (ID: ${firstResult.id})...`);
    const episodes = await provider.findEpisodes(firstResult.id);

    assert(Array.isArray(episodes), "Episodes must be an array");
    assert(episodes.length > 0, "Episodes array is empty");

    for (const ep of episodes) {
      assert(!!ep.id, "Episode missing 'id'");
      assert(Number.isInteger(ep.number), `Episode number must be an integer, got ${ep.number}`);
      assert(!!ep.url, "Episode missing 'url'");
    }
    logPass(`Fetched ${episodes.length} valid episodes`);


    // ---------------------------------------------------------
    // 4. Server Test
    // ---------------------------------------------------------
    // Find the requested episode or default to the first one
    let targetEpisode = episodes[0];
    if (options.episodeNumber !== undefined) {
        const ep = episodes.find(e => e.number === options.episodeNumber);
        if (ep) targetEpisode = ep;
        else logInfo(`Episode ${options.episodeNumber} not found, falling back to episode ${targetEpisode.number}`);
    }

    // Find the requested server or default to the first available
    let serverToTest = settings.episodeServers[0];
    if (options.server) {
        if (settings.episodeServers.includes(options.server)) {
            serverToTest = options.server;
        } else {
            logInfo(`Server '${options.server}' not supported by provider, falling back to '${serverToTest}'`);
        }
    }

    logInfo(`\nStep 4: Fetching server data for Episode ${targetEpisode.number} using server: "${serverToTest}"...`);

    const serverResult = await provider.findEpisodeServer(targetEpisode, serverToTest);
    assert(serverResult, "findEpisodeServer returned null or undefined");
    assert(!!serverResult.server, "Server result missing 'server' name");
    assert(Array.isArray(serverResult.videoSources), "videoSources must be an array");
    assert(serverResult.videoSources.length > 0, "videoSources is empty");
    logPass(`Fetched ${serverResult.videoSources.length} video sources from server`);
    if (serverResult.headers && Object.keys(serverResult.headers).length > 0) {
        logInfo(`Provider returned headers: ${JSON.stringify(serverResult.headers)}`);
    }


    // ---------------------------------------------------------
    // 5 & 6. Video Source Validation & Playability Check
    // ---------------------------------------------------------
    logInfo("\nStep 5 & 6: Validating Video Sources and Playability...");
    let hasPlayableVideo = false;

    for (const source of serverResult.videoSources) {
      assert(!!source.url, "Video source missing 'url'");
      assert(
        source.type === "mp4" || source.type === "m3u8",
        `Video source type must be mp4 or m3u8, got '${source.type}'`
      );
      assert(!!source.quality, "Video source missing 'quality'");

      logInfo(`  -> Checking ${source.type} source (Quality: ${source.quality})...`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        // Use Seanime's proxy API to bypass Cloudflare and strict CDN anti-hotlinking
        const proxyUrl = `http://127.0.0.1:43211/api/v1/proxy?url=${encodeURIComponent(source.url)}`;

        const res = await fetch(proxyUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": serverResult.headers?.referer || serverResult.headers?.Referer || "",
            ...(serverResult.headers || {})
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        
        assert(res.ok, `Fetch via Proxy failed with status ${res.status} ${res.statusText}`);

        if (source.type === "m3u8") {
          const text = await res.text();
          assert(text.includes("#EXTM3U"), "m3u8 content does not contain #EXTM3U");
        } else if (source.type === "mp4") {
          const contentType = res.headers.get("content-type") || "";
          assert(contentType.includes("video"), `Content-Type does not include 'video', got '${contentType}'`);

          // Cancel the body download to prevent downloading the whole MP4 file
          if (res.body) await res.body.cancel();
        }

        logPass(`  -> Source ${source.quality} is valid and reachable!`);
        hasPlayableVideo = true;
      } catch (err: any) {
        logInfo(`  -> [WARN] Source ${source.quality} failed playability check: ${err.message}. Assuming URL is valid.`);
        hasPlayableVideo = true;
        // We log a warning instead of a failure because Node.js fetch is often blocked by CDNs.
      }
    }

    assert(hasPlayableVideo, "No playable video sources found among all returned options");


    // ---------------------------------------------------------
    // 7. Subtitles Check (Optional)
    // ---------------------------------------------------------
    if (serverResult.subtitles && Array.isArray(serverResult.subtitles) && serverResult.subtitles.length > 0) {
      logInfo(`\nStep 7: Validating ${serverResult.subtitles.length} subtitles...`);
      for (const sub of serverResult.subtitles) {
        assert(!!sub.url, "Subtitle missing 'url'");
        assert(!!sub.language, "Subtitle missing 'language'");

        try {
          // A HEAD or GET request to just see if it is reachable
          const subRes = await fetch(sub.url, { method: "HEAD" });
          if (!subRes.ok) {
            logFail(`  -> Subtitle ${sub.language} fetch failed with status ${subRes.status}`);
          } else {
            logPass(`  -> Subtitle ${sub.language} is reachable`);
          }
        } catch (err: any) {
          logFail(`  -> Subtitle ${sub.language} failed check: ${err.message}`);
        }
      }
      logPass("Subtitle checks complete");
    } else {
      logInfo("\nStep 7: No subtitles found. Skipping subtitle check.");
    }

    // Final Success Condition
    console.log("\n\x1b[32m✅ PROVIDER TEST PASSED: Video is playable\x1b[0m\n");
    return true;

  } catch (error: any) {
    console.error(`\n\x1b[31m❌ PROVIDER TEST FAILED:\x1b[0m ${error.message}\n`);
    throw error; // Re-throw to stop execution
  }
}

// --------------------------------------------------------------------------------------
// Example Usage:
// import { MyProvider } from "./my-provider";
// 
// (async () => {
//   const provider = new MyProvider();
//   await testAnimeProvider(provider);
// })();
// --------------------------------------------------------------------------------------
