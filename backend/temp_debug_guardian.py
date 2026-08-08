import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
django.setup()
from django.contrib.auth import get_user_model
from users.models import GuardianProfile
from sos.models import SOS
from sos.views import _is_sos_visible_to_guardian

User = get_user_model()
try:
    sos = SOS.objects.get(pk=46)
except SOS.DoesNotExist:
    print('SOS 46 missing')
    raise SystemExit(1)
print('SOS owner id=', sos.user.id)
print('SOS owner username=', sos.user.username)
print('SOS owner full_name=', sos.user.get_full_name())
print('SOS owner email=', sos.user.email)
print('SOS owner role=', sos.user.role)
print('---')
print('Guardian users:')
for user in User.objects.filter(role='GUARDIAN').order_by('id'):
    gp = GuardianProfile.objects.filter(user=user).first()
    print('user id=', user.id, 'username=', user.username, 'role=', user.role, 'profile id=', gp.id if gp else None, 'resident_name=', repr(gp.resident_name) if gp else None)
    if gp:
        print('  visible=', _is_sos_visible_to_guardian(sos, user))
        rn = (str(gp.resident_name or '').strip().lower())
        ru = str(user.username or '').strip().lower()
        so = str(sos.user.username or '').strip().lower()
        print('  owner_username_match=', rn == so)
        print('  owner_email_match=', rn == str(sos.user.email or '').strip().lower())
        print('  owner_full_name_match=', rn == str(sos.user.get_full_name() or '').strip().lower())

print('---')
print('Any guardian username Resident?')
print(User.objects.filter(username='Resident', role='GUARDIAN').values_list('id', flat=True))
print('---')
from pathlib import Path
path = Path('sos/views.py')
for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), start=1):
    if 'def _is_sos_visible_to_guardian' in line or 'resident_name_value in {' in line or 'if not can_view:' in line and 'return Response(status=status.HTTP_403_FORBIDDEN)' in line or 'return Response(status=status.HTTP_403_FORBIDDEN)' in line:
        print(i, line)
