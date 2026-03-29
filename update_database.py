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


def parse_combined_articles(line: str) -> List[tuple]:
    """Parse a line that may contain multiple article links like '[Title1](URL1) & [Title2](URL2)'
    Returns list of (title, url) tuples
    """
    articles = []
    
    # Pattern to match markdown links: [Title](URL)
    link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    
    # Find all links in the line
    matches = list(re.finditer(link_pattern, line))
    
    if len(matches) >= 2:
        # Multiple articles in one line
        for match in matches:
            title = match.group(1).strip()
            url = match.group(2).strip()
            if title and url:
                articles.append((title, url))
    elif len(matches) == 1:
        # Single article
        match = matches[0]
        title = match.group(1).strip()
        url = match.group(2).strip()
        if title and url:
            articles.append((title, url))
    
    return articles


def extract_source_from_line(line: str) -> str:
    """Extract source from a line after the last markdown link
    Looks for patterns like ')- Source' or '] - Source'
    """
    # Find last markdown link
    last_link_end = line.rfind(')')
    if last_link_end == -1:
        return ""
    
    # Look for '- Source' pattern after the last link
    remaining = line[last_link_end+1:].strip()
    
    # Remove leading dash if present
    if remaining.startswith('-'):
        remaining = remaining[1:].strip()
    
    # Take only the first part before any punctuation or newline indicators
    # Split by common separators that indicate end of source
    for sep in ['  ', '\n', '...', ' _', '. ', '? ', '! ']:
        if sep in remaining:
            remaining = remaining.split(sep)[0]
            break
    
    return remaining.strip()


