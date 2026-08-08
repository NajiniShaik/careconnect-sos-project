import json
import urllib.request
import urllib.error
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django

django.setup()

from users.models import User
from django.contrib.auth import authenticate

email = 'shaiknajini65@gmail.com'
password = '1234567'

print('Checking user auth state for:', email)
try:
    user = User.objects.get(email=email)
    print('User found:', user.username, user.email, 'active=' + str(user.is_active), 'role=' + str(user.role))
    print('has usable password:', user.has_usable_password())
    print('check_password:', user.check_password(password))
    auth = authenticate(username=user.username, password=password)
    print('authenticate result:', auth)
except User.DoesNotExist:
    print('User does not exist for email', email)

payload = json.dumps({'email': email, 'password': password}).encode('utf-8')
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/users/login/',
    data=payload,
    headers={'Content-Type': 'application/json'},
)
print('\nSending POST to /api/users/login/')
try:
    resp = urllib.request.urlopen(req)
    print('STATUS', resp.status)
    print(resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    print(e.read().decode('utf-8'))
except Exception as e:
    print('ERROR', e)
