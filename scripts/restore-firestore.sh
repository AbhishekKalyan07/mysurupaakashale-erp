#!/bin/bash

# Exit on error
set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <gs://bucket/timestamp>"
    echo "Example: $0 gs://your-project-firestore-backups/20260802-120000"
    exit 1
fi

BACKUP_URI=$1

# Load environment variables
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '#' | awk '/=/ {print $1}')
fi

PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
if [ -z "$PROJECT_ID" ]; then
  echo "Error: VITE_FIREBASE_PROJECT_ID is not set."
  exit 1
fi

echo "WARNING: This will overwrite existing data in Firestore for project: $PROJECT_ID"
read -p "Are you sure you want to proceed? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Restore aborted."
    exit 1
fi

echo "Starting Firestore restore from: $BACKUP_URI"

# Note: Requires gcloud to be authenticated
gcloud firestore import "$BACKUP_URI" --project="$PROJECT_ID" --async

echo "Restore triggered successfully (running asynchronously)."
echo "Check Cloud Console or use 'gcloud firestore operations list' to monitor."
