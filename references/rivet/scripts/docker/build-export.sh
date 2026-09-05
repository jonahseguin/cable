#!/usr/bin/env bash
set -euo pipefail

# Builds the Rivet EE engine image for linux/x86_64 and exports it as a tarball
# for air-gapped delivery. Uses the same Dockerfile as the CI release pipeline.
#
# Usage: ./scripts/docker/build-export.sh
#
# Environment variables:
#   IMAGE_TAG          - Tag for the image (default: ee-<timestamp>)
#   CARGO_BUILD_MODE   - Cargo profile (default: self-host-release)
#   VITE_FEATURE_FLAGS - comma-separated frontend feature flags (default: empty;
#                        multitenancy is intentionally OFF because the engine
#                        still serves the dashboard at /ui/ rather than /)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DATE=$(date +%Y%m%d-%H%M%S)
IMAGE_NAME="rivet-engine"
IMAGE_TAG="${IMAGE_TAG:-ee-${DATE}}"
CARGO_BUILD_MODE="${CARGO_BUILD_MODE:-self-host-release}"
VITE_FEATURE_FLAGS="${VITE_FEATURE_FLAGS-}"
GIT_SHA=$(cd $REPO_ROOT && git rev-parse HEAD)
BUILD_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

DOCKERFILE="docker/engine/ee.Dockerfile"
TARGET="engine-full"
OUTPUT_DIR="${REPO_ROOT}/dist/docker"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG} (mode=${CARGO_BUILD_MODE}, flags=${VITE_FEATURE_FLAGS})..."

docker build \
  -f "${REPO_ROOT}/${DOCKERFILE}" \
  --target "${TARGET}" \
  --platform linux/amd64 \
  --build-arg CARGO_BUILD_MODE="${CARGO_BUILD_MODE}" \
  --build-arg BUILD_FRONTEND=true \
  --build-arg VITE_FEATURE_FLAGS="${VITE_FEATURE_FLAGS}" \
  --build-arg OVERRIDE_GIT_SHA=${GIT_SHA} \
  --build-arg OVERRIDE_BUILD_TIMESTAMP=${BUILD_TIMESTAMP} \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  "${REPO_ROOT}"

mkdir -p "${OUTPUT_DIR}"

OUTPUT_FILE="${OUTPUT_DIR}/rivet-engine.tar.gz"
echo "Exporting image to ${OUTPUT_FILE}..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > "${OUTPUT_FILE}"

echo ""
echo "Done!"
echo "  Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  Output: ${OUTPUT_FILE}"
echo "  Size: $(du -h "${OUTPUT_FILE}" | cut -f1)"
