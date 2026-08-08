import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
django.setup()
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from django.contrib.auth import get_user_model
User = get_user_model()
print('OutstandingToken fields:', [f.name for f in OutstandingToken._meta.fields])
print('BlacklistedToken fields:', [f.name for f in BlacklistedToken._meta.fields])
print('---')
qs = OutstandingToken.objects.all().order_by('-created_at')[:30]
print('latest outstanding tokens:')
for t in qs:
    blacklisted = hasattr(t, 'blacklistedtoken') and t.blacklistedtoken is not None
    print('id=', t.id, 'user_id=', t.user_id, 'username=', getattr(t.user, 'username', None), 'role=', getattr(t.user, 'role', None), 'created=', t.created_at, 'expires=', t.expires_at, 'blacklisted=', blacklisted)
print('---')
print('latest guardian outstanding tokens:')
qs2 = OutstandingToken.objects.filter(user__role='GUARDIAN').order_by('-created_at')[:30]
for t in qs2:
    blacklisted = hasattr(t, 'blacklistedtoken') and t.blacklistedtoken is not None
    print('id=', t.id, 'user_id=', t.user_id, 'username=', getattr(t.user, 'username', None), 'created=', t.created_at, 'expires=', t.expires_at, 'blacklisted=', blacklisted)
print('---')
print('current latest guardian users:')
seen = set()
for t in qs2:
    if hasattr(t, 'blacklistedtoken') and t.blacklistedtoken is not None:
        continue
    if t.user_id in seen:
        continue
    seen.add(t.user_id)
    print('user_id=', t.user_id, 'username=', t.user.username, 'created=', t.created_at)
