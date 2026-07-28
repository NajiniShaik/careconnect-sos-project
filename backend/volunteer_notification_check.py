import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.contrib.auth import get_user_model
from notifications.models import Notification

User = get_user_model()
user = User.objects.filter(role='VOLUNTEER').first()
print('VOLUNTEER_USER', user.id if user else None, getattr(user, 'username', None))
if user:
    qs = Notification.objects.filter(user=user).order_by('-created_at', '-id')
    print('USER_NOTIFICATIONS', qs.count())
    for n in qs[:50]:
        print('NOTIF', n.id, n.kind, n.read, n.data)
