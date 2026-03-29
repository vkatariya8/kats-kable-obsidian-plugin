# Kat's Kable Obsidian Plugin

Surfaces similar articles from your Kat's Kable archive (Issues 320-374) as you write new issues.

## Features

- **Hover Suggestions**: Hover over any article link to see similar articles from your archive
- **Command Palette**: Press `Cmd+P` (Mac) / `Ctrl+P` (Windows), type "Find similar articles"
- **Smart Matching**: Uses AI embeddings to find thematically similar content
- **One-Click Insert**: Click any suggestion to insert a formatted reference

## Installation (Developer Mode - Most Painless)

### Step 1: Copy Plugin Files

Copy the entire `kats-kable-plugin` folder to your Obsidian vault's plugins directory:

```bash
# From your terminal
cp -r /Users/kat/Documents/kats_kable_temp/kats-kable-plugin \
  ~/Documents/Obsidian\ Vault/.obsidian/plugins/
```

Replace `~/Documents/Obsidian\ Vault` with your actual vault path.

### Step 2: Copy Database Export

Also copy the database export to your vault root:

```bash
cp /Users/kat/Documents/kats_kable_temp/kats_kable_export.json \
  ~/Documents/Obsidian\ Vault/
```

### Step 3: Enable Developer Mode in Obsidian

1. Open Obsidian
2. Go to **Settings** → **Community Plugins**
3. Turn on **Developer Mode** (toggle at bottom)
4. You should now see "Kat's Kable Archive Intelligence" in the plugin list
5. Click the toggle to **Enable** it

### Step 4: Set Your OpenAI API Key

The plugin needs your OpenAI API key to generate embeddings for new articles.

**Option A: Set in plugin settings (not implemented yet)**
- Go to Settings → Community Plugins → Kat's Kable → Options
- Enter your API key

**Option B: Set in environment (current workaround)**
Add to your shell profile:
```bash
echo 'export OPENAI_API_KEY="sk-your-key-here"' >> ~/.zshrc
source ~/.zshrc
```
Then restart Obsidian.

## How to Use

### Method 1: Hover (Automatic)
1. Write or paste an article link in your markdown: `[Article Title](https://example.com/article)`
2. Hover your mouse over the link
3. Wait 500ms
4. A popup appears showing 3 similar articles from your archive
5. Click any suggestion to insert: `[Article Title](URL) from issue XXX`

### Method 2: Command Palette (Manual)
1. Place cursor on a line with an article link
2. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows)
3. Type "Find similar articles"
4. Press Enter
5. A modal appears with similar articles
6. Click any suggestion to insert the reference

## What Gets Matched?

The plugin compares:
- **Article titles**: Direct text similarity
- **Your commentary**: Thematic similarity via AI embeddings
- **Combined**: Semantic meaning of what you wrote about the article

**Example:**
If you're writing about "tennis" now, it might surface:
- Issue 100: "The Secret to Roger Federer's Success" (if in range 320-374)
- Issue 350: "The Bitter Lesson" (if AI thinks it's thematically related)

## Configuration

Currently hardcoded (will be made configurable):
- **Similarity threshold**: 0.6 (cosine similarity)
- **Max suggestions**: 3 articles
- **Hover delay**: 500ms
- **Date range**: Issues 320-374 only

## Troubleshooting

### "Database not found" error
- Ensure `kats_kable_export.json` is in your vault root
- Check the file exists: `ls kats_kable_export.json`

### "No similar articles found"
- The article might be truly unique (no matches above 0.6 threshold)
- Try a more generic article topic

### Plugin doesn't load
- Check Obsidian console (Cmd+Opt+I) for errors
- Ensure Developer Mode is enabled
- Verify all files are in `.obsidian/plugins/kats-kable-plugin/`

### Hover not working
- Make sure you're hovering over external links (http/https URLs)
- Check that the link format is `[Title](URL)`
- Wait 500ms on hover

## Files You Need

1. `kats-kable-plugin/` folder (entire folder)
   - `main.js` (built plugin)
   - `manifest.json` (plugin info)
   - `styles.css` (popup styling)

2. `kats_kable_export.json` (database with 304 articles + embeddings)

## Data

- **304 articles** from Issues 320-374
- **Date range**: October 2023 - February 2026
- **Embeddings**: 1536-dimensional vectors (OpenAI text-embedding-3-small)

## Cost

- **Embedding generation**: ~$0.0001 per new article hover
- Typical usage: <$0.01 per writing session
- One-time cost for initial 304 articles: ~$0.01 (already paid)

## Next Steps / Future Features

- [ ] Settings tab for API key and threshold configuration
- [ ] Expand database to all 380+ issues
- [ ] Manual tagging interface for articles
- [ ] Sidebar panel showing all connections for current issue
- [ ] Export database regeneration script

## Support

Questions or issues? The plugin is in your vault at:
- Plugin: `.obsidian/plugins/kats-kable-plugin/`
- Database: `kats_kable_export.json`

## Architecture

```
User writes article link
        ↓
Hover / Command triggered
        ↓
Parse article (title + URL)
        ↓
Generate embedding via OpenAI API
        ↓
Calculate cosine similarity with all 304 articles
        ↓
Filter: similarity >= 0.6
        ↓
Sort & return top 3
        ↓
Show in hover popup / modal
        ↓
User clicks → Insert formatted link
```

---

**Status**: ✅ Ready to test!
