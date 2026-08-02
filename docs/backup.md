# Firestore and Storage Backup Strategy

## Overview

The Mysuru Paakashale ERP relies on Firebase Firestore and Cloud Storage. We implement automated, scheduled backups for both services to ensure data safety.

## Required Permissions

To run backups, the service account or user must have:
- `roles/datastore.importExportAdmin`
- `roles/storage.admin`

Required Google Cloud APIs:
- Cloud Datastore API
- Cloud Storage API

## Firestore Backup

Firestore backups are managed via `gcloud` and exported to a Google Cloud Storage bucket dedicated to backups.

### Automated Backups

1. Create a Cloud Storage bucket for backups:
   ```bash
   gsutil mb -c standard -l ASIA-SOUTH1 gs://YOUR_PROJECT_ID-firestore-backups
   ```
2. Schedule the export using Cloud Scheduler and Cloud Functions (or a cron job on a VM).

### Manual Backup Script

You can run the backup script manually:
```bash
./scripts/backup-firestore.sh
```

## Storage Backup

Firebase Storage can be backed up using the Storage Transfer Service or `gsutil`.

### Manual Storage Backup
```bash
gsutil -m rsync -r gs://YOUR_PROJECT_ID.appspot.com gs://YOUR_PROJECT_ID-storage-backups
```

## Retention Policy

- **Daily Backups**: Retained for 7 days.
- **Weekly Backups**: Retained for 4 weeks.
- **Monthly Backups**: Retained for 12 months.

Configure Object Lifecycle Management on the backup bucket to enforce this retention policy automatically.
