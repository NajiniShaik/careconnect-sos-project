import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.db import connection

with connection.cursor() as c:
    c.execute("SELECT column_name FROM information_schema.columns WHERE table_name='sos_sos';")
    cols = sorted([r[0] for r in c.fetchall()])

print(cols)
print('priority_present:', 'priority' in cols)
