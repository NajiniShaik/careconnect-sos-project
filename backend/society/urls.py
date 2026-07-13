from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    SocietyViewSet,
    BlockViewSet,
    FlatViewSet,
)

router = DefaultRouter()

router.register("societies", SocietyViewSet)
router.register("blocks", BlockViewSet)
router.register("flats", FlatViewSet)

urlpatterns = [
    path("", include(router.urls)),
]