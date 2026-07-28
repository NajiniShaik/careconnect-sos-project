import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
import django
django.setup()
from sos.models import SOS
from django.contrib.auth import get_user_model

User = get_user_model()
latest_sos = SOS.objects.order_by('-created_at', '-id').first()
if latest_sos is None:
    print('LATEST_SOS', None)
    sys.exit(0)
resident = latest_sos.user
resident_profile = getattr(resident, 'resident_profile', None)
resident_society = getattr(resident_profile, 'society', None)
print('LATEST_SOS', latest_sos.id)
print('RESIDENT_ID', resident.id)
print('RESIDENT_USERNAME', resident.username)
print('RESIDENT_SOCIETY_ID', getattr(resident_society, 'id', None))
print('RESIDENT_SOCIETY_NAME', getattr(resident_society, 'name', None))

volunteers = User.objects.filter(role='VOLUNTEER').order_by('id')
print('VOLUNTEERS_COUNT', volunteers.count())
for u in volunteers:
    vp = getattr(u, 'volunteer_profile', None)
    society = getattr(vp, 'society', None)
    print('VOL', u.id, u.username, getattr(society, 'id', None), getattr(society, 'name', None), getattr(vp, 'is_available', None))

security_users = User.objects.filter(role='SECURITY').order_by('id')
print('SECURITY_COUNT', security_users.count())
for u in security_users:
    sp = getattr(u, 'security_profile', None)
    society = getattr(sp, 'society', None)
    print('SEC', u.id, u.username, getattr(society, 'id', None), getattr(society, 'name', None))

resident_society_id = getattr(resident_society, 'id', None)
vol_in_society = volunteers.filter(volunteer_profile__society=resident_society).count()
sec_in_society = security_users.filter(security_profile__society=resident_society).count()
print('VOL_IN_SOCIETY', vol_in_society)
print('SEC_IN_SOCIETY', sec_in_society)
