import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
import django
django.setup()
from sos.models import SOS
from notifications.models import Notification, CommunityBroadcastLog
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()
latest_sos = SOS.objects.order_by('-created_at', '-id').first()
print('LATEST_SOS', latest_sos.id if latest_sos else None, latest_sos.status if latest_sos else None, latest_sos.created_at if latest_sos else None, latest_sos.user_id if latest_sos else None)
if latest_sos is None:
    sys.exit(0)
print('COMMUNITY_BROADCAST_LOGS', CommunityBroadcastLog.objects.filter(sos=latest_sos).count())
for log in CommunityBroadcastLog.objects.filter(sos=latest_sos).order_by('id'):
    print('LOG', log.id, log.recipient_id, log.role, log.delivery_channel, log.delivery_status, log.recipient_contact)
notif_qs = Notification.objects.filter(user__role='VOLUNTEER', data__alert_id=str(latest_sos.id)).order_by('-created_at','-id')
print('VOLUNTEER_NOTIFICATIONS_FOR_ALERT', notif_qs.count())
for n in notif_qs:
    print('VOL_NOTIF', n.id, n.user_id, n.kind, n.data)
# Any COMMUNITY_BROADCAST style notifications across all users for this alert
special_notifs = Notification.objects.filter(Q(data__type='COMMUNITY_BROADCAST')|Q(data__broadcast=True)|Q(data__recipient_role='VOLUNTEER'), data__alert_id=str(latest_sos.id)).order_by('-created_at','-id')
print('ANY_COMMUNITY_BROADCAST_NOTIFICATIONS_FOR_ALERT', special_notifs.count())
for n in special_notifs:
    print('COMM_NOTIF', n.id, n.user_id, n.kind, n.data)
# All community broadcasts globally
global_broadcast = Notification.objects.filter(Q(data__type='COMMUNITY_BROADCAST')|Q(data__broadcast=True)|Q(data__recipient_role='VOLUNTEER')).order_by('-created_at','-id')
print('GLOBAL_COMMUNITY_BROADCAST_NOTIFICATIONS', global_broadcast.count())
for n in global_broadcast[:50]:
    print('GLOBAL_COMM_NOTIF', n.id, n.user_id, n.kind, n.data)
society = getattr(getattr(latest_sos.user, 'resident_profile', None), 'society', None)
print('SOS_SOCIETY', getattr(society, 'id', None), getattr(society, 'name', None))
volunteers = User.objects.filter(role='VOLUNTEER', volunteer_profile__society=society, is_active=True).order_by('id')
print('VOLUNTEERS_IN_SOCIETY', volunteers.count())
for u in volunteers:
    vp = getattr(u, 'volunteer_profile', None)
    print('VOL_USER', u.id, u.username, getattr(u, 'is_active', None), getattr(vp, 'is_available', None), getattr(vp, 'last_known_latitude', None), getattr(vp, 'last_known_longitude', None))