def parse_markdown_file(filepath: Path) -> Optional[List[Article]]:
    """Parse a markdown file and extract all articles"""
    content = filepath.read_text()
    
    issue_number, issue_type, special_theme = parse_issue_filename(filepath.name)
    if issue_number is None:
        return None
    
    # Extract date from YAML frontmatter (handles both quoted and unquoted dates)
    date_match = re.search(r'^date:\s*["\']?(\d{4}-\d{2}-\d{2})["\']?', content, re.MULTILINE)
    if not date_match:
        print(f"⚠ Warning: No date found in {filepath.name}")
        return None
    date = date_match.group(1)
    
    # Remove YAML frontmatter
    content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)
    
    articles = []
    
    # Try new format first (* * * separators)
    sections = re.split(r'\n\* \* \*\n', content)
    
    # If no sections found, try old format (---\n--- separators)
    if len(sections) <= 1:
        sections = re.split(r'\n---\s*\n---\s*\n', content)
    
    # If still no sections, try splitting by ### headers (Issue 349 style)
    if len(sections) <= 1:
        # Split by ### 1., ### 2., etc.
        sections = re.split(r'\n(?=###\s*\d+\.)', content)
    
    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        # Try to extract article number(s) and content
        
        # Check for format: ### **1**  [Title](URL) (Issue 72 style)
        heading_match = re.match(r'#{1,6}\s*\*\*\s*(\d+)\s*\*\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+-\s+(.+))?', section, re.DOTALL)
        
        # Check for format: ### 1. [Title](URL) (Source): (Issue 349 style)
        if not heading_match:
            heading_match = re.match(r'#{1,6}\s*(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)\s*\(([^)]+)\):?', section, re.DOTALL)
        
        # Check for format: ### 1. [Title](URL) without source (Issue 104 style)
        if not heading_match:
            heading_match = re.match(r'#{1,6}\s*(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)', section, re.DOTALL)
        
        if heading_match:
            position = int(heading_match.group(1))
            title = heading_match.group(2).strip()
            url = heading_match.group(3).strip()
            source = heading_match.group(4).strip() if len(heading_match.groups()) >= 4 and heading_match.group(4) else ""
            
            # Get commentary (everything after the first line)
            first_newline = section.find('\n')
            if first_newline != -1:
                commentary = section[first_newline:].strip()
            else:
                commentary = ""
            
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
            continue
        
        # Check for combined articles: **3 & 4** or **3 and 4**
        combined_match = re.match(r'\*\*\s*(\d+)\s*[&+and]+\s*(\d+)\s*\*\*\s*\n?(.+)', section, re.DOTALL | re.IGNORECASE)
        single_match = re.match(r'\*\*\s*(\d+)\s*\*\*\s*\n?(.+)', section, re.DOTALL)
        
        if not combined_match and not single_match:
            # Try alternative pattern without bold (e.g., "1." or "1)")
            combined_match = re.match(r'^(\d+)\s*[&+and]+\s*(\d+)[\.\)]\s*\n?(.+)', section, re.DOTALL | re.IGNORECASE)
            single_match = re.match(r'^(\d+)[\.\)]\s*\n?(.+)', section, re.DOTALL)
        
        if not combined_match and not single_match:
            # Try old format: just number on its own line, then link on next line
            # Use re.finditer to find ALL articles in the section (not just at the start)
            old_format_pattern = r'(?:^|\n)(\d+)\s*\n+\[([^\]]+)\]\(([^)]+)\)'
            old_format_matches = list(re.finditer(old_format_pattern, section, re.DOTALL))
            
            if old_format_matches:
                for i, old_format_match in enumerate(old_format_matches):
                    position = int(old_format_match.group(1))
                    title = old_format_match.group(2).strip()
                    url = old_format_match.group(3).strip()
                    
                    # Get content from this article to the next (or end of section)
                    start_pos = old_format_match.start()
                    if i + 1 < len(old_format_matches):
                        # Get content until the next article
                        end_pos = old_format_matches[i + 1].start()
                        article_content = section[start_pos:end_pos]
                    else:
                        # Get content until the end
                        article_content = section[start_pos:]
                    
                    # Extract source if present after link (on same line)
                    link_end_in_content = article_content.find(url) + len(url)
                    rest_of_line = article_content[link_end_in_content:article_content.find('\n', link_end_in_content)]
                    source = ""
                    if rest_of_line.strip().startswith('-'):
                        source = rest_of_line.strip()[1:].strip()
                    
                    # Get commentary (everything after the first line break after the link)
                    first_newline_after_link = article_content.find('\n', link_end_in_content)
                    if first_newline_after_link != -1:
                        commentary = article_content[first_newline_after_link:].strip()
                    else:
                        commentary = ""
                    
                    # Clean up commentary - remove image tags and normalize whitespace
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
                continue
            else:
                continue
        
        if combined_match:
            # Multiple articles in one section (e.g., "3 & 4")
            start_pos = int(combined_match.group(1))
            end_pos = int(combined_match.group(2))
            article_content = combined_match.group(3).strip()
            
            # Extract commentary (everything after the links line)
            lines = article_content.split('\n')
            links_line = lines[0] if lines else ""
            commentary = '\n'.join(lines[1:]).strip() if len(lines) > 1 else ""
            
            # Parse all article links from the first line
            article_links = parse_combined_articles(links_line)
            source = extract_source_from_line(links_line)
            
            # Create article objects for each link found
            expected_count = end_pos - start_pos + 1
            if len(article_links) != expected_count:
                print(f"  ⚠ Warning: Expected {expected_count} articles but found {len(article_links)} in section {start_pos}-{end_pos}")
            
            for i, (title, url) in enumerate(article_links):
                position = start_pos + i
                
                # Clean up commentary
                clean_commentary = re.sub(r'!\[.*?\]\(.*?\)', '', commentary)
                clean_commentary = re.sub(r'> ', '', clean_commentary)
                clean_commentary = re.sub(r'\n+', ' ', clean_commentary).strip()
                
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
                        commentary=clean_commentary
                    ))
                    
        elif single_match:
            # Single article section
            position = int(single_match.group(1))
            article_content = single_match.group(2).strip()
            
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
    # First try regular issue filename (e.g., 71.md)
    md_file = ARCHIVE_DIR / f"{issue_number}.md"
    
    # If not found, look for special edition (e.g., 74-climate.md, 102-fruits.md)
    if not md_file.exists():
        # Find any file that starts with the issue number
        for file_path in ARCHIVE_DIR.glob(f"{issue_number}-*.md"):
            md_file = file_path
            break
    
    if not md_file.exists():
        print(f"  ✗ File not found: {ARCHIVE_DIR}/{issue_number}.md or {ARCHIVE_DIR}/{issue_number}-*.md")
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
