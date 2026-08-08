import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from users.models import GuardianProfile
from sos.models import SOS

django.setup()
User = get_user_model()
client = APIClient()
sos = SOS.objects.get(pk=46)
print('SOS owner id=', sos.user.id)
print('SOS owner username=', sos.user.username)
print('SOS owner full_name=', sos.user.get_full_name())
print('SOS owner email=', sos.user.email)
print('---')
for user in User.objects.filter(role='GUARDIAN').order_by('id'):
    gp = GuardianProfile.objects.filter(user=user).first()
    client.force_authenticate(user=user)
    response = client.get(f'/api/sos/{sos.id}/updates/')
    print('user id=', user.id, 'username=', user.username, 'profile id=', gp.id if gp else None, 'resident_name=', repr(gp.resident_name) if gp else None, 'status=', response.status_code)
