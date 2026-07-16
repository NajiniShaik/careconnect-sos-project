import os
import sys
import django
import traceback

# Ensure project root (backend/) is on sys.path so `config` settings import works
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from sos.views import CreateSOSView

User = get_user_model()

try:
    u = User.objects.get(id=2)
except Exception:
    print('User with id=2 not found')
    raise

factory = APIRequestFactory()
data = {'message':'Test SOS from agent','location':'Home','category':'medical','latitude':12.9716,'longitude':77.5946,'priority':'HIGH'}
req = factory.post('/api/sos/trigger/', data, format='json')
force_authenticate(req, user=u)
view = CreateSOSView.as_view()
try:
    resp = view(req)
    print('status', resp.status_code)
    print(getattr(resp, 'data', None))
except Exception:
    traceback.print_exc()
