import os, django, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from sos.models import SOS
from sos.views import _is_sos_visible_to_volunteer
from notifications.community_broadcast import CommunityBroadcastService
from notifications.models import Notification
User = get_user_model()

emails = ['shaiknajini41@gmail.com','volunteer@gmail.com','volunteer1@gmail.com']
users = {e: User.objects.filter(email=e).first() for e in emails}
print('FOUND_USERS:', {e: (u.id if u else None) for e,u in users.items()})

sos = SOS.objects.order_by('-created_at').first()
if not sos:
    print('NO_SOS_FOUND')
    raise SystemExit(0)
print('\nUSING SOS id=', sos.id, 'user_id=', getattr(sos.user,'id', None), 'created_at=', getattr(sos,'created_at', None))

service = CommunityBroadcastService()
recipients = service.get_recipients(sos, include_residents=False)
recipient_ids = [getattr(r,'id',None) for r in recipients]
print('CommunityBroadcastService recipients ids:', recipient_ids)

# Show queryset used by service
UserModel = User
society = None
try:
    profile = getattr(sos.user, 'resident_profile', None)
    if profile is not None and getattr(profile,'society',None) is not None:
        society = profile.society
except Exception:
    society = None

queryset = UserModel.objects.filter(role__in=['VOLUNTEER','SECURITY'], is_active=True)
if society is not None:
    try:
        from django.db.models import Q
        queryset = queryset.filter(
            Q(role='RESIDENT', resident_profile__society=society)
            | Q(role='VOLUNTEER', volunteer_profile__society=society)
            | Q(role='VOLUNTEER', resident_profile__society=society)
            | Q(role='SECURITY', security_profile__society=society)
            | Q(role='SECURITY', resident_profile__society=society)
        )
    except Exception:
        queryset = queryset.filter(pk__in=[])

ordered_ids = list(queryset.order_by('id').values_list('id', flat=True))
print('Queryset ordered ids (role in VOLUNTEER,SECURITY & society filter):', ordered_ids)

# Simulate by_role behavior
by_role = {}
from notifications.community_broadcast import CommunityBroadcastService as CBS
svc = CBS()
for user in queryset.order_by('id'):
    if not svc._is_active_user(user):
        continue
    if not svc._has_notifications_enabled(user):
        continue
    if getattr(sos.user,'id',None) is not None and getattr(user,'id',None)==getattr(sos.user,'id',None):
        continue
    role = str(getattr(user,'role','') or '').upper()
    if role in {'VOLUNTEER','SECURITY'} and not svc._is_user_available_for_role(user):
        continue
    if role in {'VOLUNTEER','SECURITY'}:
        inside = svc._matches_radius(sos, user, radius_meters=None)
        if not inside:
            continue
    if role not in by_role:
        by_role[role] = user

print('Simulated by_role keys:', {k: getattr(v,'id',None) for k,v in by_role.items()})

results = {}
for email,u in users.items():
    if not u:
        results[email] = {'exists': False}
        continue
    vp = None
    try:
        vp = u.volunteer_profile
    except Exception:
        vp = None
    rp = None
    try:
        rp = u.resident_profile
    except Exception:
        rp = None
    notif_count = Notification.objects.filter(user=u, kind='SOS', data__alert_id=str(sos.id)).count()
    notif_alt = Notification.objects.filter(user=u, kind='SOS', data__alertId=str(sos.id)).count() + Notification.objects.filter(user=u, kind='SOS', data__alertid=str(sos.id)).count()
    is_visible = _is_sos_visible_to_volunteer(sos, u)
    visible_sos_ids = [s.id for s in SOS.objects.all().order_by('-created_at') if _is_sos_visible_to_volunteer(s, u)]
    in_qs = sos.id in visible_sos_ids
    in_recipients = getattr(u,'id',None) in recipient_ids
    results[email] = {
        'user_id': u.id,
        'volunteer_profile_id': getattr(vp,'id',None),
        'society_id': getattr(getattr(vp,'society',None),'id',None) if vp else None,
        'availability_field': getattr(vp,'availability',None) if vp else None,
        'is_available': getattr(vp,'is_available',None) if vp else None,
        'approval_status': getattr(getattr(rp,'approval_status',None),'upper',lambda: 'N/A')() if rp else 'N/A',
        'notification_count_alert_id': notif_count,
        'notification_count_alt_keys': notif_alt,
        '_is_sos_visible_to_volunteer': bool(is_visible),
        'in_SOSAlertManagementView_queryset': bool(in_qs),
        'in_CommunityBroadcastService_recipients': bool(in_recipients),
    }

for email, data in results.items():
    print('\n---', email, '---')
    for k,v in data.items():
        print(k+':', v)

print('\n--- Divergence analysis ---')
keys = list(results.keys())
for k in ['_is_sos_visible_to_volunteer','in_SOSAlertManagementView_queryset','in_CommunityBroadcastService_recipients']:
    vals = {email: results[email].get(k) for email in keys}
    print(k, vals)

if not all(results[email]['in_CommunityBroadcastService_recipients']==results[keys[0]]['in_CommunityBroadcastService_recipients'] for email in keys):
    print('\nCommunityBroadcastService selection detail:')
    print(' - it iterates queryset.order_by("id") and stores first per role into by_role dict (keeps first user per role).')
    print(' - simulated by_role mapping:', {k: getattr(v,'id',None) for k,v in by_role.items()})

print('\nNotification counts for SOS id', sos.id)
for u in User.objects.filter(role='VOLUNTEER')[:50]:
    c = Notification.objects.filter(user=u, kind='SOS', data__alert_id=str(sos.id)).count()
    if c>0:
        print(' volunteer', u.id, 'has', c, 'notifications')
