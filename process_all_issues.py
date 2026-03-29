#!/usr/bin/env python3
"""
Batch process all unprocessed issues
Processes multiple issues sequentially with progress tracking
"""

import subprocess
import sys
import os
from pathlib import Path

# Get all unprocessed issue numbers
result = subprocess.run(
    ['python3', 'list_new_issues.py'],
    capture_output=True,
    text=True,
    cwd='/Users/kat/Documents/kats_kable_temp'
)

# Parse issue numbers from output
issues = []
for line in result.stdout.split('\n'):
    if 'python3 update_database.py' in line:
        # Extract issue number from line like "   python3 update_database.py 71"
        issue_num = line.strip().split()[-1]
        try:
            issues.append(int(issue_num))
        except:
            pass

print(f"Found {len(issues)} issues to process")
print("=" * 70)

# Get API key
api_key = os.environ.get('OPENAI_API_KEY')
if not api_key:
    env_file = Path('/Users/kat/Documents/kats_kable_temp/.env')
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                if line.strip().startswith('OPENAI_API_KEY='):
                    api_key = line.strip().split('=', 1)[1].strip().strip('"\'')
                    break

if not api_key:
    print("❌ Error: OPENAI_API_KEY not found")
    sys.exit(1)

os.environ['OPENAI_API_KEY'] = api_key

# Process each issue
success_count = 0
fail_count = 0

for i, issue_num in enumerate(issues, 1):
    print(f"\n[{i}/{len(issues)}] Processing Issue {issue_num}...")
    
    result = subprocess.run(
        ['python3', 'update_database.py', str(issue_num)],
        capture_output=True,
        text=True,
        cwd='/Users/kat/Documents/kats_kable_temp'
    )
    
    if result.returncode == 0:
        print(f"  ✅ Success")
        success_count += 1
    else:
        print(f"  ❌ Failed")
        print(f"     Error: {result.stderr[:200]}")
        fail_count += 1

print("\n" + "=" * 70)
print(f"Batch processing complete!")
print(f"  Success: {success_count}/{len(issues)}")
print(f"  Failed: {fail_count}/{len(issues)}")

if fail_count == 0:
    print("\n✅ All issues processed successfully!")
    print("\nNext steps:")
    print("  1. Copy updated database to plugin folder")
    print("  2. Rebuild plugin: cd kats-kable-plugin && npm run build")
    print("  3. Test in Obsidian!")
else:
    print(f"\n⚠️  {fail_count} issues failed. Check errors above.")
