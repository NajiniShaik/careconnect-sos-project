from django.urls import path
from .views import (
    RegisterDeviceView,
    NotificationListView,
    CommunityBroadcastView,
    MarkAllNotificationsReadView,
    MarkNotificationReadView,
    NotificationDetailView,
    EscalationConfigurationView,
    EscalationLogListView,
    EscalationLogDetailView,
    DeliveryStatusListView,
    DeliveryStatusDetailView,
)

app_name = "notifications"

urlpatterns = [
    path("register-device/", RegisterDeviceView.as_view(), name="register-device"),
    path("escalation-config/", EscalationConfigurationView.as_view(), name="escalation-config"),
    path("escalation-logs/", EscalationLogListView.as_view(), name="escalation-logs-list"),
    path("escalation-logs/<int:pk>/", EscalationLogDetailView.as_view(), name="escalation-logs-detail"),
    path("community-broadcast/", CommunityBroadcastView.as_view(), name="community-broadcast"),
    path("delivery-status/", DeliveryStatusListView.as_view(), name="delivery-status-list"),
    path("delivery-status/<int:pk>/", DeliveryStatusDetailView.as_view(), name="delivery-status-detail"),
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/<int:pk>/read/", MarkNotificationReadView.as_view(), name="notification-read"),
    path("notifications/<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
    path("mark-all-read/", MarkAllNotificationsReadView.as_view(), name="mark-all-read"),
]
