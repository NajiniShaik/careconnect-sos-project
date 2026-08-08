# django.shortcuts.render not used here
from django.contrib.auth import authenticate
# Create your views here.
from rest_framework import generics

from .models import (
    User, 
    ResidentProfile, 
    EmergencyContact,
    VolunteerProfile,
    SecurityProfile,
)

from .serializers import (
    RegisterSerializer,
    UserSerializer,
    LoginSerializer,
    ResidentRegisterSerializer,
    ResidentProfileSerializer,
    GuardianRegisterSerializer,
    VolunteerRegisterSerializer,
    SecurityRegisterSerializer,
    EmergencyContactSerializer,
    VolunteerAvailabilitySerializer,
)

from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action

from rest_framework_simplejwt.tokens import RefreshToken

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny

from .permissions import (
    IsResident,
    IsAdminOrSecurity,
    IsResidentAdminOrSecurity,
    )

from rest_framework import viewsets
from rest_framework.filters import SearchFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth import get_user_model


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }, status=status.HTTP_201_CREATED) 
    
class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        try:
            user_obj = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(
            username=user_obj.username,
            password=password,
        )

        if user is None:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refresh = RefreshToken.for_user(user)

        return Response({
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        })


class ContactDirectoryPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200
    
class TestResidentAccess(APIView):
    permission_classes = [IsAuthenticated & IsResident]

    def get(self, request):
        return Response({
            "message": "You are a RESIDENT and allowed to access this route"
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")

            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(
                {"message": "Logged out successfully"},
                status=status.HTTP_205_RESET_CONTENT,
            )

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            ) 
        
class ResidentRegisterView(generics.CreateAPIView):
    serializer_class = ResidentRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "user": UserSerializer(user).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )
        
class GuardianRegisterView(generics.CreateAPIView):
    serializer_class = GuardianRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "user": UserSerializer(user).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )

class VolunteerRegisterView(generics.CreateAPIView):
    serializer_class = VolunteerRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)


class SecurityRegisterView(generics.CreateAPIView):
    serializer_class = SecurityRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)


class VerifyOTPView(APIView):
    def post(self, request):
        username = request.data.get("username")
        otp = request.data.get("otp")

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if otp == "123456":
            user.is_verified = True
            user.save()

            return Response(
                {"message": "User verified successfully"},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"error": "Invalid OTP"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class VolunteerAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request):
        profile, _ = VolunteerProfile.objects.get_or_create(user=request.user)
        return profile

    def get(self, request):
        profile = self.get_object(request)
        serializer = VolunteerAvailabilitySerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        profile = self.get_object(request)
        if request.user.role != User.Role.VOLUNTEER:
            return Response({"detail": "Only volunteers can update availability"}, status=status.HTTP_403_FORBIDDEN)

        serializer = VolunteerAvailabilitySerializer(profile, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class SecurityAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request):
        profile, _ = SecurityProfile.objects.get_or_create(user=request.user)
        return profile

    def get(self, request):
        if request.user.role != User.Role.SECURITY:
            return Response({"detail": "Only security staff can access this endpoint"}, status=status.HTTP_403_FORBIDDEN)

        profile = self.get_object(request)
        serializer = VolunteerAvailabilitySerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        if request.user.role != User.Role.SECURITY:
            return Response({"detail": "Only security staff can update availability"}, status=status.HTTP_403_FORBIDDEN)

        profile = self.get_object(request)
        serializer = VolunteerAvailabilitySerializer(profile, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class ResidentProfileViewSet(viewsets.ModelViewSet):
    queryset = (
        ResidentProfile.objects
        .select_related(
            "user",
            "society",
            "block",
            "flat",
        )
        .all()
    )

    serializer_class = ResidentProfileSerializer

    permission_classes = [IsAdminOrSecurity]

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
    ]

    filterset_fields = [
        "society",
        "block",
        "flat",
        "approval_status",
    ]

    search_fields = [
        "user__username",
        "user__email",
        "user__phone",
        "flat__flat_number",
        "block__name",
        "society__name",
    ]

    @action(detail=True, methods=["patch"])
    def approve(self, request, pk=None):
        resident = self.get_object()
        resident.approval_status = "APPROVED"
        resident.save()

        return Response(
            {"message": "Resident approved successfully."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["patch"])
    def reject(self, request, pk=None):
        resident = self.get_object()
        resident.approval_status = "REJECTED"
        resident.save()

        return Response(
            {"message": "Resident rejected successfully."},
            status=status.HTTP_200_OK,
        )
    

class EmergencyContactViewSet(viewsets.ModelViewSet):

    serializer_class = EmergencyContactSerializer
    
    permission_classes = [IsResidentAdminOrSecurity]

    def get_queryset(self):
        user = self.request.user
        
        queryset = EmergencyContact.objects.select_related(
            "resident",
            "resident__user",
        )
        
        if user.role in ["ADMIN", "SECURITY"]:
            return queryset
        
        if user.role == "RESIDENT":
            return queryset.filter(
                resident__user=user
            )
        
        return queryset.none()
    

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
    ]

    filterset_fields = [
        "resident",
        "contact_type",
        "is_verified",
    ]

    search_fields = [
        "name",
        "phone",
        "relationship",
        "resident__user__username",
    ]

    @action(detail=True, methods=["patch"])
    def verify_contact(self, request, pk=None):
        contact = self.get_object()
        
        contact.is_verified = True
        contact.save()
        
        return Response(
            {
                "message": "Emergency contact verified successfully."
            },
            status=status.HTTP_200_OK,
        )
    
    def perform_create(self, serializer):
        user = self.request.user
        if self.request.user.role == "RESIDENT":
            resident = ResidentProfile.objects.get(user=self.request.user)
            serializer.save(resident=resident)
        else:
            serializer.save() 


    def perform_update(self, serializer):
        user = self.request.user
        
        if user.role == "RESIDENT":
            resident = ResidentProfile.objects.get(user=user)
            
            serializer.save(
                resident=resident
            )
        else:
            serializer.save()



class ContactDirectoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Society-wide contact directory.

    - Search by username, email, phone
    - Filter by role
    - Returns only contacts the caller is permitted to see
    """
    serializer_class = None  # set in __init__
    permission_classes = [IsAuthenticated]
    pagination_class = ContactDirectoryPagination

    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["role"]
    search_fields = ["username", "email", "phone"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .serializers import ContactDirectorySerializer
        self.serializer_class = ContactDirectorySerializer
    
    def get_queryset(self):
        user = self.request.user
        User = get_user_model()

        base_qs = (
            User.objects
            .filter(role__in=["RESIDENT", "GUARDIAN", "VOLUNTEER", "SECURITY"]) 
            .select_related(
                "resident_profile__society",
                "resident_profile__block",
                "resident_profile__flat",
                "volunteer_profile__society",
                "security_profile__society",
            )
        )

        # Helper to detect society for a user from available profiles
        def _get_user_society(u):
            try:
                if getattr(u, "resident_profile", None) and getattr(u.resident_profile, "society", None):
                    return u.resident_profile.society
                if getattr(u, "volunteer_profile", None) and getattr(u.volunteer_profile, "society", None):
                    return u.volunteer_profile.society
                if getattr(u, "security_profile", None) and getattr(u.security_profile, "society", None):
                    return u.security_profile.society
            except Exception:
                return None
            return None

        # Determine caller society (if any)
        caller_society = _get_user_society(user)

        role = str(getattr(user, "role", "") or "").upper()

        try:
            # Admins: prefer society associated with their profiles; if none, return all
            if role == "ADMIN":
                if caller_society:
                    return base_qs.filter(
                        models.Q(resident_profile__society=caller_society)
                        | models.Q(volunteer_profile__society=caller_society)
                        | models.Q(security_profile__society=caller_society)
                    )
                return base_qs

            # Security or Volunteer: see contacts in their society
            if role in ["SECURITY", "VOLUNTEER"]:
                if caller_society:
                    return base_qs.filter(
                        models.Q(resident_profile__society=caller_society)
                        | models.Q(volunteer_profile__society=caller_society)
                        | models.Q(security_profile__society=caller_society)
                    )
                return base_qs.none()

            # Resident: see residents, volunteers and security in same society and guardians linked to self
            if role == "RESIDENT":
                resident_profile = getattr(user, "resident_profile", None)
                if resident_profile and resident_profile.society:
                    society = resident_profile.society
                    qs = base_qs.filter(
                        models.Q(resident_profile__society=society)
                        | models.Q(volunteer_profile__society=society)
                        | models.Q(security_profile__society=society)
                    )
                else:
                    qs = base_qs.none()

                # include linked guardians for this resident
                try:
                    from sos.views import _get_linked_guardians_for_resident
                    guardians = _get_linked_guardians_for_resident(user)
                    guardian_ids = [g.id for g in guardians if g]
                    if guardian_ids:
                        qs = qs | base_qs.filter(id__in=guardian_ids)
                except Exception:
                    pass

                return qs.distinct()

            # Guardian: show linked resident(s) plus society volunteers/security
            if role == "GUARDIAN":
                guardian_profile = getattr(user, "guardian_profile", None)
                qs = base_qs.none()
                if guardian_profile and getattr(guardian_profile, "resident_name", None):
                    name = str(guardian_profile.resident_name).strip()
                    resident_users = User.objects.filter(username__iexact=name)
                    resident_society = None
                    if resident_users.exists():
                        resident_user = resident_users.first()
                        resident_society = _get_user_society(resident_user)
                        qs = qs | base_qs.filter(id__in=[u.id for u in resident_users])

                    if resident_society:
                        qs = qs | base_qs.filter(
                            models.Q(resident_profile__society=resident_society)
                            | models.Q(volunteer_profile__society=resident_society)
                            | models.Q(security_profile__society=resident_society)
                        )

                return qs.distinct()

        except Exception:
            return base_qs.none()

        return base_qs.none()


class ContactDirectoryPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


