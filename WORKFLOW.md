# Kat's Kable Database Update Workflow

## Overview
Step-by-step workflow to update the database when a new Kat's Kable issue is published.

## Current State (As of March 2026)
- **Database**: `kats_kable_full.db` with 2,066 articles (Issues 71-380)
- **Embeddings**: 1,811 articles have OpenAI embeddings
- **Plugin**: Uses `kats_kable_full_export.json` (72MB)
- **Data Quality**: Sources have commentary mixed in (dirty). CSV file has clean sources.

## Prerequisites
- OpenAI API key in `.env` file or environment variable
- Python 3 installed with dependencies: `openai`, `sqlite3`
- Node.js/npm for building the plugin

---

## Workflow: Adding a New Issue

### Step 1: Write the New Issue
1. Create new markdown file in `archive/` folder
2. Name it according to issue number (e.g., `381.md` for issue 381)
3. Use standard Kat's Kable format with YAML frontmatter:
   ```yaml
   ---
   date: 2026-03-29
   ---
   ```
4. Add articles using standard format:
   ```markdown
   **1**
   [Article Title](https://example.com/article) - Source Name
   
   Your commentary here...
   
   * * *
   
   **2**
   [Another Article](https://example.com/other) - Another Source
   
   More commentary...
   ```

### Step 2: Run the Update Script

**Option A: Incremental Update (RECOMMENDED)**
```bash
cd /Users/kat/Documents/kats_kable_temp
python3 update_database.py 381
```

This will:
- Parse issue 381.md
- Extract all articles
- Generate embeddings for new articles only
- Append to existing database
- Update the JSON export
- Copy to plugin folder

**Option B: Full Rebuild (Use if database is corrupt)**
```bash
cd /Users/kat/Documents/kats_kable_temp
python3 build_full_archive.py
```

⚠️ **Warning**: This takes ~30 minutes and costs ~$0.30

### Step 3: Verify the Update

1. Check database has new articles:
   ```bash
   python3 -c "import sqlite3; conn = sqlite3.connect('kats_kable_full.db'); cursor = conn.cursor(); cursor.execute('SELECT COUNT(*) FROM articles WHERE issue_number = 381'); print(cursor.fetchone()[0], 'articles in issue 381')"
   ```

2. Check embeddings were generated:
   ```bash
   python3 -c "import sqlite3; conn = sqlite3.connect('kats_kable_full.db'); cursor = conn.cursor(); cursor.execute('SELECT COUNT(*) FROM articles WHERE issue_number = 381 AND embedding IS NOT NULL'); print(cursor.fetchone()[0], 'articles with embeddings')"
   ```

3. Verify JSON export is updated:
   ```bash
   ls -lh kats_kable_full_export.json
   ```

### Step 4: Rebuild and Deploy Plugin

```bash
cd /Users/kat/Documents/kats_kable_temp/kats-kable-plugin
npm run build
cp main.js .obsidian/plugins/kats-kable-plugin/
```

### Step 5: Test in Obsidian

1. Open Obsidian
2. Reload the plugin (or restart Obsidian)
3. Open a test file
4. Hover over one of the new article links
5. Verify sidebar shows similar articles from archive
6. Check if repeat authors are detected correctly

---

## Files Needed (To Be Created)

### 1. `update_database.py`
Incremental update script. Should:
- Accept issue number as argument
- Parse only that markdown file
- Check if issue already exists in database
- Generate embeddings for new articles
- Insert into database
- Export to JSON
- Copy to plugin folder

