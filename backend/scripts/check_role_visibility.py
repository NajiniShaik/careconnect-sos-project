import os, sys
from pathlib import Path
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient
User = get_user_model()

host_kw = {'HTTP_HOST': '127.0.0.1'}

def get_alerts_for_user(user):
    token = str(RefreshToken.for_user(user).access_token)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    resp = client.get('/api/sos/alerts/', **host_kw)
    return resp

# find example users
admin = User.objects.filter(role='ADMIN').first()
security = User.objects.filter(role='SECURITY').first()
resident = User.objects.filter(role='RESIDENT').first()
print('found users: admin:', getattr(admin,'id',None), 'security:', getattr(security,'id',None), 'resident:', getattr(resident,'id',None))

for name, user in [('ADMIN', admin), ('SECURITY', security), ('RESIDENT', resident)]:
    if not user:
        print(name, 'user not found')
        continue
    resp = get_alerts_for_user(user)
    print(name, 'status', resp.status_code)
    data = getattr(resp, 'data', None)
    print(name, 'alerts_count', len(data) if isinstance(data, list) else 'err')
    if isinstance(data, list) and data:
        print(name, 'latest id:', data[0].get('id'))
