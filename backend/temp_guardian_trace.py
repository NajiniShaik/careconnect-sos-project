import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
from pathlib import Path

django.setup()
from django.contrib.auth import get_user_model
from users.models import GuardianProfile
from sos.models import SOS
from sos.views import _is_sos_visible_to_guardian

User = get_user_model()
sos = SOS.objects.get(pk=46)
print('SOS owner id=', sos.user.id)
print('SOS owner username=', sos.user.username)
print('SOS owner full_name=', sos.user.get_full_name())
print('SOS owner email=', sos.user.email)
print('---')
print('Linked guardian details and visibility:')
for user in User.objects.filter(role='GUARDIAN').order_by('id'):
    profile = GuardianProfile.objects.filter(user=user).first()
    if not profile:
        continue
    resident_name_value = str(profile.resident_name or '').strip().lower()
    owner_username = str(sos.user.username or '').strip().lower()
    owner_full_name = str(sos.user.get_full_name() or '').strip().lower()
    owner_email = str(sos.user.email or '').strip().lower()
    comparison_username = resident_name_value == owner_username
    comparison_full_name = resident_name_value == owner_full_name
    comparison_email = resident_name_value == owner_email
    visible = _is_sos_visible_to_guardian(sos, user)
    print('user id=', user.id)
    print('username=', user.username)
    print('email=', user.email)
    print('profile id=', profile.id)
    print('resident_name=', repr(profile.resident_name))
    print('resident_name_value=', repr(resident_name_value))
    print('owner_username=', repr(owner_username))
    print('owner_full_name=', repr(owner_full_name))
    print('owner_email=', repr(owner_email))
    print('compare username=', comparison_username)
    print('compare full_name=', comparison_full_name)
    print('compare email=', comparison_email)
    print('visible=', visible)
    print('---')

print('--- function source around helper ---')
text = Path('sos/views.py').read_text(encoding='utf-8').splitlines()
for i in range(len(text)):
    if i+1 >= 200 and i+1 <= 235:
        print(f'{i+1}: {text[i]}')
