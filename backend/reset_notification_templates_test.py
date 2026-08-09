import os
import sys
import json
import urllib.request
from pathlib import Path
BASE = Path(r'D:/careconnect/backend')
sys.path.insert(0, str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from notifications.models import NotificationTemplate

User = get_user_model()
admin = User.objects.filter(role='ADMIN').first()
if not admin:
    raise SystemExit('No ADMIN user found')
access = str(RefreshToken.for_user(admin).access_token)
print('admin', admin.id, admin.username, admin.role)
url = 'http://127.0.0.1:8000/api/notifications/templates/reset/'
req = urllib.request.Request(url, data=b'{}', headers={
    'Authorization': f'Bearer {access}',
    'Content-Type': 'application/json',
}, method='POST')
with urllib.request.urlopen(req) as r:
    print('reset status', r.status)
    reset_body = json.load(r)
    print('reset count', len(reset_body))
    print(json.dumps(reset_body, indent=2))
print('db count after reset', NotificationTemplate.objects.count())
print(json.dumps(list(NotificationTemplate.objects.order_by('template_key').values('id','name','template_key','channel','subject','title','body')), indent=2))
url2 = 'http://127.0.0.1:8000/api/notifications/templates/'
req2 = urllib.request.Request(url2, headers={
    'Authorization': f'Bearer {access}',
    'Accept': 'application/json',
})
with urllib.request.urlopen(req2) as r2:
    print('get status', r2.status)
    get_body = json.load(r2)
    print('get count', len(get_body))
    print(json.dumps(get_body, indent=2))
