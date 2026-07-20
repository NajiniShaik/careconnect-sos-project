from django.urls import path
from .views import RegisterDeviceView

app_name = "notifications"

urlpatterns = [
    path("register-device/", RegisterDeviceView.as_view(), name="register-device"),
]
