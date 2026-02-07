#!/bin/bash
set -e

# Default values
DOCKERFILE="docker/Dockerfile"
TAG="basecamp-metrics"
COMPARE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dockerfile)
      DOCKERFILE="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --compare)
      COMPARE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dockerfile <path>] [--tag <name>] [--compare <path>]"
      exit 1
      ;;
  esac
done

# Get git commit hash
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Create output directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRICS_DIR="$SCRIPT_DIR/build-metrics"
mkdir -p "$METRICS_DIR"

# Timestamp for output file
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP_FILE=$(date -u +"%Y%m%d-%H%M%S")
OUTPUT_FILE="$METRICS_DIR/${TIMESTAMP_FILE}.json"

# Temp files for capturing output
TIME_OUTPUT=$(mktemp)
BUILD_OUTPUT=$(mktemp)

# Function to cleanup temp files
cleanup() {
  rm -f "$TIME_OUTPUT" "$BUILD_OUTPUT"
}
trap cleanup EXIT

# Run docker build with time
echo "Building Docker image from $DOCKERFILE..."
echo "Tag: $TAG"
echo ""

BUILD_SUCCESS=true
if ! { time docker build --no-cache -t "$TAG" -f "$DOCKERFILE" . 2>&1 | tee "$BUILD_OUTPUT"; } 2>"$TIME_OUTPUT"; then
  BUILD_SUCCESS=false
fi

# Parse build time from time output
BUILD_TIME=0
if [ -f "$TIME_OUTPUT" ]; then
  # Extract real time (format: "real 1m23.456s")
  REAL_TIME=$(grep "^real" "$TIME_OUTPUT" | awk '{print $2}')
  if [ -n "$REAL_TIME" ]; then
    # Parse minutes and seconds
    MINUTES=$(echo "$REAL_TIME" | sed 's/m.*//; s/[^0-9]//g')
    SECONDS=$(echo "$REAL_TIME" | sed 's/.*m//; s/s//; s/[^0-9.]//g')
    BUILD_TIME=$(echo "$MINUTES * 60 + $SECONDS" | bc)
  fi
fi

# Get image information if build succeeded
IMAGE_SIZE="0B"
IMAGE_SIZE_BYTES=0
LAYER_COUNT=0
LAYERS_JSON="[]"

if [ "$BUILD_SUCCESS" = true ]; then
  # Get image size
  IMAGE_SIZE=$(docker images "$TAG" --format "{{.Size}}" | head -1)
  
  # Convert size to bytes (approximate)
  if [[ "$IMAGE_SIZE" =~ ([0-9.]+)GB ]]; then
    SIZE_NUM="${BASH_REMATCH[1]}"
    IMAGE_SIZE_BYTES=$(echo "$SIZE_NUM * 1024 * 1024 * 1024" | bc | cut -d. -f1)
  elif [[ "$IMAGE_SIZE" =~ ([0-9.]+)MB ]]; then
    SIZE_NUM="${BASH_REMATCH[1]}"
    IMAGE_SIZE_BYTES=$(echo "$SIZE_NUM * 1024 * 1024" | bc | cut -d. -f1)
  elif [[ "$IMAGE_SIZE" =~ ([0-9.]+)kB ]]; then
    SIZE_NUM="${BASH_REMATCH[1]}"
    IMAGE_SIZE_BYTES=$(echo "$SIZE_NUM * 1024" | bc | cut -d. -f1)
  fi
  
  # Get layer information
  HISTORY_OUTPUT=$(docker history "$TAG" --no-trunc --format "{{.CreatedBy}}\t{{.Size}}")
  LAYER_COUNT=$(echo "$HISTORY_OUTPUT" | wc -l)
  
  # Convert history to JSON array
  LAYERS_JSON=$(echo "$HISTORY_OUTPUT" | while IFS=$'\t' read -r created_by size; do
    # Escape quotes in created_by
    created_by=$(echo "$created_by" | sed 's/"/\\"/g')
    echo "{\"createdBy\":\"$created_by\",\"size\":\"$size\"}"
  done | jq -s '.')
