#!/usr/bin/env python3
"""
Kat's Kable Database Incremental Update
Add a single new issue to the existing database without rebuilding everything.
"""

import sys
import os
import re
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Optional
import openai

# Configuration
ARCHIVE_DIR = Path("/Users/kat/Documents/kats_kable_temp/archive")
CSV_FILE = Path("/Users/kat/Documents/kats_kable_temp/full_article_archive.csv")
DB_FILE = Path("/Users/kat/Documents/kats_kable_temp/kats_kable_full.db")
JSON_EXPORT = Path("/Users/kat/Documents/kats_kable_temp/kats_kable_full_export.json")
PLUGIN_DIR = Path("/Users/kat/Documents/kats_kable_temp/kats-kable-plugin/.obsidian/plugins/kats-kable-plugin")


class Article:
    """Represents a single article"""
    def __init__(self, issue_number: int, issue_type: str, special_theme: Optional[str],
                 date: str, position: int, title: str, url: str, source: str, commentary: str):
        self.issue_number = issue_number
        self.issue_type = issue_type
        self.special_theme = special_theme
        self.date = date
        self.position = position
        self.title = title
        self.url = url
        self.source = source
        self.commentary = commentary
        self.embedding = None
    
    def to_embedding_text(self) -> str:
        """Generate text for embedding"""
        return f"{self.title}. {self.commentary}"


def parse_issue_filename(filename: str) -> tuple:
    """Parse issue number and detect if it's a special edition"""
    basename = filename.replace('.md', '')
    special_match = re.match(r'^(\d+)-(.+)$', basename)
    
    if special_match:
        issue_num = int(special_match.group(1))
        theme = special_match.group(2)
        return issue_num, 'special', theme
    else:
        try:
            issue_num = int(basename)
            return issue_num, 'regular', None
        except ValueError:
            return None, 'unknown', None


def parse_markdown_file(filepath: Path) -> Optional[List[Article]]:
    """Parse a markdown file and extract all articles"""
    content = filepath.read_text()
    
    issue_number, issue_type, special_theme = parse_issue_filename(filepath.name)
    if issue_number is None:
        return None
    
    # Extract date from YAML frontmatter
    date_match = re.search(r'^date:\s*(\d{4}-\d{2}-\d{2})', content, re.MULTILINE)
    if not date_match:
        print(f"⚠ Warning: No date found in {filepath.name}")
        return None
    date = date_match.group(1)
    
    # Remove YAML frontmatter
    content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)
    
    articles = []
    sections = re.split(r'\n\* \* \*\n', content)
    
    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        # Try to extract article number and content
        article_match = re.match(r'\*\*\s*(\d+)\s*\*\*\s*\n?(.+)', section, re.DOTALL)
        if not article_match:
            article_match = re.match(r'^(\d+)[\.\)]\s*\n?(.+)', section, re.DOTALL)
        
        if not article_match:
            continue
            
        position = int(article_match.group(1))
        article_content = article_match.group(2).strip()
        
        # Extract title and URL: [Title](URL) - Source
        link_match = re.match(r'\[([^\]]+)\]\(([^)]+)\)(?:\s+-\s+(.+))?', article_content, re.DOTALL)
        if not link_match:
            continue
            
        title = link_match.group(1).replace('\n', ' ').strip()
        url = link_match.group(2).strip()
        source = link_match.group(3).replace('\n', ' ').strip() if link_match.group(3) else ""
        
        # Extract commentary
        link_line_end = article_content.find(')')
        if link_match.group(3):
            link_line_end = article_content.find('\n', link_line_end)
        else:
            link_line_end += 1
        
        commentary = article_content[link_line_end:].strip()
        
        # Clean up commentary
        commentary = re.sub(r'!\[.*?\]\(.*?\)', '', commentary)
        commentary = re.sub(r'> ', '', commentary)
        commentary = re.sub(r'\n+', ' ', commentary).strip()
        
        if title and url:
            articles.append(Article(
                issue_number=issue_number,
                issue_type=issue_type,
                special_theme=special_theme,
                date=date,
                position=position,
                title=title,
                url=url,
                source=source,
                commentary=commentary
            ))
    
    return articles


