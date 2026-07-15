from django.urls import path
from .views import CreateSOSView, SOSAlertManagementView, SOSCategoriesView, SOSMessageView

urlpatterns = [
    path("categories/", SOSCategoriesView.as_view()),
    path("trigger/", CreateSOSView.as_view()),
    path("alerts/", SOSAlertManagementView.as_view()),
    path("alerts/<int:pk>/", SOSAlertManagementView.as_view()),
    path("<int:pk>/", SOSAlertManagementView.as_view()),
    path("<int:pk>/message/", SOSMessageView.as_view()),
    path("<int:pk>/messages/", SOSMessageView.as_view()),
]