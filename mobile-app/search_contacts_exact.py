import os
root = r'd:\careconnect\mobile-app'
subs = ['/api/contacts', '/contacts/']
for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if fn.endswith(('.js','.jsx','.ts','.tsx','.json','.d.ts','.html','.map')):
            path = os.path.join(dirpath, fn)
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                try:
                    text = data.decode('utf-8', errors='ignore')
                except:
                    continue
                for i, line in enumerate(text.splitlines(), 1):
                    for sub in subs:
                        if sub in line:
                            print(f'{path}:{i}:{line.strip()}')
            except Exception:
                continue
