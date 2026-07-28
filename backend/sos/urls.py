from django.urls import path
from .views import (
    CreateSOSView,
    SOSAlertManagementView,
    SOSCategoriesView,
    SOSMessageView,
    SOSRetryTranscriptionView,
    AudioTranscriptionView,
    SOSStatusTrackingView,
    SOSStatusListView,
    ResponseMonitoringListView,
    ResponseMonitoringDetailView,
    DashboardOverviewView,
    DashboardRecentActivityView,
)

urlpatterns = [
    path("categories/", SOSCategoriesView.as_view()),
    path("trigger/", CreateSOSView.as_view()),
    path("transcribe/", AudioTranscriptionView.as_view()),
    path("alerts/", SOSAlertManagementView.as_view()),
    path("alerts/<int:pk>/", SOSAlertManagementView.as_view()),
    path("status-list/", SOSStatusListView.as_view()),
    path("response-monitor/", ResponseMonitoringListView.as_view()),
    path("response-monitor/<int:pk>/", ResponseMonitoringDetailView.as_view()),
    path("dashboard/overview/", DashboardOverviewView.as_view()),
    path("dashboard/recent-activity/", DashboardRecentActivityView.as_view()),
    path("<int:pk>/status/", SOSStatusTrackingView.as_view()),
    path("<int:pk>/", SOSAlertManagementView.as_view()),
    path("<int:pk>/message/", SOSMessageView.as_view()),
    path("<int:pk>/messages/", SOSMessageView.as_view()),
    path("<int:pk>/transcribe/", SOSRetryTranscriptionView.as_view()),
]