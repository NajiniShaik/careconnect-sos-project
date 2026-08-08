from users.models import GuardianProfile
from sos.models import SOS
s = SOS.objects.get(pk=46)
owner = s.user
print('owner_username=' + owner.username)
print('owner_full_name=' + owner.get_full_name())
print('owner_email=' + owner.email)
print('---')
for p in GuardianProfile.objects.select_related('user').all():
    gu = p.user
    resident_name = str(p.resident_name or '').strip()
    print('guardian_username=' + gu.username + ' | resident_name=' + resident_name)
