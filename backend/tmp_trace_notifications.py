import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from sos.models import SOS
from notifications.models import Notification
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()

latest_sos = SOS.objects.order_by('-created_at', '-id').first()
print('LATEST_SOS', latest_sos.id if latest_sos else None, latest_sos.status if latest_sos else None, latest_sos.created_at if latest_sos else None, latest_sos.user_id if latest_sos else None)
if latest_sos is not None:
    alert_id = str(latest_sos.id)
    qs = Notification.objects.filter(Q(data__alert_id=alert_id) | Q(data__alertId=alert_id) | Q(data__alertid=alert_id)).order_by('-created_at', '-id')
    print('NOTIFICATIONS_FOR_ALERT', qs.count())
    for n in qs[:50]:
        print('NOTIF', n.id, n.user_id, getattr(n.user, 'role', None), n.kind, n.read, n.data)
    volunteer_qs = qs.filter(user__role='VOLUNTEER')
    print('VOLUNTEER_NOTIFICATIONS', volunteer_qs.count())
    for n in volunteer_qs[:50]:
        print('VOLUNTEER NOTIF', n.id, n.user_id, getattr(n.user, 'role', None), n.kind, n.read, n.data)

    all_volunteer = Notification.objects.filter(user__role='VOLUNTEER').order_by('-created_at', '-id')[:50]
    print('ALL_VOLUNTEER_NOTIFICATIONS', all_volunteer.count())
    for n in all_volunteer[:20]:
        print('VOL', n.id, n.user_id, getattr(n.user, 'role', None), n.kind, n.data)
