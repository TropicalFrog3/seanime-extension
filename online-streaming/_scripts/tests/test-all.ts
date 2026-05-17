import * as fs from "fs";
import * as path from "path";

const SEANIME_URL = "http://127.0.0.1:43211";
let SEANIME_CLIENT_ID = "3850bb03-20d1-452f-8c23-915cb4810018"; // Default fallback

// Colors for terminal output
const COLOR_RESET = "\x1b[0m";
const COLOR_RED = "\x1b[31m";
const COLOR_GREEN = "\x1b[32m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_BLUE = "\x1b[34m";
const COLOR_CYAN = "\x1b[36m";
const COLOR_BOLD = "\x1b[1m";

interface TestConfig {
    query: string;
    mediaId: number;
    episode: number;
}

interface TestResult {
    extension: string;
    name: string;
    category: "FRENCH" | "ENGLISH" | "HENTAI";
    mode: "Sub" | "Dub";
    status: "PASS" | "FAIL";
    step: string;
    details: string;
}

// Fallback configuration if parsing info.txt fails
const DEFAULT_CONFIGS: Record<string, TestConfig> = {
    FRENCH: { query: "Solo Leveling", mediaId: 151807, episode: 1 },
    ENGLISH: { query: "Solo Leveling", mediaId: 151807, episode: 1 },
    HENTAI: { query: "Redo of Healer", mediaId: 113425, episode: 1 }
};

// --- Auth Setup ---
function setupAuth() {
    const harPaths = [
        path.join(__dirname, "playground.har"),
        path.join(__dirname, "..", "playground.har"),
        path.join(__dirname, "../..", "playground.har"),
    ];
    for (const harPath of harPaths) {
        if (fs.existsSync(harPath)) {
            try {
                const harData = JSON.parse(fs.readFileSync(harPath, "utf-8"));
                const firstEntry = harData.log.entries.find((e: any) => e.request.url.includes(SEANIME_URL));
                if (firstEntry) {
                    const cookieHeader = firstEntry.request.headers.find((h: any) => h.name.toLowerCase() === "cookie");
                    if (cookieHeader) {
                        const match = cookieHeader.value.match(/Seanime-Client-Id=([^;]+)/);
                        if (match) {
                            SEANIME_CLIENT_ID = match[1];
                            console.log(`${COLOR_CYAN}[AUTH] Extracted Client ID from ${path.basename(harPath)}: ${SEANIME_CLIENT_ID}${COLOR_RESET}`);
                            return;
                        }
                    }
                }
            } catch (e) {
                // Ignore and try next path
            }
        }
    }
    console.log(`${COLOR_YELLOW}[AUTH] Using default fallback Client ID: ${SEANIME_CLIENT_ID}${COLOR_RESET}`);
}

// --- Check Seanime Reachability ---
async function checkSeanimeServer(): Promise<boolean> {
    try {
        const res = await fetch(`${SEANIME_URL}/api/v1/extensions/playground/run`, {
            method: "OPTIONS"
        });
        return res.status !== 404;
    } catch {
        try {
            const res = await fetch(SEANIME_URL, { method: "HEAD" });
            return res.ok;
        } catch {
            return false;
        }
    }
}

// --- Parse info.txt ---
function parseInfoTxt(filePath: string): Record<string, TestConfig> {
    const configs: Record<string, TestConfig> = { ...DEFAULT_CONFIGS };
    if (!fs.existsSync(filePath)) {
        console.log(`${COLOR_YELLOW}[WARN] info.txt not found at ${filePath}. Using standard default parameters.${COLOR_RESET}`);
        return configs;
    }

    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        let currentSection = "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const sectionMatch = trimmed.match(/^(FRENCH|ENGLISH|HENTAI)\s+EXTENSIONS/i);
            if (sectionMatch) {
                currentSection = sectionMatch[1].toUpperCase();
                continue;
            }

            if (currentSection && trimmed.startsWith("-")) {
                // Parse lines like: "- solo-leveling (151807) season 1 ep 1" or "- Redo-of-Healer 113425 season 1 ep 1"
                // Regex matches: "- [title] [id] [optional season] ep [epNumber]"
                const match = trimmed.match(/^-\s+([a-zA-Z0-9_-]+)\s+\(?(\d+)\)?(?:\s+season\s+\d+)?(?:\s+ep\s+(\d+))?/i);
                if (match) {
                    const title = match[1].replace(/-/g, " ");
                    const mediaId = parseInt(match[2], 10);
                    const episode = match[3] ? parseInt(match[3], 10) : 1;
                    
                    configs[currentSection] = { query: title, mediaId, episode };
                }
            }
        }
        console.log(`${COLOR_GREEN}[CONFIG] Successfully loaded test config from info.txt:${COLOR_RESET}`);
        for (const [section, config] of Object.entries(configs)) {
            console.log(`  - ${COLOR_BOLD}${section}${COLOR_RESET}: "${config.query}" (AniList ID: ${config.mediaId}, Episode: ${config.episode})`);
        }
    } catch (e: any) {
        console.warn(`${COLOR_YELLOW}[WARN] Error parsing info.txt: ${e.message}. Using default parameters.${COLOR_RESET}`);
    }

    return configs;
}

