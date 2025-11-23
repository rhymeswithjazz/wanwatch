#!/bin/bash

# WanWatch - Local Docker build script for Apple Silicon (M4/M1/M2/M3)
# Builds ARM64 images natively (fast) and optionally AMD64 via emulation
# Usage: ./build-local.sh [platform] [tag] [puid] [pgid]
#   platform: amd64, arm64, or both (default: arm64)
#   tag: image tag (default: local)
#   puid/pgid: user/group IDs (default: 1026/100)

set -e  # Exit on error

# Configuration
PLATFORM="${1:-arm64}"  # Default to arm64 for native M4 builds
TAG="${2:-local}"
PUID="${3:-1026}"
PGID="${4:-100}"

# Map platform to Docker platform string
case "$PLATFORM" in
  amd64)
    DOCKER_PLATFORM="linux/amd64"
    ;;
  arm64)
    DOCKER_PLATFORM="linux/arm64"
    ;;
  both)
    DOCKER_PLATFORM="linux/amd64,linux/arm64"
    ;;
  *)
    echo "❌ Invalid platform: $PLATFORM"
    echo "   Valid options: amd64, arm64, both"
    exit 1
    ;;
esac

echo "🔨 Building WanWatch locally..."
echo "   Platform(s): $DOCKER_PLATFORM"
echo "   Tag: wanwatch:$TAG"
echo "   PUID: $PUID, PGID: $PGID"
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

# Create/use buildx builder if building for multiple platforms or cross-platform
if [[ "$DOCKER_PLATFORM" == *","* ]] || [[ "$DOCKER_PLATFORM" == "linux/amd64" ]]; then
    echo "📦 Setting up Docker buildx..."
    docker buildx create --name wanwatch-builder --use 2>/dev/null || docker buildx use wanwatch-builder
    
    # Install QEMU for cross-platform builds if needed
    if [[ "$DOCKER_PLATFORM" == "linux/amd64" ]] && [[ "$(uname -m)" == "arm64" ]]; then
        echo "📦 Installing QEMU for AMD64 emulation..."
        docker run --rm --privileged tonistiigi/binfmt:latest --install amd64
    fi
else
    # Native ARM64 build - use regular docker build (faster)
    echo "📦 Building natively (no buildx needed)..."
fi

# Build the image
echo ""
echo "🚀 Building image..."
if [[ "$DOCKER_PLATFORM" == "linux/arm64" ]] && [[ "$(uname -m)" == "arm64" ]]; then
    # Native build - faster
    docker build \
        --build-arg PUID=$PUID \
        --build-arg PGID=$PGID \
        --tag wanwatch:$TAG \
        --platform linux/arm64 \
        .
else
    # Use buildx for cross-platform or multi-platform
    docker buildx build \
        --platform $DOCKER_PLATFORM \
        --build-arg PUID=$PUID \
        --build-arg PGID=$PGID \
        --tag wanwatch:$TAG \
        --load \
        .
fi

echo ""
echo "✅ Successfully built wanwatch:$TAG"
echo ""
echo "To run the image:"
echo "   docker run -p 3000:3000 wanwatch:$TAG"
echo ""
echo "Usage: ./build-local.sh [platform] [tag] [puid] [pgid]"
echo "Examples:"
echo "   ./build-local.sh arm64 local          # Native ARM64 build (fastest on M4)"
echo "   ./build-local.sh amd64 local          # AMD64 build via emulation"
echo "   ./build-local.sh both local           # Both platforms"
echo ""

