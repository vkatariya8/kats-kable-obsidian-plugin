# Incremental Update Plan for Kat's Kable Database

## Overview
Instead of rebuilding the entire database each week, this approach appends only new articles and generates embeddings incrementally.

## Current State (Baseline)
- Database: `kats_kable_full.db` with 2,066 articles
- Export: `kats_kable_full_export.json` 
- Embeddings: 1,811 articles with OpenAI embeddings
- Cost baseline: ~$0.30 for full rebuild

## Incremental Process

### 1. Identify New Articles
- Compare issue list against database
- Find articles not yet in DB (by URL or issue_number + title hash)
- Load only new articles for processing

### 2. Generate Embeddings (New Articles Only)
- Use OpenAI text-embedding-3-small
- Process in batches of 100
- Cost: ~$0.001-0.002 per week (10 articles)
- Time: ~5-10 seconds

### 3. Database Append (Not Rebuild)
- Insert new articles into existing SQLite DB
- Add new embeddings to embedding table
- Update metadata (last_updated timestamp)
- Export updated JSON for plugin

### 4. Weekly Automation Note
- Can be run manually or scheduled via cron/task scheduler
- Script should log: "Processed X new articles, Y with embeddings"
- Rollback: Keep weekly backups of DB before append

## Benefits
- Time: 30 min → 30 seconds
- Cost: $0.30 → $0.002 per week
- Scales indefinitely as archive grows
