import * as fs from "fs";
import * as path from "path";

/**
 * Seanime Playground Test Runner
 * 
 * This script runs extension tests by sending the code to the Seanime Desktop Playground API.
 * It mimics the behavior of the Seanime Playground UI.
 */

const SEANIME_URL = "http://127.0.0.1:43211";
let SEANIME_CLIENT_ID = "3850bb03-20d1-452f-8c23-915cb4810018"; // Default fallback

// --- Auth Setup ---
try {
    const harPath = path.join(__dirname, "playground.har");
    if (fs.existsSync(harPath)) {
        const harData = JSON.parse(fs.readFileSync(harPath, "utf-8"));
        const firstEntry = harData.log.entries.find((e: any) => e.request.url.includes(SEANIME_URL));
        if (firstEntry) {
            const cookieHeader = firstEntry.request.headers.find((h: any) => h.name.toLowerCase() === "cookie");
            if (cookieHeader) {
                const match = cookieHeader.value.match(/Seanime-Client-Id=([^;]+)/);
                if (match) {
                    SEANIME_CLIENT_ID = match[1];
                    console.log(`[AUTH] Using Client ID: ${SEANIME_CLIENT_ID}`);
                }
            }
        }
    }
} catch (e) {
    console.warn("[AUTH] Could not extract Client ID from HAR, using default.");
}

/**
 * Calls the Seanime Playground API to execute a function in the extension code.
 */
async function callPlayground(code: string, func: string, inputs: any) {
    const url = `${SEANIME_URL}/api/v1/extensions/playground/run`;

    const body = {
        params: {
            type: "onlinestream-provider",
            language: "typescript",
            code: code,
            function: func,
            inputs: inputs
        }
    };

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": `Seanime-Client-Id=${SEANIME_CLIENT_ID}`,
            "Origin": "http://127.0.0.1:43211"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();

    // Print logs from the extension execution
    if (json.data && json.data.logs) {
        const logs = json.data.logs;
        // Clean up the logs format (they usually come with timestamps and |DBG| markers)
        process.stdout.write(logs);
    }

    // Return the value (usually a JSON string that needs parsing)
    if (json.data && json.data.value) {
        try {
            return JSON.parse(json.data.value);
        } catch (e) {
            return json.data.value;
        }
    }

    return null;
}

async function runTest() {
    const targetExtension = process.argv[2];
    const queryOrId = process.argv[3];
    const epArg = process.argv[4] ? parseInt(process.argv[4], 10) : 1;
    const serverArg = process.argv[5];

    let mediaId: number | undefined = 1; // Default none
    let queryArg = queryOrId || "Ishuzoku Reviewers";

    // If queryOrId is a number, use it as mediaId
    if (queryOrId && !isNaN(Number(queryOrId))) {
        mediaId = Number(queryOrId);
        console.log(`[INFO] Using mediaId: ${mediaId}`);
    } else if (!queryOrId) {
        mediaId = 110270;
    }

    if (!targetExtension) {
        console.log("\nSeanime Extension Playground Runner");
        console.log("Usage: npx tsx test-runner.ts <extension-dir> [query/mediaId] [episode] [server]");
        console.log("Example: npx tsx test-runner.ts hentaihaven \"Naruto\" 1\n");
        process.exit(1);
    }

    const payloadPath = path.join(__dirname, "..", targetExtension, "payload.ts");
    if (!fs.existsSync(payloadPath)) {
        console.error(`❌ Error: Could not find payload.ts at ${payloadPath}`);
        process.exit(1);
    }

    console.log(`\n🚀 Testing extension: ${targetExtension}`);
    console.log(`📍 Using Seanime API at: ${SEANIME_URL}`);

    let code = fs.readFileSync(payloadPath, "utf-8");

    try {
        // 1. Search
        console.log(`\n--- [1/3] search (query: "${queryArg}") ---`);
        const searchResults = await callPlayground(code, "search", {
            query: queryArg,
            dub: false,
            mediaId: mediaId
        });

        if (!searchResults) {
            console.error("❌ No results found.");
            return;
        }

        console.log("Raw searchResults:", JSON.stringify(searchResults));

        const results = Array.isArray(searchResults) ? searchResults : [searchResults];
        if (results.length === 0 || !results[0]) {
            console.error("❌ No results found.");
            return;
        }

        const firstResult = results[0];
        console.log(`\nFound ${results.length} results.`);
        console.log(`Selected: "${firstResult.title}" (ID: ${firstResult.id})`);

        const selectedServer = serverArg || "HentaiHaven"; // Fallback to a common server or user input

        // 2. Find Episodes
        console.log(`\n--- [2/3] findEpisodes (id: "${firstResult.id}") ---`);
        const episodes = await callPlayground(code, "findEpisodes", {
            id: firstResult.id,
            mediaId: mediaId
        });

        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
            console.error("❌ No episodes found.");
            return;
        }

        const targetEpisode = episodes.find((e: any) => e.number === epArg) || episodes[0];
        console.log(`\nFound ${episodes.length} episodes.`);
        console.log(`Selected: Episode ${targetEpisode.number}`);

        // 3. Find Episode Server
        console.log(`\n--- [3/3] findEpisodeServer (server: "${selectedServer}") ---`);
        // We send the episode as a stringified object because the Seanime Playground UI does this
        const serverData = await callPlayground(code, "findEpisodeServer", {
            episode: JSON.stringify(targetEpisode),
            server: selectedServer,
            mediaId: mediaId
        });

        console.log("\n--- Final Results ---");
        console.log(JSON.stringify(serverData, null, 2));

        if (serverData?.videoSources?.length > 0) {
            console.log(`\n✅ Success! Found ${serverData.videoSources.length} video sources.`);
        } else {
            console.error(`\n❌ Test Failed: No video sources found for this episode/server.`);
        }

    } catch (err: any) {
        console.error(`\n❌ Test Failed: ${err.message}`);
    }
}

runTest().catch(console.error);
