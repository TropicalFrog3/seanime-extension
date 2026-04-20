#!/bin/bash

# Navigate to the directory where the script is located
cd "$(dirname "$0")"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq to run this script."
    exit 1
fi

echo "Updating manifests in subdirectories..."

# Loop through all subdirectories in the parent folder
for dir in ../*/; do
    # Get the folder name without the trailing slash and path
    foldername=$(basename "$dir")

    # Skip internal folders
    if [[ "$foldername" == "_scripts" || "$foldername" == "_external" || "$foldername" == "node_modules" ]]; then
        continue
    fi

    if [ -f "${dir}payload.ts" ] && [ -f "${dir}manifest.json" ]; then
        CURRENT_VERSION=$(jq -r '.version' "${dir}manifest.json")
        echo "----------------------------------------"
        echo "Updating ${dir}manifest.json..."
        
        # Ask for the new version
        read -p "Current version is $CURRENT_VERSION. Enter new version (or press Enter to keep it): " NEW_VERSION
        
        # If the user didn't enter anything, keep the current version
        if [ -z "$NEW_VERSION" ]; then
            NEW_VERSION=$CURRENT_VERSION
        fi
        
        # Update payload and version
        jq --rawfile payload "${dir}payload.ts" --arg version "$NEW_VERSION" '.payload = $payload | .version = $version' "${dir}manifest.json" > "${dir}manifest.tmp.json" && mv "${dir}manifest.tmp.json" "${dir}manifest.json"
        
        echo "✅ Updated $foldername to version $NEW_VERSION"
    fi
done

echo "----------------------------------------"
echo "✅ All manifests processed!"
