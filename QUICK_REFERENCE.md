# Kat's Kable Archive Intelligence - Quick Reference

## 📁 What's Where

### Workflow & Documentation
- **`WORKFLOW.md`** - Complete step-by-step guide for updating database
- **`INCREMENTAL_UPDATE_PLAN.md`** - Technical plan for incremental updates
- **`QUICK_REFERENCE.md`** - This file

### Key Scripts
- **`update_database.py`** ⭐ - **MAIN SCRIPT** - Add a new issue to database
- **`list_new_issues.py`** - See which issues need processing
- **`check_issue.py`** - View details of a specific issue in database
- **`build_full_archive.py`** - Full rebuild (slow, use only if needed)

### Data Files
- **`kats_kable_full.db`** - SQLite database (58MB, 2,066 articles)
- **`kats_kable_full_export.json`** - Plugin export (72MB)
- **`full_article_archive.csv`** - Clean source data (SOURCE OF TRUTH)

### Plugin Location
- **`kats-kable-plugin/`** - Plugin source code
- **`.obsidian/plugins/kats-kable-plugin/`** - Deployed plugin in Obsidian

---

## 🚀 Weekly Workflow (New Issue)

```bash
# Step 1: Write new issue in archive/381.md

# Step 2: Update database (1-2 minutes, ~$0.001)
cd /Users/kat/Documents/kats_kable_temp
python3 update_database.py 381

# Step 3: Verify it worked
python3 check_issue.py 381

# Step 4: Rebuild and deploy plugin
cd kats-kable-plugin
npm run build
cp main.js .obsidian/plugins/kats-kable-plugin/

# Step 5: Test in Obsidian
# - Hover over new article links
# - Check sidebar shows similar articles
# - Verify repeat authors detected
```

---

## 🆘 Troubleshooting

### "No similar articles found"
```bash
# Check if embeddings exist
python3 check_issue.py 381
# Look for [✓] vs [✗] next to articles
```

### "Source looks dirty"
- CSV file (`full_article_archive.csv`) has clean sources
- `update_database.py` automatically cross-references with CSV
- If still dirty, the CSV entry might be missing - add it there first

### "Plugin not working"
```bash
# 1. Check database export exists
ls -lh kats_kable_full_export.json

# 2. Verify it's in plugin folder
ls -lh .obsidian/plugins/kats-kable-plugin/kats_kable_full_export.json

# 3. Rebuild plugin
cd kats-kable-plugin && npm run build

# 4. Copy to plugin folder
cp main.js .obsidian/plugins/kats-kable-plugin/

# 5. Restart Obsidian
```

### "Database locked"
- Close Obsidian before running update scripts
- SQLite can't write while Obsidian has it open

---

## 📊 Database Status Commands

```bash
# See what's new
python3 list_new_issues.py

# Check specific issue
python3 check_issue.py 216

# Get database stats
python3 -c "import sqlite3; conn = sqlite3.connect('kats_kable_full.db'); c = conn.cursor(); c.execute('SELECT COUNT(*), COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) FROM articles'); t, e = c.fetchone(); print(f'Total: {t}, With embeddings: {e}')"

# List all sources (top 20)
python3 -c "import sqlite3; conn = sqlite3.connect('kats_kable_full.db'); c = conn.cursor(); c.execute('SELECT source, COUNT(*) as cnt FROM articles GROUP BY source ORDER BY cnt DESC LIMIT 20'); [print(f'{row[1]:3d} | {row[0][:50]}') for row in c.fetchall()]"
```

---

## 🎯 Current Features

✅ **Similar Article Detection** - Hover over links to see related articles  
✅ **Repeat Author Detection** - Shows other articles by same source (individual writers only)  
✅ **One-Click Insert** - Click suggested articles to add to your document  
✅ **Smart Source Normalization** - Handles dirty data (Aeon, The Convivial Society, etc.)  
✅ **Works in Both Modes** - Reading mode and editing mode  
✅ **Sidebar View** - Dedicated panel with all suggestions  

---

## 🔧 Maintenance Tasks

### Monthly
- Run `python3 list_new_issues.py` to catch any missed issues
- Process any backlog

### Quarterly  
- Review `WORKFLOW.md` for any workflow improvements needed
- Check if CSV file needs manual cleanup

### Yearly / As Needed
- Consider full database rebuild if data quality degrades:
  ```bash
  python3 build_full_archive.py  # ~30 min, ~$0.30
  ```

---

## 💡 Pro Tips

1. **Test before writing** - Hover over articles while writing to see what you've shared before
2. **Discover patterns** - The Convivial Society, Tim Harford, and other repeat authors will surface automatically
3. **CSV is king** - If sources look wrong, check/fix the CSV file first
4. **Incremental is cheap** - Each new issue costs ~$0.001 and takes ~1 minute
5. **Keep Obsidian closed** - During database updates to avoid lock conflicts

---

**Last Updated**: March 29, 2026  
**Next Review**: After processing first new issue (Issue 381+)
