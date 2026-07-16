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

user = User.objects.filter(id=2).first()
if not user:
    print('Resident user id=2 not found; listing users:')
    for u in User.objects.all():
        print(u.id, getattr(u,'email',None), getattr(u,'role',None))
    raise SystemExit(1)

print('Using user:', user.id, getattr(user,'email',None), getattr(user,'role',None))

token = str(RefreshToken.for_user(user).access_token)
client = APIClient()
client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

# use HTTP_HOST to avoid DisallowedHost when using the test client
host_kw = {'HTTP_HOST': '127.0.0.1'}

payload = {
    'message': 'Automated SOS test',
    'location': 'Test Location',
    'category': 'medical',
    'latitude': 12.9716,
    'longitude': 77.5946,
    'priority': 'HIGH'
}
from sos.models import SOS
before_count = SOS.objects.count()
resp = client.post('/api/sos/trigger/', payload, format='json', **host_kw)
print('POST /api/sos/trigger/ status:', resp.status_code)
print('response data:', getattr(resp,'data', resp.content))
after_count = SOS.objects.count()
print('SOS count before:', before_count, 'after:', after_count)

# fetch resident's sos list
get_resp = client.get('/api/sos/trigger/', **host_kw)
print('GET /api/sos/trigger/ status:', get_resp.status_code)
print('GET response length:', len(get_resp.data) if getattr(get_resp,'data',None) is not None else get_resp.content)

# fetch alerts endpoint
alerts = client.get('/api/sos/alerts/', **host_kw)
print('GET /api/sos/alerts/ status:', alerts.status_code)
print('alerts data sample:', getattr(alerts,'data', alerts.content))

# print latest sos rows from DB
qs = SOS.objects.order_by('-created_at')[:5]
for s in qs:
    print('SOS', s.id, s.user_id, s.status, s.priority, s.message)
