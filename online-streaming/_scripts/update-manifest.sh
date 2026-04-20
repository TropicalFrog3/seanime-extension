#!/bin/bash

# Navigate to the directory where the script is located
cd "$(dirname "$0")"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq to run this script."
    exit 1
fi

# Get the extension name from the argument or prompt
EXTENSION=$1
if [ -z "$EXTENSION" ]; then
    read -p "Enter the extension folder name (e.g., anime-sama): " EXTENSION
fi

MANIFEST="../$EXTENSION/manifest.json"
PAYLOAD="../$EXTENSION/payload.ts"

if [ ! -f "$MANIFEST" ]; then
    echo "Error: Could not find manifest.json at $MANIFEST"
    exit 1
fi

if [ ! -f "$PAYLOAD" ]; then
    echo "Error: Could not find payload.ts at $PAYLOAD"
    exit 1
fi

# Get the current version
CURRENT_VERSION=$(jq -r '.version' "$MANIFEST")
echo "Current version for $EXTENSION is: $CURRENT_VERSION"

# Ask for the new version
read -p "Enter new version (or press Enter to keep $CURRENT_VERSION): " NEW_VERSION

# If the user didn't enter anything, keep the current version
if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION=$CURRENT_VERSION
fi

# Update payload and version
jq --rawfile payload "$PAYLOAD" --arg version "$NEW_VERSION" '.payload = $payload | .version = $version' "$MANIFEST" > manifest.tmp.json && mv manifest.tmp.json "$MANIFEST"

echo "✅ Successfully updated $EXTENSION manifest.json (Version: $NEW_VERSION) with the contents of payload.ts!"
