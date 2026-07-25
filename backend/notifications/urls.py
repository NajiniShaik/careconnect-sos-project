from django.urls import path
from .views import RegisterDeviceView, NotificationListView, MarkAllNotificationsReadView, MarkNotificationReadView, NotificationDetailView

app_name = "notifications"

urlpatterns = [
    path("register-device/", RegisterDeviceView.as_view(), name="register-device"),
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/<int:pk>/read/", MarkNotificationReadView.as_view(), name="notification-read"),
    path("notifications/<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
    path("mark-all-read/", MarkAllNotificationsReadView.as_view(), name="mark-all-read"),
]
