import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient
from sos.models import SOS
User = get_user_model()
u, created = User.objects.get_or_create(username='soscheck_new', defaults={'email':'soscheck_new@example.com','role':'RESIDENT','is_active':True})
u.set_password('Password123!')
u.save()
print('user', u.username, u.role)
print('created', created)
token = str(RefreshToken.for_user(u).access_token)
client = APIClient()
client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
resp = client.post('/api/sos/trigger/', {'message':'hello','location':'x'}, format='json')
print('status', resp.status_code)
print('body', resp.content.decode())
print('count', SOS.objects.filter(user=u).count())
print('rows', list(SOS.objects.filter(user=u).values('id','status','message','location')))
