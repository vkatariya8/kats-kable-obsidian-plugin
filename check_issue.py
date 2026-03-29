#!/usr/bin/env python3
"""
Check what's in the database for a specific issue.
"""

import sys
import sqlite3
from pathlib import Path

DB_FILE = Path("/Users/kat/Documents/kats_kable_temp/kats_kable_full.db")


def check_issue(issue_number: int):
    """Show all articles from a specific issue"""
    if not DB_FILE.exists():
        print(f"❌ Database not found at {DB_FILE}")
        return
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get issue info
    cursor.execute('''
        SELECT issue_number, issue_type, special_theme, date, 
               COUNT(*) as article_count,
               COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
        FROM articles 
        WHERE issue_number = ?
        GROUP BY issue_number, issue_type, special_theme, date
    ''', (issue_number,))
    
    issue_info = cursor.fetchone()
    
    if not issue_info:
        print(f"ℹ Issue {issue_number} not found in database")
        conn.close()
        return
    
    # Display issue info
    issue_type = issue_info['issue_type']
    special = f" ({issue_info['special_theme']})" if issue_info['special_theme'] else ""
    print(f"\n📄 Issue {issue_number}{special}")
    print(f"   Date: {issue_info['date']}")
    print(f"   Type: {issue_type}")
    print(f"   Articles: {issue_info['article_count']}")
    print(f"   With embeddings: {issue_info['with_embeddings']}")
    print("\n" + "=" * 70)
    
    # Get all articles
    cursor.execute('''
        SELECT title, url, source, commentary, embedding IS NOT NULL as has_embedding
        FROM articles 
        WHERE issue_number = ?
        ORDER BY position
    ''', (issue_number,))
    
    articles = cursor.fetchall()
    
    for i, article in enumerate(articles, 1):
        has_emb = "✓" if article['has_embedding'] else "✗"
        print(f"\n{i}. [{has_emb}] {article['title']}")
        print(f"   Source: {article['source'][:60]}{'...' if len(article['source']) > 60 else ''}")
        print(f"   URL: {article['url'][:70]}{'...' if len(article['url']) > 70 else ''}")
    
    conn.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: python check_issue.py <issue_number>")
        print("\nExample:")
        print("  python check_issue.py 381")
        sys.exit(1)
    
    try:
        issue_number = int(sys.argv[1])
    except ValueError:
        print(f"❌ Invalid issue number: {sys.argv[1]}")
        sys.exit(1)
    
    check_issue(issue_number)


if __name__ == "__main__":
    main()