def load_csv_data() -> dict:
    """Load CSV data for cross-referencing"""
    csv_data = {}
    
    if not CSV_FILE.exists():
        print(f"⚠ Warning: CSV file not found at {CSV_FILE}")
        return csv_data
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        next(f)  # Skip header
        
        for line in f:
            parts = line.strip().split(',')
            if len(parts) >= 4:
                filename = parts[0]
                title = parts[1]
                url = parts[2]
                source = parts[3]
                
                key = f"{filename}:{url}"
                csv_data[key] = {
                    'filename': filename,
                    'title': title,
                    'url': url,
                    'source': source
                }
    
    return csv_data


def cross_reference_with_csv(articles: List[Article], csv_data: dict) -> List[Article]:
    """Cross-reference articles with CSV data - CSV Source is the SOURCE OF TRUTH"""
    updated_count = 0
    
    for article in articles:
        key = f"{article.issue_number}:{article.url}"
        if key in csv_data:
            csv_entry = csv_data[key]
            # ALWAYS use CSV source when available
            if csv_entry.get('source'):
                if article.source != csv_entry['source']:
                    article.source = csv_entry['source']
                    updated_count += 1
            # Prefer CSV title if it's cleaner
            if csv_entry.get('title') and len(csv_entry['title']) > len(article.title):
                article.title = csv_entry['title']
    
    if updated_count > 0:
        print(f"  ✓ Updated {updated_count} sources from CSV")
    
    return articles


def generate_embedding(text: str, api_key: str) -> List[float]:
    """Generate embedding using OpenAI API"""
    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"  ✗ Error generating embedding: {e}")
        return []