**Key Logic**:
```python
def update_single_issue(issue_number):
    # 1. Check if issue exists
    cursor.execute('SELECT COUNT(*) FROM articles WHERE issue_number = ?', (issue_number,))
    if cursor.fetchone()[0] > 0:
        print(f"Issue {issue_number} already in database. Skipping.")
        return
    
    # 2. Parse markdown file
    articles = parse_markdown_file(f'archive/{issue_number}.md')
    
    # 3. Cross-reference with CSV
    articles = cross_reference_with_csv(articles, csv_data)
    
    # 4. Generate embeddings (new articles only)
    for article in articles:
        article.embedding = generate_embedding(article.to_embedding_text())
    
    # 5. Insert into database
    insert_articles_into_db(articles)
    
    # 6. Export to JSON
    export_database_to_json()
    
    # 7. Copy to plugin
    shutil.copy('kats_kable_full_export.json', 'kats-kable-plugin/.obsidian/plugins/kats-kable-plugin/')
```

### 2. `check_issue.py` (Optional Helper)
Quick script to verify an issue is correctly processed:
```python
# Show all articles from a specific issue with their sources
```

### 3. `list_new_issues.py` (Optional Helper)
Script to find markdown files not yet in database:
```python
# Compare archive/*.md files against database
# Return list of issue numbers to process
```

---

## CSV Management

### When to Update CSV
The CSV file (`full_article_archive.csv`) is the source of truth for clean sources.

**Update CSV when**:
- You've manually cleaned source names in the CSV
- You want to fix historical data quality issues
- You're doing a full database rebuild

**Don't update CSV during incremental updates** - the CSV should remain static with clean data.

### CSV Format
```
Filename,Title,URL,Source
381,Article Title,https://example.com,Clean Source Name
```

---

## Troubleshooting

### Issue: "No similar articles found"
**Cause**: Embeddings not generated for new articles
**Fix**: Re-run update script with `--force-embeddings` flag

### Issue: "Source shows as dirty in plugin"
**Cause**: CSV wasn't used during parsing
**Fix**: Make sure `cross_reference_with_csv()` is called in update script

### Issue: "Database locked"
**Cause**: Obsidian has the database open
**Fix**: Close Obsidian before running update script

### Issue: "Plugin not showing new articles"
**Cause**: JSON export not copied to plugin folder
**Fix**: Check that `kats_kable_full_export.json` was copied to `.obsidian/plugins/kats-kable-plugin/`

---

## Cost & Time Estimates

### Incremental Update (Per Issue)
- **Time**: ~1-2 minutes
- **Cost**: ~$0.001 (10 articles × $0.0001 per embedding)
- **API Calls**: 1 batch of 10 embeddings

### Full Rebuild (All 380+ Issues)
- **Time**: ~30-40 minutes  
- **Cost**: ~$0.30 (2066 articles × $0.0001)
- **API Calls**: 21 batches of 100 embeddings

---

## Future Improvements (Nice to Have)

1. **Auto-detect new issues**: Script that scans archive folder and processes any missing issues
2. **Batch processing**: Process multiple new issues at once
3. **Git integration**: Auto-commit after each update
4. **Backup**: Auto-backup database before each update
5. **Webhook**: Trigger update when new markdown file is saved

---

## Next Steps

1. Create `update_database.py` script (incremental updater)
2. Test with a single issue (e.g., create 381.md and run update)
3. Document any edge cases or issues encountered
4. Consider automating with cron/task scheduler for weekly runs

---

## Quick Reference Commands

```bash
# Update single issue
cd /Users/kat/Documents/kats_kable_temp
python3 update_database.py 381

# Check what's in database for issue 381
python3 check_issue.py 381

# List all issues not in database
python3 list_new_issues.py

# Full rebuild (only if needed)
python3 build_full_archive.py

# Rebuild plugin
cd kats-kable-plugin && npm run build && cp main.js .obsidian/plugins/kats-kable-plugin/

# Check database stats
python3 -c "import sqlite3; conn = sqlite3.connect('kats_kable_full.db'); cursor = conn.cursor(); cursor.execute('SELECT COUNT(*), COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) FROM articles'); total, with_emb = cursor.fetchone(); print(f'Total: {total}, With embeddings: {with_emb}')"
```

---

**Created**: March 29, 2026  
**Last Updated**: March 29, 2026  
**Next Review**: When implementing incremental updates
