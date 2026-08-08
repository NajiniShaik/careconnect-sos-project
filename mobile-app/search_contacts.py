import os
import re

root = r'd:\careconnect\mobile-app'
patterns = [r'/api/contacts', r'/contacts/', r'"/contacts"', r"'/contacts'", r'ContactDirectory', r'loadContacts', r'fetchContacts']
regex = re.compile('|'.join(patterns))

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        path = os.path.join(dirpath, fn)
        if os.path.islink(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                for i, line in enumerate(f, 1):
                    if regex.search(line):
                        print(f'{path}:{i}:{line.rstrip()}')
        except Exception:
            continue
