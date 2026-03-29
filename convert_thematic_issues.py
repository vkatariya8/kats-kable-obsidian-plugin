#!/usr/bin/env python3
"""
Convert thematic issues (with topic headings like "### **Roger Federer**") 
to standard format ("### 1. [Title](URL)")
"""

import re
from pathlib import Path
import sys

ARCHIVE_DIR = Path("/Users/kat/Documents/kats_kable_temp/archive")

def is_thematic_issue(filepath: Path) -> bool:
    """Check if file uses thematic format with topic headings"""
    content = filepath.read_text()
    
    # Remove frontmatter
    content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)
    
    # Count patterns
    topic_pattern = r'###\s*\*\*[^*]+\*\*'  # ### **Topic**
    numbered_pattern = r'###\s*\d+\.'  # ### 1.
    
    topic_count = len(re.findall(topic_pattern, content))
    numbered_count = len(re.findall(numbered_pattern, content))
    
    # If more topic headings than numbered, it's thematic
    return topic_count > numbered_count

def convert_thematic_issue(filepath: Path):
    """Convert thematic format to standard numbered format"""
    content = filepath.read_text()
    
    # Extract frontmatter
    frontmatter_match = re.match(r'^(---\n.*?\n---\n)', content, re.DOTALL)
    frontmatter = frontmatter_match.group(1) if frontmatter_match else ""
    body = content[len(frontmatter):] if frontmatter else content
    
    # Split by * * *
    sections = re.split(r'\n\* \* \*\n', body)
    
    new_sections = []
    article_num = 0
    
    for section in sections:
        section = section.strip()
        if not section:
            continue
        
        # Check if it's a topic heading section
        topic_match = re.match(r'###\s*\*\*([^*]+)\*\*', section)
        if topic_match:
            # Skip the topic heading, find the article link
            lines = section.split('\n')
            
            # Find the first line with a markdown link
            article_line = None
            commentary_lines = []
            
            for i, line in enumerate(lines[1:]):  # Skip topic heading
                if re.search(r'\[([^\]]+)\]\(([^)]+)\)', line):
                    article_line = line
                    # Collect commentary (lines after article until next separator or image)
                    for j in range(i + 2, len(lines)):
                        if lines[j].strip() and not lines[j].startswith('![') and not lines[j].startswith('*'):
                            commentary_lines.append(lines[j])
                        elif lines[j].startswith('!['):
                            break
                    break
            
            if article_line:
                article_num += 1
                # Extract title and URL
                link_match = re.search(r'\[([^\]]+)\]\(([^)]+)\)', article_line)
                if link_match:
                    title = link_match.group(1)
                    url = link_match.group(2)
                    
                    # Build new section
                    new_section = f"### {article_num}. [{title}]({url})\n\n"
                    if commentary_lines:
                        new_section += '\n'.join(commentary_lines)
                    
                    new_sections.append(new_section)
        else:
            # Keep non-topic sections as-is
            new_sections.append(section)
    
    # Reconstruct file
    new_body = '\n\n* * *\n\n'.join(new_sections)
    new_content = frontmatter + new_body
    
    return new_content

def main():
    # Find all unprocessed files
    result = Path("/Users/kat/Documents/kats_kable_temp").glob("archive/*.md")
    
    # Get list from list_new_issues.py
    import subprocess
    list_result = subprocess.run(
        ['python3', 'list_new_issues.py'],
        capture_output=True,
        text=True,
        cwd='/Users/kat/Documents/kats_kable_temp'
    )
    
    unprocessed_issues = set()
    for line in list_result.stdout.split('\n'):
        if 'python3 update_database.py' in line:
            issue_num = line.strip().split()[-1]
            try:
                unprocessed_issues.add(int(issue_num))
            except:
                pass
    
    print(f"Checking {len(unprocessed_issues)} unprocessed issues...")
    print("=" * 70)
    
    converted = []
    skipped = []
    
    for issue_num in sorted(unprocessed_issues):
        # Find the file
        md_file = ARCHIVE_DIR / f"{issue_num}.md"
        if not md_file.exists():
            # Try special edition
            for f in ARCHIVE_DIR.glob(f"{issue_num}-*.md"):
                md_file = f
                break
        
        if not md_file.exists():
            continue
        
        content = md_file.read_text()
        
        # Check if empty (placeholders)
        if '[]()' in content and content.count('[]()') >= 5:
            print(f"Issue {issue_num}: SKIPPING (empty placeholders)")
            skipped.append(issue_num)
            continue
        
        # Check if thematic
        if is_thematic_issue(md_file):
            print(f"Issue {issue_num}: CONVERTING (thematic format)")
            new_content = convert_thematic_issue(md_file)
            
            # Backup original
            backup_file = md_file.with_suffix('.md.backup')
            md_file.rename(backup_file)
            
            # Write converted
            md_file.write_text(new_content)
            converted.append(issue_num)
        else:
            print(f"Issue {issue_num}: Already standard format")
    
    print("\n" + "=" * 70)
    print(f"Converted: {len(converted)} issues")
    print(f"Skipped (empty): {len(skipped)} issues")
    
    if converted:
        print("\nConverted issues:", converted)
    if skipped:
        print("\nSkipped issues:", skipped)

if __name__ == "__main__":
    main()
