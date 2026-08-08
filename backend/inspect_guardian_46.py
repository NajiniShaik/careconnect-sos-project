import os
from users.models import GuardianProfile
from sos.models import SOS
s = SOS.objects.get(pk=46)
own = s.user
print('owner_username=' + own.username)
print('owner_full_name=' + own.get_full_name())
print('owner_email=' + own.email)
print('---')
for p in GuardianProfile.objects.select_related('user').all():
    gu = p.user
    resident_name = str(p.resident_name or '').strip()
    print('guardian_username=' + gu.username + ' | resident_name=' + resident_name)
