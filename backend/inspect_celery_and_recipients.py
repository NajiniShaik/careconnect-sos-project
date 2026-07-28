import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
import django
django.setup()
from sos.models import SOS
from notifications.community_broadcast import CommunityBroadcastService
from notifications.models import Notification, CommunityBroadcastLog
from django.contrib.auth import get_user_model
from django.db.models import Q

try:
    import redis
except ImportError:
    redis = None

print('=== CELLERY INSPECTION ===')
if redis is None:
    print('redis package not installed')
else:
    try:
        r = redis.Redis(host='127.0.0.1', port=6379, db=0)
        keys = r.keys('celery*')
        print('redis celery keys count', len(keys))
        for key in keys[:20]:
            try:
                t = r.type(key)
                print('key', key, 'type', t, 'len', r.llen(key) if t == b'list' else None)
            except Exception as e:
                print('key error', key, e)
    except Exception as exc:
        print('redis connection failed', exc)

print('\n=== LATEST SOS ===')
latest_sos = SOS.objects.order_by('-created_at', '-id').first()
print('LATEST_SOS', latest_sos.id if latest_sos else None, getattr(latest_sos, 'status', None), getattr(latest_sos, 'created_at', None), getattr(latest_sos, 'user_id', None))
if latest_sos is None:
    sys.exit(0)

print('\n=== COMMUNITY BROADCAST LOGS ===')
logs = CommunityBroadcastLog.objects.filter(sos=latest_sos)
print('count', logs.count())
for log in logs:
    print('LOG', log.id, log.recipient_id, log.role, log.delivery_channel, log.delivery_status, log.recipient_contact)

print('\n=== VOLUNTEER NOTIFICATIONS FOR ALERT ===')
vol_qs = Notification.objects.filter(user__role='VOLUNTEER', data__alert_id=str(latest_sos.id)).order_by('-created_at', '-id')
print('count', vol_qs.count())
for n in vol_qs:
    print('VOL_NOTIF', n.id, n.user_id, n.kind, n.data)

print('\n=== COMMUNITY BROADCAST NOTIFICATIONS FOR ALERT ===')
comm_qs = Notification.objects.filter(Q(data__type='COMMUNITY_BROADCAST') | Q(data__broadcast=True) | Q(data__recipient_role='VOLUNTEER'), data__alert_id=str(latest_sos.id)).order_by('-created_at','-id')
print('count', comm_qs.count())
for n in comm_qs:
    print('COMM_NOTIF', n.id, n.user_id, n.kind, n.data)

print('\n=== GLOBAL COMMUNITY BROADCAST NOTIFICATIONS ===')
glob_qs = Notification.objects.filter(Q(data__type='COMMUNITY_BROADCAST') | Q(data__broadcast=True) | Q(data__recipient_role='VOLUNTEER')).order_by('-created_at','-id')
print('count', glob_qs.count())
for n in glob_qs[:20]:
    print('GLOBAL_COMM_NOTIF', n.id, n.user_id, n.kind, n.data)

print('\n=== RECIPIENT SELECTION ===')
service = CommunityBroadcastService()
recipients = service.get_recipients(latest_sos, include_residents=False, broadcast_radius_meters=None)
print('get_recipients count', len(recipients))
for u in recipients:
    print('RECIPIENT', u.id, u.username, getattr(u, 'role', None), getattr(getattr(u, 'volunteer_profile', None), 'is_available', None), getattr(getattr(u, 'volunteer_profile', None), 'last_known_latitude', None), getattr(getattr(u, 'volunteer_profile', None), 'last_known_longitude', None), getattr(getattr(u, 'security_profile', None), 'is_available', None))

society = getattr(getattr(latest_sos.user, 'resident_profile', None), 'society', None)
print('\nSOS SOCIETY', getattr(society, 'id', None), getattr(society, 'name', None))
vols = get_user_model().objects.filter(role='VOLUNTEER', volunteer_profile__society=society, is_active=True).order_by('id')
print('VOLUNTEERS_IN_SOCIETY', vols.count())
for u in vols:
    vp = getattr(u, 'volunteer_profile', None)
    print('VOL', u.id, u.username, getattr(vp, 'is_available', None), getattr(vp, 'last_known_latitude', None), getattr(vp, 'last_known_longitude', None))
secs = get_user_model().objects.filter(role='SECURITY', security_profile__society=society, is_active=True).order_by('id')
print('SECURITY_IN_SOCIETY', secs.count())
for u in secs:
    print('SEC', u.id, u.username)
