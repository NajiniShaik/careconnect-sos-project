from django.urls import path,include
from rest_framework.routers import DefaultRouter

from .views import (
    RegisterView, 
    LoginView,
    LogoutView,
    ResidentRegisterView,
    ResidentProfileViewSet,
    TestResidentAccess,
    GuardianRegisterView,
    VolunteerRegisterView,
    SecurityRegisterView,
    VerifyOTPView,
    EmergencyContactViewSet,
    )

router = DefaultRouter()

router.register(
    "resident-profiles",
    ResidentProfileViewSet,
    basename="resident-profile",
)

router.register(
    "emergency-contacts",
    EmergencyContactViewSet,
    basename="emergency-contact",
)


urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("test-resident/", TestResidentAccess.as_view()),
    path("register/resident/", ResidentRegisterView.as_view()),
    path("register/guardian/",GuardianRegisterView.as_view()),
    path("register/volunteer/", VolunteerRegisterView.as_view()),
    path("register/security/", SecurityRegisterView.as_view()),
    path("verify/", VerifyOTPView.as_view()),
    
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view(), name="logout"),

    path("", include(router.urls)),
]


