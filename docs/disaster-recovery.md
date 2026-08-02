# Disaster Recovery Plan

## Overview

This document outlines the procedure to recover the Mysuru Paakashale ERP in case of data loss, corruption, or infrastructure failure.

## Recovery Time Objective (RTO) and Recovery Point Objective (RPO)
- **RTO**: 4 hours
- **RPO**: 24 hours (depending on backup frequency)

## Firestore Restore Procedure

If data is corrupted or accidentally deleted, restore from the latest clean backup.

1. **Identify the backup**:
   List available backups in the backup bucket:
   ```bash
   gsutil ls gs://YOUR_PROJECT_ID-firestore-backups
   ```
2. **Run the Restore Script**:
   ```bash
   ./scripts/restore-firestore.sh gs://YOUR_PROJECT_ID-firestore-backups/TIMESTAMP
   ```

## Storage Restore Procedure

1. **Restore using gsutil**:
   ```bash
   gsutil -m rsync -r gs://YOUR_PROJECT_ID-storage-backups gs://YOUR_PROJECT_ID.appspot.com
   ```

## Rollback Procedure (Code / Deployment)

If a new release causes critical issues:

1. **Revert the GitHub Release**:
   - Go to GitHub -> Releases
   - Note the previous stable tag (e.g., v1.4.2)
2. **Revert Hosting Deployment**:
   - Go to Firebase Console -> Hosting -> Release History
   - Click "Rollback" on the previous stable release.
3. **Revert Security Rules**:
   - Use `firebase deploy --only firestore:rules` or rollback via Firebase Console.
4. **Communicate Incident**:
   - Update stakeholders.
   - Use Remote Config `maintenance_mode` if downtime is required.
