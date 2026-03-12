#!/bin/bash
# Helper script to build OpenPOS AppImage on Arch Linux
# This script works around the linuxdeploy AppImage execution issues

set -e

VERSION="0.1.0"
PROJECT_ROOT="$(pwd)"
APPDIR="${PROJECT_ROOT}/src-tauri/target/release/bundle/appimage/OpenPOS.AppDir"
OUTPUT="${PROJECT_ROOT}/src-tauri/target/release/bundle/appimage/OpenPOS_${VERSION}_amd64.AppImage"
LINUXDEPLOY_BASE="/tmp"

echo "Building OpenPOS AppImage for Arch Linux"

# Check if linuxdeploy tools are extracted, if not download and extract them
if [ ! -f "${LINUXDEPLOY_BASE}/linuxdeploy-plugin/usr/bin/appimagetool" ]; then
    echo "Downloading linuxdeploy tools..."
    cd "${LINUXDEPLOY_BASE}"
    wget -q --show-progress https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage
    wget -q --show-progress https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage

    echo "Extracting linuxdeploy tools..."
    chmod +x linuxdeploy-x86_64.AppImage linuxdeploy-plugin-appimage-x86_64.AppImage
    ./linuxdeploy-x86_64.AppImage --appimage-extract
    mv squashfs-root linuxdeploy
    ./linuxdeploy-plugin-appimage-x86_64.AppImage --appimage-extract
    mv squashfs-root linuxdeploy-plugin
    cd "${PROJECT_ROOT}"
fi

# Build the application
echo "Building OpenPOS..."
bun tauri build --bins --no-bundle

# Wait for AppDir to be created by Tauri
# Note: The full bundle will fail, but the AppDir will be created
echo "Creating AppDir structure..."
bun tauri build -b appimage || true

# Check if AppDir was created
if [ ! -d "${APPDIR}" ]; then
    echo "Error: AppDir was not created"
    exit 1
fi

# Fix icon naming mismatch
echo "Fixing icon symlink..."
cd "${APPDIR}"
if [ ! -f "openpos.png" ]; then
    ln -sf OpenPOS.png openpos.png
fi
cd "${PROJECT_ROOT}"

# Create AppImage using appimagetool
echo "Creating AppImage..."
export VERSION="${VERSION}"
export ARCH=x86_64

"${LINUXDEPLOY_BASE}/linuxdeploy-plugin/usr/bin/appimagetool" \
    "${APPDIR}" \
    "${OUTPUT}"

# Make AppImage executable
chmod +x "${OUTPUT}"

echo "✓ AppImage created successfully: ${OUTPUT}"
echo "Size: $(du -h "${OUTPUT}" | cut -f1)"
echo ""
echo "To run the AppImage:"
echo "  ./src-tauri/target/release/bundle/appimage/OpenPOS_${VERSION}_amd64.AppImage"
