import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django

django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from django.utils import timezone
from users.models import GuardianProfile
from sos.models import SOS
from sos.views import _is_sos_visible_to_guardian

User = get_user_model()
now = timezone.now()
tokens = OutstandingToken.objects.filter(blacklisted=False, user__role='GUARDIAN').order_by('-created_at')
print('Non-blacklisted guardian token count:', tokens.count())
seen = set()
for token in tokens[:10]:
    print('token id=', token.id, 'user_id=', token.user.id, 'username=', token.user.username, 'email=', token.user.email, 'created=', token.created_at, 'expires=', token.expires_at)
    if token.user.id not in seen:
        seen.add(token.user.id)
print('--- latest guardian users by last valid token:')
for user_id in seen:
    user = User.objects.get(pk=user_id)
    gp = GuardianProfile.objects.filter(user=user).first()
    print('user id=', user.id, 'username=', user.username, 'email=', user.email, 'profile id=', gp.id if gp else None, 'resident_name=', repr(gp.resident_name) if gp else None)

sos = SOS.objects.get(pk=46)
print('--- SOS 46 owner id=', sos.user.id, 'username=', sos.user.username, 'email=', sos.user.email)
for user_id in seen:
    user = User.objects.get(pk=user_id)
    gp = GuardianProfile.objects.filter(user=user).first()
    if not gp:
        print('user id=', user.id, 'username=', user.username, 'NO GUARDIAN PROFILE')
        continue
    visible = _is_sos_visible_to_guardian(sos, user)
    print('user id=', user.id, 'username=', user.username, 'profile id=', gp.id, 'resident_name=', repr(gp.resident_name), 'visible=', visible)
