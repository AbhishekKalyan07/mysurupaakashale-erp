#!/bin/bash

# Exit on error
set -e

# Load environment variables (assumes .env.local exists for local execution)
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '#' | awk '/=/ {print $1}')
fi

PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
if [ -z "$PROJECT_ID" ]; then
  echo "Error: VITE_FIREBASE_PROJECT_ID is not set."
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BUCKET="gs://${PROJECT_ID}-firestore-backups"

echo "Starting Firestore export for project: $PROJECT_ID"
echo "Destination: $BUCKET/$TIMESTAMP"

# Note: Requires gcloud to be authenticated and have appropriate permissions
gcloud firestore export "$BUCKET/$TIMESTAMP" --project="$PROJECT_ID" --async

echo "Export triggered successfully (running asynchronously)."
echo "Check Cloud Console or use 'gcloud firestore operations list' to monitor."
