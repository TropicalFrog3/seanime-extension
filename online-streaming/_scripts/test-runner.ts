import { testAnimeProvider } from "./test-provider";
import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";

// Universal Polyfill for Seanime's internal `LoadDoc`
function createSeanimeWrapper($: any, cheerioObj: any): any {
    if (!cheerioObj || typeof cheerioObj !== 'object') return cheerioObj;
    if (!cheerioObj.cheerio) return cheerioObj;

    return new Proxy(cheerioObj, {
        get(target, prop, receiver) {
            // Seanime's map returns a raw array, not a Cheerio collection
            if (prop === 'map') {
                return function(fn: any) {
                    return target.map(function(i: number, el: any) {
                        return fn.call(this, i, createSeanimeWrapper($, $(el)));
                    }).get();
                };
            }
            // each passes a wrapped selection
            if (prop === 'each') {
                return function(fn: any) {
                    target.each(function(i: number, el: any) {
                        return fn.call(this, i, createSeanimeWrapper($, $(el)));
                    });
                    return receiver; // return the proxy wrapper for chaining
                };
            }
            // filter passes a wrapped selection if fn is a function
            if (prop === 'filter') {
                return function(fn: any) {
                    if (typeof fn === 'function') {
                        const filtered = target.filter(function(i: number, el: any) {
                            return fn.call(this, i, createSeanimeWrapper($, $(el)));
                        });
                        return createSeanimeWrapper($, filtered);
                    }
                    // if it's a string selector, pass it straight to cheerio
                    return createSeanimeWrapper($, target.filter(fn));
                };
            }

            const value = Reflect.get(target, prop, receiver);

            // Wrap functions returning Cheerio objects
            if (typeof value === 'function') {
                return function (...args: any[]) {
                    const result = value.apply(target, args);
                    return createSeanimeWrapper($, result);
                };
            }

            return value;
        }
    });
}

(global as any).LoadDoc = async (html: string) => {
    const $ = cheerio.load(html);
    const wrapper = function(selector: any, context?: any, root?: any) {
        return createSeanimeWrapper($, $(selector, context, root));
    };
    Object.assign(wrapper, $);
    return wrapper;
};

// --- Proxy Patch to Bypass Cloudflare for Local Testing ---
const originalFetch = global.fetch;

// Simple semaphore for rate limiting
let activeRequests = 0;
const maxRequests = 3;
async function waitTurn() {
    while (activeRequests >= maxRequests) {
        await new Promise(r => setTimeout(r, 200));
    }
    activeRequests++;
}

global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    // Pass Seanime proxy intercepts through normally
    if (url.includes('api/v1/proxy?url=')) {
        return originalFetch(input, init);
    }
    
    await waitTurn();
    try {
        if (init && init.method === 'POST') {
            const bodyStr = init.body?.toString() || '';
            if (bodyStr.includes('do=search')) {
                const searchMatch = bodyStr.match(/story=([^&]+)/);
                const query = searchMatch ? searchMatch[1] : 'Naruto';
                url = `https://ww.animesultra.org/?do=search&subaction=search&story=${query}`;
            }
        }
        
        const proxies = [
            (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            (u: string) => `https://cors-anywhere.herokuapp.com/${u}`, // Very slow/rate limited but as last resort
        ];
        
        const newInit = { ...init };
        if (newInit.method === 'POST') {
            newInit.method = 'GET';
            delete newInit.body;
        }

        for (const proxyFn of proxies) {
            const proxyUrl = proxyFn(url);
            let retries = 2;
            while (retries > 0) {
                try {
                    const res = await originalFetch(proxyUrl, newInit);
                    if (res.ok) return res;
                    console.log(`[PROXY] Proxy ${proxyUrl.split('/')[2]} failed with ${res.status}. Retrying...`);
                } catch (e: any) {
                    console.log(`[PROXY] Proxy ${proxyUrl.split('/')[2]} error: ${e.message}. Retrying...`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Final attempt direct (might fail on Cloudflare but good for non-CF domains)
        console.log(`[PROXY] All proxies failed. Final attempt direct fetch: ${url}`);
        return await originalFetch(url, init);
    } finally {
        activeRequests--;
    }
};
// -----------------------------------------------------------

async function runTest() {
    const targetExtension = process.argv[2];
    const queryArg = process.argv[3];
    const epArg = process.argv[4];
    const serverArg = process.argv[5];
    
    if (!targetExtension) {
        console.error("❌ Please provide the extension folder name to test.");
        console.error("Usage: npx tsx test-runner.ts <extension-folder-name> [query] [episode] [server]");
        console.error("Example: npx tsx test-runner.ts anime-sama Naruto 1 vidmoly");
        process.exit(1);
    }

    const payloadPath = path.join(__dirname, "..", targetExtension, "payload.ts");
    
    if (!fs.existsSync(payloadPath)) {
        console.error(`❌ Could not find payload.ts for extension '${targetExtension}' at: ${payloadPath}`);
        process.exit(1);
    }

    console.log(`Setting up test environment for '${targetExtension}'...`);
    
    const tempPath = path.join(__dirname, "..", targetExtension, "temp-payload.ts");
    
    // Create a temporary file that safely exports the Provider so we can import it
    let code = fs.readFileSync(payloadPath, "utf-8");
    
    // Fix: Seanime's JS environment exposes .length() as a method, but Cheerio uses .length property
    code = code.replace(/\.length\(\)/g, ".length");
    
    code += "\n\nexport default Provider;\n";
    fs.writeFileSync(tempPath, code);

    try {
        // Dynamically import the compiled module
        const module = await import(`../${targetExtension}/temp-payload.ts`);
        const ProviderClass = module.default;
        
        const provider = new ProviderClass();
        
        console.log("IMPORTANT: Make sure the Seanime Desktop app is running so the proxy API works!");
        
        await testAnimeProvider(provider, {
            query: queryArg,
            episodeNumber: epArg ? parseInt(epArg, 10) : undefined,
            server: serverArg
        });
    } finally {
        // Cleanup the temporary file immediately after testing
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

runTest().catch(console.error);
