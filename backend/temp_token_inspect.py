import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django

django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from users.models import GuardianProfile
from sos.models import SOS
from sos.views import _is_sos_visible_to_guardian

User = get_user_model()
print('OutstandingToken count:', OutstandingToken.objects.count())
print('BlacklistedToken count:', BlacklistedToken.objects.count())
for token in OutstandingToken.objects.select_related('user').all():
    print('token id=', token.id, 'user_id=', token.user.id, 'username=', token.user.username, 'email=', token.user.email, 'role=', token.user.role, 'created=', token.created_at, 'expires=', token.expires_at, 'blacklisted=', BlacklistedToken.objects.filter(token=token).exists())
print('---')
print('Guardian users with a profile:')
for user in User.objects.filter(role='GUARDIAN').order_by('id'):
    gp = GuardianProfile.objects.filter(user=user).first()
    print('user id=', user.id, 'username=', user.username, 'email=', user.email, 'profile id=', gp.id if gp else None, 'resident_name=', repr(gp.resident_name) if gp else None)
print('---')
# SOS #46 and visibility for all guardian profiles
sos = SOS.objects.get(pk=46)
print('SOS owner id=', sos.user.id, 'username=', sos.user.username, 'email=', sos.user.email)
for user in User.objects.filter(role='GUARDIAN').order_by('id'):
    gp = GuardianProfile.objects.filter(user=user).first()
    if not gp:
        continue
    visible = _is_sos_visible_to_guardian(sos, user)
    print('user id=', user.id, 'username=', user.username, 'profile id=', gp.id, 'resident_name=', repr(gp.resident_name), 'visible=', visible)