def check_issue_exists(issue_number: int) -> bool:
    """Check if issue already exists in database"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM articles WHERE issue_number = ?', (issue_number,))
    count = cursor.fetchone()[0]
    conn.close()
    return count > 0


def insert_articles_into_db(articles: List[Article]):
    """Insert articles into database"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    for article in articles:
        embedding_json = json.dumps(article.embedding) if article.embedding else None
        
        cursor.execute('''
            INSERT INTO articles 
            (issue_number, issue_type, special_theme, date, position, title, url, source, commentary, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            article.issue_number,
            article.issue_type,
            article.special_theme,
            article.date,
            article.position,
            article.title,
            article.url,
            article.source,
            article.commentary,
            embedding_json
        ))
    
    conn.commit()
    conn.close()


def export_database_to_json():
    """Export database to JSON for plugin use"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM articles')
    rows = cursor.fetchall()
    
    articles = []
    for row in rows:
        article = dict(row)
        # Parse embedding from JSON string
        if article.get('embedding'):
            try:
                article['embedding'] = json.loads(article['embedding'])
            except:
                article['embedding'] = None
        articles.append(article)
    
    conn.close()
    
    with open(JSON_EXPORT, 'w', encoding='utf-8') as f:
        json.dump(articles, f, ensure_ascii=False)
    
    print(f"  ✓ Exported {len(articles)} articles to {JSON_EXPORT}")


def copy_to_plugin():
    """Copy JSON export to plugin folder"""
    import shutil
    
    if not PLUGIN_DIR.exists():
        print(f"⚠ Warning: Plugin directory not found at {PLUGIN_DIR}")
        return False
    
    dest = PLUGIN_DIR / 'kats_kable_full_export.json'
    shutil.copy(JSON_EXPORT, dest)
    print(f"  ✓ Copied database to plugin folder")
    return True


def update_single_issue(issue_number: int, api_key: str, csv_data: dict):
    """Update database with a single new issue"""
    print(f"\n📄 Processing Issue {issue_number}...")
    
    # Check if issue already exists
    if check_issue_exists(issue_number):
        print(f"  ℹ Issue {issue_number} already exists in database. Use --force to overwrite.")
        return False
    
    # Parse markdown file
    md_file = ARCHIVE_DIR / f"{issue_number}.md"
    if not md_file.exists():
        print(f"  ✗ File not found: {md_file}")
        return False
    
    articles = parse_markdown_file(md_file)
    if not articles:
        print(f"  ✗ No articles found in {md_file.name}")
        return False
    
    print(f"  ✓ Found {len(articles)} articles")
    
    # Cross-reference with CSV
    articles = cross_reference_with_csv(articles, csv_data)
    
    # Generate embeddings
    print(f"  🧠 Generating embeddings...")
    for i, article in enumerate(articles, 1):
        text = article.to_embedding_text()
        embedding = generate_embedding(text, api_key)
        if embedding:
            article.embedding = embedding
            print(f"    ✓ [{i}/{len(articles)}] {article.title[:40]}...")
        else:
            print(f"    ✗ [{i}/{len(articles)}] Failed")
    
    # Insert into database
    print(f"  💾 Saving to database...")
    insert_articles_into_db(articles)
    
    # Export to JSON
    print(f"  📦 Exporting to JSON...")
    export_database_to_json()
    
    # Copy to plugin
    print(f"  🔌 Copying to plugin...")
    copy_to_plugin()
    
    print(f"\n✅ Issue {issue_number} updated successfully!")
    print(f"   Articles added: {len(articles)}")
    print(f"   With embeddings: {sum(1 for a in articles if a.embedding)}")
    
    return True


def main():
    print("=" * 70)
    print("Kat's Kable Database - Incremental Update")
    print("=" * 70)
    
    # Check arguments
    if len(sys.argv) < 2:
        print("\nUsage: python update_database.py <issue_number> [--force]")
        print("\nExample:")
        print("  python update_database.py 381")
        print("  python update_database.py 381 --force  # Overwrite if exists")
        sys.exit(1)
    
    try:
        issue_number = int(sys.argv[1])
    except ValueError:
        print(f"❌ Error: Invalid issue number: {sys.argv[1]}")
        sys.exit(1)
    
    force = '--force' in sys.argv
    
    # Get API key
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        # Try to load from .env file
        env_file = Path(__file__).parent / '.env'
        if env_file.exists():
            with open(env_file, 'r') as f:
                for line in f:
                    if line.strip().startswith('OPENAI_API_KEY='):
                        api_key = line.strip().split('=', 1)[1].strip().strip('"\'')
                        break
    
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found")
        print("Please set it in environment or .env file")
        sys.exit(1)
    
    print(f"✓ API key loaded")
    
    # Load CSV data
    print(f"\n📊 Loading CSV data...")
    csv_data = load_csv_data()
    print(f"✓ Loaded {len(csv_data)} entries from CSV")
    
    # Check database exists
    if not DB_FILE.exists():
        print(f"❌ Error: Database not found at {DB_FILE}")
        print("Please run build_full_archive.py first to create the database")
        sys.exit(1)
    
    # Check if issue exists and handle force flag
    if check_issue_exists(issue_number):
        if force:
            print(f"⚠ Issue {issue_number} exists but --force flag set")
            print(f"  (Note: This script doesn't support overwriting yet)")
            print(f"  To overwrite, manually delete issue {issue_number} from database first")
            sys.exit(1)
        else:
            print(f"ℹ Issue {issue_number} already exists in database")
            print(f"  Use --force flag to overwrite (not recommended)")
            print(f"  Or manually delete the issue from database first")
            sys.exit(0)
    
    # Update the issue
    success = update_single_issue(issue_number, api_key, csv_data)
    
    if success:
        print("\n" + "=" * 70)
        print("Next steps:")
        print("  1. Rebuild the plugin: cd kats-kable-plugin && npm run build")
        print("  2. Copy main.js to plugin folder")
        print("  3. Restart Obsidian or reload plugin")
        print("=" * 70)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
