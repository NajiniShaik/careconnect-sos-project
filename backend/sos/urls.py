from django.urls import path
from .views import CreateSOSView

urlpatterns = [
    path("trigger/", CreateSOSView.as_view()),
]