// --- Call Seanime Playground API ---
async function callPlayground(code: string, func: string, inputs: any, logStream?: fs.WriteStream): Promise<any> {
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
            "Origin": SEANIME_URL
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API request failed with HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();

    // Print logs from the extension execution
    if (json.data && json.data.logs) {
        const logs = json.data.logs;
        if (logStream) {
            logStream.write(logs);
        }
    }

    // Return parsed value
    if (json.data && json.data.value) {
        try {
            return JSON.parse(json.data.value);
        } catch (e) {
            return json.data.value;
        }
    }

    return null;
}

// --- Category Classifier ---
function getCategory(manifest: any): "FRENCH" | "ENGLISH" | "HENTAI" {
    const name = (manifest.name || "").toLowerCase();
    const desc = (manifest.description || "").toLowerCase();
    const id = (manifest.id || "").toLowerCase();

    if (
        ["hanime", "hentaihaven", "oppai-stream", "watchhentai"].includes(id) ||
        id.includes("hentai") ||
        name.includes("18+") ||
        name.includes("hentai") ||
        name.includes("oppai") ||
        desc.includes("18+") ||
        desc.includes("hentai")
    ) {
        return "HENTAI";
    }

    if (manifest.lang === "fr") {
        return "FRENCH";
    }

    return "ENGLISH";
}

