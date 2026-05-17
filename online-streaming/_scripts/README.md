# Seanime Extension Development Utilities

This directory contains development tools and utilities for testing, updating, and publishing Seanime online streaming extensions.

* **Universal Test Runner** (`test-runner.ts`): Designed specifically to test Seanime online streaming extensions locally before deploying them. It accurately mimics Seanime's internal Go engine and uses Seanime's proxy API to test playability.
* **Manifest Utilities** (`update-manifest.sh` & `update-all-manifests.sh`): Script utilities to package the TypeScript payload of extensions into their corresponding `manifest.json`.
* **Marketplace Generator** (`generate-marketplace.ts`): Automatically scans the `online-streaming/` directory to build a consolidated marketplace JSON file (`TropicalFrog's-marketplace/main.json`).

## ⚠️ Prerequisites

1. **Node.js**: Ensure Node.js is installed on your machine.
2. **Seanime Desktop App**: **Must be actively running in the background!** The test runner connects to `http://127.0.0.1:43211/api/v1/proxy?url=` to simulate Seanime's internal fetching and to avoid `403 Forbidden` errors from CDNs.

## Installation

Before running the tests or utilities for the first time, you need to install `cheerio` (which is used to polyfill Seanime's HTML parser). You don't need to save it to your repository.

```bash
cd online-streaming
npm install --no-save cheerio
```

## Usage

You can run these scripts from the `online-streaming` directory by prefixing them with the `_scripts/` path, or navigate directly into the `_scripts` directory first.

### 1. Run the Test Runner
Run from the `online-streaming` directory:
```bash
npx tsx _scripts/test-runner.ts <extension-folder-name> [query] [episode] [server]
```
Or from the `_scripts` directory:
```bash
npx tsx test-runner.ts <extension-folder-name> [query] [episode] [server]
```

### 2. Update Manifests
To update a single manifest:
```bash
_scripts/update-manifest.sh <extension-folder-name>
```

To update all manifests:
```bash
_scripts/update-all-manifests.sh
```

### 3. Generate Marketplace
To compile all extension manifests in `online-streaming/` and generate a consolidated marketplace JSON file (`TropicalFrog's-marketplace/main.json`):

Run from the `online-streaming` directory:
```bash
npx tsx _scripts/generate-marketplace.ts
```
Or from the `_scripts` directory:
```bash
npx tsx generate-marketplace.ts
```

This script will scan the `online-streaming/` directory, parse each extension's `manifest.json` (excluding internal/helper folders), sort the entries alphabetically, and output the unified marketplace registry file.

---

### Arguments (Test Runner)

* `extension-folder-name`: **(Required)** The exact name of the folder containing the extension's `payload.ts` (e.g., `french-anime`, `anime-sama`).
* `query`: *(Optional)* The anime title to search for. (Default: `"Naruto"`)
* `episode`: *(Optional)* The specific episode number to test. (Default: `1`)
* `server`: *(Optional)* The exact name of the server to test. (Default: The first server in the provider's `episodeServers` list)

---

### Examples

**1. Basic Test (Uses defaults: Naruto, Episode 1, first server)**
```bash
npx tsx test-runner.ts french-anime
```

**2. Custom Query**
```bash
npx tsx test-runner.ts french-anime "Gachiakuta"
```

**3. Fully Customized Test**
```bash
npx tsx test-runner.ts french-anime "Gachiakuta" 1 luluvid
```

## What Does The Test Actually Do?

When you execute the test, it runs through the following 7 strict steps:
1. **Initialize Provider**: Confirms your extension correctly exports a `Provider` class with valid settings.
2. **Search**: Executes a search with the provided `query` and ensures the results array is valid.
3. **Fetch Episodes**: Pulls the episodes list for the first search result.
4. **Fetch Server Data**: Reaches out to the specified `server` to extract the `.m3u8` or `.mp4` video URLs.
5. **Video Validation**: Confirms video sources exist and have correct types and quality tags.
6. **Playability Check**: Proxies the video URL through Seanime's internal API to confirm the video stream is fully reachable and playable (e.g., `#EXTM3U` is found).
7. **Subtitle Check**: If subtitles are extracted, verifies they are fully reachable.
