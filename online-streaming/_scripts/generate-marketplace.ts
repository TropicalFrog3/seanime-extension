import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const STREAMING_DIR = path.resolve(ROOT_DIR, 'online-streaming');

// Output paths to write the marketplace JSON to
const OUTPUT_PATHS = [
    path.resolve(ROOT_DIR, "TropicalFrog's-marketplace", "main.json")
];

interface MarketplaceEntry {
    id: string;
    name: string;
    description: string;
    manifestURI: string;
    author: string;
    type: string;
    language: string;
    lang: string;
    icon: string;
    website: string;
}

function generateMarketplace() {
    console.log("Starting Seanime Extensions Marketplace Generator...");
    console.log(`Scanning directory: ${STREAMING_DIR}`);

    const entries: MarketplaceEntry[] = [];

    if (!fs.existsSync(STREAMING_DIR)) {
        console.error(`Error: streaming directory not found at ${STREAMING_DIR}`);
        process.exit(1);
    }

    const items = fs.readdirSync(STREAMING_DIR);

    for (const item of items) {
        const itemPath = path.join(STREAMING_DIR, item);
        const stats = fs.statSync(itemPath);

        if (!stats.isDirectory()) continue;

        // Skip internal/helper folders
        if (["_scripts", "_external", "node_modules"].includes(item)) {
            continue;
        }

        const manifestPath = path.join(itemPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                const manifest = JSON.parse(manifestContent);

                // Build standard marketplace entry excluding payload
                const entry: MarketplaceEntry = {
                    id: manifest.id || item,
                    name: manifest.name || item,
                    description: manifest.description || "",
                    manifestURI: manifest.manifestURI || "",
                    author: manifest.author || "TropicalFrog3",
                    type: manifest.type || "onlinestream-provider",
                    language: manifest.language || "typescript",
                    lang: manifest.lang || "en",
                    icon: manifest.icon || "",
                    website: manifest.website || ""
                };

                entries.push(entry);
                console.log(`Scraped metadata for: "${entry.name}" (${item})`);
            } catch (err: any) {
                console.error(`Error parsing manifest for directory "${item}": ${err.message}`);
            }
        }
    }

    // Sort entries alphabetically by name because why not lol
    entries.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`\nFound ${entries.length} extensions. Preparing to write main.json...`);

    const jsonContent = JSON.stringify(entries, null, 2);

    for (const outputPath of OUTPUT_PATHS) {
        const dir = path.dirname(outputPath);
        try {
            if (!fs.existsSync(dir)) {
                console.log(`Creating directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, jsonContent, 'utf8');
            console.log(`Successfully wrote marketplace main.json to: ${outputPath}`);
        } catch (err: any) {
            console.error(`Failed to write to path "${outputPath}": ${err.message}`);
        }
    }

    console.log("\nMarketplace Generation Complete!");
}

generateMarketplace();