// --- Parse Settings From Source Code ---
function parseSettingsFromCode(code: string): { supportsDub: boolean; episodeServers: string[] } {
    const result = { supportsDub: false, episodeServers: [] as string[] };
    
    // Find the getSettings(): Settings method body
    const settingsBlockMatch = code.match(/getSettings\s*\(\s*\)\s*:\s*\w+\s*\{([^}]+)\}/s);
    if (!settingsBlockMatch) return result;
    
    const blockContent = settingsBlockMatch[1];
    
    // Parse supportsDub
    const supportsDubMatch = blockContent.match(/supportsDub\s*:\s*(true|false)/i);
    if (supportsDubMatch) {
        result.supportsDub = supportsDubMatch[1].toLowerCase() === "true";
    }
    
    // Parse episodeServers
    const serversMatch = blockContent.match(/episodeServers\s*:\s*\[([^\]]+)\]/);
    if (serversMatch) {
        const serversStr = serversMatch[1];
        result.episodeServers = serversStr
            .split(",")
            .map(s => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
    } else {
        // Look for variable reference like: episodeServers: this.SUPPORTED_SERVERS or episodeServers: SUPPORTED_SERVERS
        const varMatch = blockContent.match(/episodeServers\s*:\s*(?:this\.)?(\w+)/);
        if (varMatch) {
            const varName = varMatch[1];
            // Search the whole code for the declaration of this variable, e.g. readonly SUPPORTED_SERVERS = [...]
            const declRegex = new RegExp(`(?:const|let|var|readonly)?\\s*${varName}\\s*=\\s*\\[([^\\]]+)\\]`);
            const declMatch = code.match(declRegex);
            if (declMatch) {
                const serversStr = declMatch[1];
                result.episodeServers = serversStr
                    .split(",")
                    .map(s => s.trim().replace(/^["']|["']$/g, ""))
                    .filter(Boolean);
            }
        }
    }
    
    return result;
}

// --- Single Extension Mode Test ---
async function testExtension(
    extensionDir: string,
    manifest: any,
    code: string,
    category: "FRENCH" | "ENGLISH" | "HENTAI",
    config: TestConfig,
    dub: boolean,
    logStream: fs.WriteStream
): Promise<TestResult> {
    const mode = dub ? "Dub" : "Sub";
    const baseResult: TestResult = {
        extension: extensionDir,
        name: manifest.name || extensionDir,
        category,
        mode,
        status: "FAIL",
        step: "Initialize",
        details: ""
    };

    try {
        logStream.write(`\n==================================================\n`);
        logStream.write(`TESTING: ${manifest.name} (${extensionDir}) - Mode: ${mode}\n`);
        logStream.write(`==================================================\n`);

        // 1. Get settings
        logStream.write(`[STEP 1] Parsing settings from payload source...\n`);
        const settings = parseSettingsFromCode(code);
        const episodeServers = settings.episodeServers || [];
        logStream.write(`Parsed settings: supportsDub=${settings.supportsDub}, servers=${JSON.stringify(episodeServers)}\n`);

        // 2. Search
        logStream.write(`[STEP 2] Searching (query: "${config.query}", id: ${config.mediaId}, dub: ${dub})...\n`);
        const searchResults = await callPlayground(code, "search", {
            query: config.query,
            dub: dub,
            mediaId: config.mediaId
        }, logStream);

        if (!searchResults) {
            baseResult.step = "Search";
            baseResult.details = "No search results returned (null)";
            return baseResult;
        }

        const results = Array.isArray(searchResults) ? searchResults : [searchResults];
        if (results.length === 0 || !results[0]) {
            baseResult.step = "Search";
            baseResult.details = `No search results found for query "${config.query}"`;
            return baseResult;
        }

        const firstResult = results[0];
        logStream.write(`Search Success! Found ${results.length} results. Selected: "${firstResult.title}" (ID: ${firstResult.id})\n`);

        // 3. Find episodes
        logStream.write(`[STEP 3] Fetching episodes (id: "${firstResult.id}")...\n`);
        const episodes = await callPlayground(code, "findEpisodes", {
            id: firstResult.id,
            mediaId: config.mediaId
        }, logStream);

        if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
            baseResult.step = "Find Episodes";
            baseResult.details = `No episodes found for ID: ${firstResult.id}`;
            return baseResult;
        }

        const targetEpisode = episodes.find((e: any) => e.number === config.episode) || episodes[0];
        logStream.write(`Episodes Success! Found ${episodes.length} episodes. Selected: Episode ${targetEpisode.number}\n`);

        // 4. Find server sequentially
        const serversToTry = episodeServers.length > 0 ? episodeServers : [""];
        let success = false;
        let lastErrorStep = "Find Server";
        let lastErrorDetails = "No servers found";

        for (const selectedServer of serversToTry) {
            logStream.write(`[STEP 4] Fetching server data (server: "${selectedServer}")...\n`);
            try {
                const serverData = await callPlayground(code, "findEpisodeServer", {
                    episode: JSON.stringify(targetEpisode),
                    server: selectedServer,
                    mediaId: config.mediaId
                }, logStream);

                if (!serverData) {
                    logStream.write(`Server "${selectedServer}" returned no server data.\n`);
                    lastErrorStep = "Find Server";
                    lastErrorDetails = `No server data returned for server "${selectedServer}"`;
                    continue;
                }

                logStream.write(`Server response for "${selectedServer}":\n${JSON.stringify(serverData, null, 2)}\n`);

                if (serverData.videoSources && serverData.videoSources.length > 0) {
                    const sourceCount = serverData.videoSources.length;
                    const qualities = serverData.videoSources.map((s: any) => s.quality).join(", ");
                    baseResult.status = "PASS";
                    baseResult.step = "Complete";
                    baseResult.details = `Found ${sourceCount} video sources (${qualities}) on server "${serverData.server || selectedServer}"`;
                    success = true;
                    break;
                } else {
                    logStream.write(`Server "${selectedServer}" found no video sources.\n`);
                    lastErrorStep = "Find Server";
                    lastErrorDetails = `No video sources found on server "${selectedServer}"`;
                }
            } catch (err: any) {
                const errMsg = (err.message || "Unknown error").trim().replace(/\r?\n|\r/g, " ");
                logStream.write(`Server "${selectedServer}" failed with exception: ${err.stack || errMsg}\n`);
                lastErrorStep = "Find Server";
                lastErrorDetails = `Server "${selectedServer}" failed: ${errMsg}`;
            }
        }

        if (!success) {
            baseResult.step = lastErrorStep;
            baseResult.details = lastErrorDetails;
            return baseResult;
        }

    } catch (err: any) {
        logStream.write(`[EXCEPTION] ${err.stack || err.message}\n`);
        baseResult.details = (err.message || "Unknown execution error").trim().replace(/\r?\n|\r/g, " ");
    }

    return baseResult;
}

// --- Console Output Helpers ---
function pad(str: string, len: number): string {
    if (str.length >= len) return str.substring(0, len);
    return str + " ".repeat(len - str.length);
}

interface GroupedResult {
    extension: string;
    name: string;
    category: "FRENCH" | "ENGLISH" | "HENTAI";
    subStatus: "PASS" | "FAIL" | "N/A";
    subDetails: string;
    dubStatus: "PASS" | "FAIL" | "N/A";
    dubDetails: string;
}

function groupResults(results: TestResult[]): GroupedResult[] {
    const groups: Record<string, GroupedResult> = {};
    for (const r of results) {
        if (!groups[r.extension]) {
            groups[r.extension] = {
                extension: r.extension,
                name: r.name,
                category: r.category,
                subStatus: "N/A",
                subDetails: "",
                dubStatus: "N/A",
                dubDetails: ""
            };
        }
        
        const g = groups[r.extension];
        if (r.mode === "Sub") {
            g.subStatus = r.status as any;
            g.subDetails = r.status === "PASS" ? r.details : `[${r.step}] ${r.details}`;
        } else {
            g.dubStatus = r.status as any;
            g.dubDetails = r.status === "PASS" ? r.details : `[${r.step}] ${r.details}`;
        }
    }
    return Object.values(groups);
}

function printSummaryTable(results: TestResult[]) {
    const grouped = groupResults(results);
    
    console.log(`\n${COLOR_BOLD}${COLOR_CYAN}┌${"─".repeat(22)}┬${"─".repeat(10)}┬────────┬────────┬${"─".repeat(45)}┐${COLOR_RESET}`);
    console.log(`${COLOR_BOLD}${COLOR_CYAN}│ ${pad("Extension", 20)} │ ${pad("Category", 8)} │ ${pad("Sub", 6)} │ ${pad("Dub", 6)} │ ${pad("Details / Failure Step", 43)} │${COLOR_RESET}`);
    console.log(`${COLOR_BOLD}${COLOR_CYAN}├${"─".repeat(22)}┼${"─".repeat(10)}┼────────┼────────┼${"─".repeat(45)}┤${COLOR_RESET}`);

    for (const g of grouped) {
        const nameStr = pad(g.name.length > 20 ? g.name.substring(0, 17) + "..." : g.name, 20);
        const categoryStr = pad(g.category, 8);
        
        let subStr = "";
        if (g.subStatus === "PASS") subStr = `${COLOR_GREEN}PASS  ${COLOR_RESET}`;
        else if (g.subStatus === "FAIL") subStr = `${COLOR_RED}FAIL  ${COLOR_RESET}`;
        else subStr = `N/A   `;
        
        let dubStr = "";
        if (g.dubStatus === "PASS") dubStr = `${COLOR_GREEN}PASS  ${COLOR_RESET}`;
        else if (g.dubStatus === "FAIL") dubStr = `${COLOR_RED}FAIL  ${COLOR_RESET}`;
        else dubStr = `N/A   `;
        
        let detailsVal = "";
        if (g.subStatus !== "N/A" && g.dubStatus === "N/A") {
            detailsVal = g.subDetails;
        } else if (g.subStatus === "N/A" && g.dubStatus !== "N/A") {
            detailsVal = g.dubDetails;
        } else {
            if (g.subStatus === "PASS" && g.dubStatus === "PASS") {
                detailsVal = g.subDetails === g.dubDetails ? g.subDetails : `Sub: ${g.subDetails} / Dub: ${g.dubDetails}`;
            } else if (g.subStatus === "FAIL" && g.dubStatus === "FAIL") {
                detailsVal = g.subDetails === g.dubDetails ? g.subDetails : `Sub: ${g.subDetails} | Dub: ${g.dubDetails}`;
            } else {
                detailsVal = `Sub: ${g.subStatus === "PASS" ? "PASS" : g.subDetails} | Dub: ${g.dubStatus === "PASS" ? "PASS" : g.dubDetails}`;
            }
        }
        
        const detailsStr = pad(detailsVal.length > 43 ? detailsVal.substring(0, 40) + "..." : detailsVal, 43);
        console.log(`│ ${nameStr} │ ${categoryStr} │ ${subStr} │ ${dubStr} │ ${detailsStr} │`);
    }

    console.log(`${COLOR_BOLD}${COLOR_CYAN}└${"─".repeat(22)}┴${"─".repeat(10)}┴────────┴────────┴${"─".repeat(45)}┘${COLOR_RESET}`);
}

// --- Helper to Escape Markdown Table Separators ---
function escapeMarkdownTable(str: string): string {
    return str.replace(/\|/g, "\\|");
}

// --- Write Markdown Report ---
function generateMarkdownReport(results: TestResult[], reportPath: string) {
    const passedCount = results.filter(r => r.status === "PASS").length;
    const totalCount = results.length;
    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : "0";
    
    let markdown = `# Seanime Extension Health Report\n\n`;
    markdown += `*Generated on: ${new Date().toLocaleString()}*\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `| :--- | :--- |\n`;
    markdown += `| **Total Tests** | ${totalCount} |\n`;
    markdown += `| **Passed Tests** | ${passedCount} |\n`;
    markdown += `| **Failed Tests** | ${totalCount - passedCount} |\n`;
    markdown += `| **Overall Pass Rate** | **${passRate}%** |\n\n`;
    
    markdown += `## Extension Health Status\n\n`;
    markdown += `| Extension | Category | Sub | Dub | Details / Failure Step |\n`;
    markdown += `| :--- | :--- | :---: | :---: | :--- |\n`;
    
    const grouped = groupResults(results);
    
    for (const g of grouped) {
        const nameEscaped = escapeMarkdownTable(g.name);
        
        let subBadge = "";
        if (g.subStatus === "PASS") subBadge = "🟢 PASS";
        else if (g.subStatus === "FAIL") subBadge = "🔴 FAIL";
        else subBadge = "➖ *N/A*";
        
        let dubBadge = "";
        if (g.dubStatus === "PASS") dubBadge = "🟢 PASS";
        else if (g.dubStatus === "FAIL") dubBadge = "🔴 FAIL";
        else dubBadge = "➖ *N/A*";
        
        let detailsVal = "";
        if (g.subStatus !== "N/A" && g.dubStatus === "N/A") {
            detailsVal = g.subDetails;
        } else if (g.subStatus === "N/A" && g.dubStatus !== "N/A") {
            detailsVal = g.dubDetails;
        } else {
            if (g.subStatus === "PASS" && g.dubStatus === "PASS") {
                detailsVal = g.subDetails === g.dubDetails ? g.subDetails : `Sub: ${g.subDetails} <br> Dub: ${g.dubDetails}`;
            } else if (g.subStatus === "FAIL" && g.dubStatus === "FAIL") {
                detailsVal = g.subDetails === g.dubDetails ? g.subDetails : `Sub: ${g.subDetails} <br> Dub: ${g.dubDetails}`;
            } else {
                detailsVal = `Sub: ${g.subStatus === "PASS" ? "🟢 PASS" : g.subDetails} <br> Dub: ${g.dubStatus === "PASS" ? "🟢 PASS" : g.dubDetails}`;
            }
        }
        
        const detailsEscaped = escapeMarkdownTable(detailsVal);
        markdown += `| **${nameEscaped}** (\`${g.extension}\`) | ${g.category} | ${subBadge} | ${dubBadge} | ${detailsEscaped} |\n`;
    }
    
    markdown += `\n---\n`;
    markdown += `*To run these tests again, execute: \`npx tsx _scripts/tests/test-all.ts\` from the \`online-streaming\` directory.*\n`;
    
    fs.writeFileSync(reportPath, markdown, "utf-8");
}

// --- Main Execution Flow ---
async function run() {
    console.log(`\n${COLOR_BOLD}${COLOR_BLUE}╔════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                       SEANIME EXTENSION SUITE TESTER                       ║`);
    console.log(`║                         Validation & Health Monitor                        ║`);
    console.log(`╚════════════════════════════════════════════════════════════════════════════╝${COLOR_RESET}\n`);

    // Parse skip / exclude arguments
    const skipExtensions: string[] = [];
    for (const arg of process.argv) {
        if (arg.startsWith("--skip=")) {
            const list = arg.substring(7).split(",");
            skipExtensions.push(...list.map(s => s.trim().toLowerCase()));
        } else if (arg.startsWith("--exclude=")) {
            const list = arg.substring(10).split(",");
            skipExtensions.push(...list.map(s => s.trim().toLowerCase()));
        }
    }

    console.log(`${COLOR_BOLD}Initializing setup...${COLOR_RESET}`);
    setupAuth();

    // Verify Seanime Desktop is active
    const isServerUp = await checkSeanimeServer();
    if (!isServerUp) {
        console.error(`\n${COLOR_RED}❌ Error: Seanime local server is not running!${COLOR_RESET}`);
        console.error(`Please ensure the Seanime Desktop application is active and running at ${COLOR_BOLD}${SEANIME_URL}${COLOR_RESET} before running tests.`);
        console.error(`This script communicates with Seanime's local proxy to fetch catalogs securely.\n`);
        process.exit(1);
    }

    // Set up paths
    const infoTxtPath = path.join(__dirname, "info.txt");
    const logFilePath = path.join(__dirname, "test-results.log");
    const reportMdPath = path.join(__dirname, "test-report.md");
    const streamingDir = path.resolve(__dirname, "../..");

    // Parse info.txt configurations
    const configs = parseInfoTxt(infoTxtPath);

    // Scan for extensions
    console.log(`\nScanning directory: ${COLOR_CYAN}${streamingDir}${COLOR_RESET}...`);
    const items = fs.readdirSync(streamingDir);
    const extensions: { dir: string; manifestPath: string; payloadPath: string; manifest: any }[] = [];
    
    for (const item of items) {
        const itemPath = path.join(streamingDir, item);
        const stats = fs.statSync(itemPath);
        if (!stats.isDirectory()) continue;
        if (["_scripts", "_external", "node_modules"].includes(item)) continue;

        const manifestPath = path.join(itemPath, "manifest.json");
        const payloadPath = path.join(itemPath, "payload.ts");

        if (fs.existsSync(manifestPath) && fs.existsSync(payloadPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
                extensions.push({ dir: item, manifestPath, payloadPath, manifest });
            } catch (err: any) {
                console.error(`${COLOR_RED}[ERROR] Failed to parse manifest for ${item}: ${err.message}${COLOR_RESET}`);
            }
        }
    }

    // Filter out skipped extensions
    const activeExtensions: typeof extensions = [];
    for (const ext of extensions) {
        const matchesSkip = skipExtensions.includes(ext.dir.toLowerCase()) ||
                            skipExtensions.includes((ext.manifest.name || "").toLowerCase()) ||
                            skipExtensions.includes((ext.manifest.id || "").toLowerCase());
        if (matchesSkip) {
            console.log(`${COLOR_YELLOW}[SKIP] Skipping extension "${COLOR_BOLD}${ext.manifest.name || ext.dir}${COLOR_RESET}" due to CLI exclusion flag.${COLOR_RESET}`);
        } else {
            activeExtensions.push(ext);
        }
    }

    console.log(`Found ${COLOR_BOLD}${activeExtensions.length}${COLOR_RESET} extensions ready to test.\n`);

    // Reset log file
    const logStream = fs.createWriteStream(logFilePath, { flags: "w" });
    logStream.write(`SEANIME BATCH EXTENSION TEST RUN - ${new Date().toLocaleString()}\n`);

    const results: TestResult[] = [];

    // Run tests sequentially
    for (let i = 0; i < activeExtensions.length; i++) {
        const ext = activeExtensions[i];
        const category = getCategory(ext.manifest);
        let config = configs[category];
        
        // Override configuration for watchhentai to use "Overflow"
        if (ext.dir === "watchhentai") {
            config = {
                query: "Overflow",
                mediaId: 113417,
                episode: 1
            };
        }

        const code = fs.readFileSync(ext.payloadPath, "utf-8");

        console.log(`[${i + 1}/${activeExtensions.length}] Testing ${COLOR_BOLD}${ext.manifest.name || ext.dir}${COLOR_RESET} (${ext.dir}) [${COLOR_CYAN}${category}${COLOR_RESET}]`);

        // Check if settings support dub
        const settings = parseSettingsFromCode(code);
        const supportsDub = settings.supportsDub;

        // Test Sub (always)
        console.log(`  └─ Running ${COLOR_BLUE}Sub${COLOR_RESET} test...`);
        const subResult = await testExtension(ext.dir, ext.manifest, code, category, config, false, logStream);
        results.push(subResult);
        if (subResult.status === "PASS") {
            console.log(`     🟢 ${COLOR_GREEN}PASS${COLOR_RESET}`);
        } else {
            console.log(`     🔴 ${COLOR_RED}FAIL${COLOR_RESET} [Step: ${subResult.step}] - ${subResult.details}`);
        }

        // Test Dub (if supported)
        if (supportsDub) {
            console.log(`  └─ Running ${COLOR_BLUE}Dub${COLOR_RESET} test...`);
            const dubResult = await testExtension(ext.dir, ext.manifest, code, category, config, true, logStream);
            results.push(dubResult);
            if (dubResult.status === "PASS") {
                console.log(`     🟢 ${COLOR_GREEN}PASS${COLOR_RESET}`);
            } else {
                console.log(`     🔴 ${COLOR_RED}FAIL${COLOR_RESET} [Step: ${dubResult.step}] - ${dubResult.details}`);
            }
        }
    }

    logStream.end();

    // Print Console Summary
    console.log(`\n${COLOR_BOLD}=== ALL TESTS COMPLETE ===${COLOR_RESET}`);
    printSummaryTable(results);

    // Save Markdown Report
    generateMarkdownReport(results, reportMdPath);
    console.log(`\n💾 Saved detailed health report to: ${COLOR_GREEN}${reportMdPath}${COLOR_RESET}`);
    console.log(`📝 Saved full raw execution logs to: ${COLOR_GREEN}${logFilePath}${COLOR_RESET}\n`);

    // Print ending message
    const passedTests = results.filter(r => r.status === "PASS").length;
    const totalTests = results.length;
    if (passedTests === totalTests) {
        console.log(`🎉 ${COLOR_GREEN}${COLOR_BOLD}ALL SYSTEMS NOMINAL! All extensions are fully functional.${COLOR_RESET}\n`);
    } else {
        console.log(`⚠️  ${COLOR_RED}${COLOR_BOLD}ATTENTION REQUIRED: ${totalTests - passedTests} test(s) failed.${COLOR_RESET} Please inspect the details in the table above or check the report files to fix broken extensions.\n`);
    }
}

run().catch(err => {
    console.error(`\n${COLOR_RED}❌ Fatal Error: ${err.message}${COLOR_RESET}`);
    console.error(err.stack);
    process.exit(1);
});