fi

# Create JSON output
cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "buildTime": $BUILD_TIME,
  "imageSize": "$IMAGE_SIZE",
  "imageSizeBytes": $IMAGE_SIZE_BYTES,
  "layers": $LAYERS_JSON,
  "layerCount": $LAYER_COUNT,
  "success": $([ "$BUILD_SUCCESS" = true ] && echo "true" || echo "false"),
  "dockerfile": "$DOCKERFILE",
  "gitCommit": "$GIT_COMMIT"
}
EOF

echo ""
echo "=== Docker Build Metrics ==="
echo "Time:    ${BUILD_TIME}s"
echo "Size:    $IMAGE_SIZE"
echo "Layers:  $LAYER_COUNT"
echo "Commit:  $GIT_COMMIT"
echo "Status:  $([ "$BUILD_SUCCESS" = true ] && echo "SUCCESS" || echo "FAILED")"
echo ""
echo "Metrics saved to: $OUTPUT_FILE"

# Compare with previous build if requested
if [ -n "$COMPARE" ] && [ -f "$COMPARE" ]; then
  echo ""
  echo "Comparing with: $COMPARE"
  
  # Extract values from previous build
  PREV_TIME=$(jq -r '.buildTime' "$COMPARE")
  PREV_SIZE_BYTES=$(jq -r '.imageSizeBytes' "$COMPARE")
  PREV_LAYERS=$(jq -r '.layerCount' "$COMPARE")
  
  # Calculate deltas
  TIME_DELTA=$(echo "$BUILD_TIME - $PREV_TIME" | bc)
  SIZE_DELTA=$(echo "$IMAGE_SIZE_BYTES - $PREV_SIZE_BYTES" | bc)
  LAYER_DELTA=$(echo "$LAYER_COUNT - $PREV_LAYERS" | bc)
  
  # Calculate percentages
  TIME_PERCENT=$(echo "scale=1; ($TIME_DELTA / $PREV_TIME) * 100" | bc)
  SIZE_PERCENT=$(echo "scale=1; ($SIZE_DELTA / $PREV_SIZE_BYTES) * 100" | bc)
  
  # ANSI color codes
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  RESET='\033[0m'
  
  # Format time delta
  TIME_COLOR=$RED
  if (( $(echo "$TIME_DELTA < 0" | bc -l) )); then
    TIME_COLOR=$GREEN
  fi
  TIME_SIGN=$([ $(echo "$TIME_DELTA >= 0" | bc) -eq 1 ] && echo "+" || echo "")
  
  # Format size delta
  SIZE_COLOR=$RED
  if (( $(echo "$SIZE_DELTA < 0" | bc -l) )); then
    SIZE_COLOR=$GREEN
  fi
  SIZE_SIGN=$([ $(echo "$SIZE_DELTA >= 0" | bc) -eq 1 ] && echo "+" || echo "")
  SIZE_DELTA_MB=$(echo "scale=1; $SIZE_DELTA / 1024 / 1024" | bc)
  
  # Format layer delta
  LAYER_SIGN=$([ "$LAYER_DELTA" -ge 0 ] && echo "+" || echo "")
  
  echo ""
  echo "=== Build Comparison ==="
  echo -e "Time:   ${TIME_COLOR}${TIME_SIGN}${TIME_DELTA}s (${TIME_SIGN}${TIME_PERCENT}%)${RESET}"
  echo -e "Size:   ${SIZE_COLOR}${SIZE_SIGN}${SIZE_DELTA_MB}MB (${SIZE_SIGN}${SIZE_PERCENT}%)${RESET}"
  echo "Layers: ${LAYER_SIGN}${LAYER_DELTA} layer$([ ${LAYER_DELTA#-} -ne 1 ] && echo "s" || echo "")"
fi

# Exit with appropriate code
if [ "$BUILD_SUCCESS" = true ]; then
  exit 0
else
  exit 1
fi
