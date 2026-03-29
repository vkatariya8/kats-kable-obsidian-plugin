#!/usr/bin/env python3
"""
List all markdown files in archive that are not yet in the database.
"""

import sqlite3
from pathlib import Path
from collections import Counter

ARCHIVE_DIR = Path("/Users/kat/Documents/kats_kable_temp/archive")
DB_FILE = Path("/Users/kat/Documents/kats_kable_temp/kats_kable_full.db")


def get_issues_in_database():
    """Get all issue numbers currently in database"""
    if not DB_FILE.exists():
        return set()
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT DISTINCT issue_number FROM articles')
    issues = {row[0] for row in cursor.fetchall()}
    conn.close()
    return issues


def get_markdown_files():
    """Get all markdown files in archive directory"""
    if not ARCHIVE_DIR.exists():
        return []
    
    md_files = sorted(ARCHIVE_DIR.glob("*.md"))
    
    files = []
    for md_file in md_files:
        # Try to parse issue number from filename
        basename = md_file.stem  # filename without extension
        
        # Check for special edition pattern: 102-fruits, 74-climate
        import re
        special_match = re.match(r'^(\d+)-(.+)$', basename)
        
        if special_match:
            issue_num = int(special_match.group(1))
            theme = special_match.group(2)
            files.append({
                'filename': md_file.name,
                'issue_number': issue_num,
                'type': 'special',
                'theme': theme
            })
        else:
            # Try to parse as regular issue number
            try:
                issue_num = int(basename)
                files.append({
                    'filename': md_file.name,
                    'issue_number': issue_num,
                    'type': 'regular',
                    'theme': None
                })
            except ValueError:
                # Non-numeric filename, skip
                pass
    
    return files


def list_new_issues():
    """List all markdown files not yet in database"""
    print("🔍 Scanning for new issues...")
    print()
    
    # Get current state
    db_issues = get_issues_in_database()
    md_files = get_markdown_files()
    
    if not md_files:
        print("❌ No markdown files found in archive directory")
        return
    
    # Separate into processed and unprocessed
    processed = []
    unprocessed = []
    
    for file_info in md_files:
        if file_info['issue_number'] in db_issues:
            processed.append(file_info)
        else:
            unprocessed.append(file_info)
    
    # Show summary
    print(f"📊 Summary:")
    print(f"   Total markdown files: {len(md_files)}")
    print(f"   Already in database: {len(processed)}")
    print(f"   Not yet processed: {len(unprocessed)}")
    print()
    
    # Show processed issues
    if processed:
        print(f"✅ Issues in database ({len(processed)}):")
        regular = [p for p in processed if p['type'] == 'regular']
        special = [p for p in processed if p['type'] == 'special']
        
        if regular:
            nums = sorted([p['issue_number'] for p in regular])
            print(f"   Regular: {', '.join(map(str, nums[:10]))}{'...' if len(nums) > 10 else ''}")
        
        if special:
            special_strs = [f"{p['issue_number']}-{p['theme']}" for p in special]
            print(f"   Special: {', '.join(special_strs)}")
        print()
    
    # Show unprocessed issues
    if unprocessed:
        print(f"🆕 New issues to process ({len(unprocessed)}):")
        for file_info in unprocessed:
            if file_info['type'] == 'special':
                print(f"   Issue {file_info['issue_number']} - {file_info['theme']} ({file_info['filename']})")
            else:
                print(f"   Issue {file_info['issue_number']} ({file_info['filename']})")
        print()
        
        # Show command to process all
        issue_nums = sorted([u['issue_number'] for u in unprocessed])
        print("📋 Commands to process:")
        for num in issue_nums:
            print(f"   python3 update_database.py {num}")
    else:
        print("✨ All caught up! No new issues to process.")
    
    # Show issue range
    if db_issues:
        print()
        print(f"📈 Database covers issues {min(db_issues)} to {max(db_issues)}")
        
        # Find gaps
        all_nums = set(range(min(db_issues), max(db_issues) + 1))
        gaps = sorted(all_nums - db_issues)
        if gaps:
            print(f"⚠️  Missing issues in range: {', '.join(map(str, gaps[:10]))}{'...' if len(gaps) > 10 else ''}")


def main():
    list_new_issues()


if __name__ == "__main__":
    main()
