from django.shortcuts import render

from django.contrib.auth import authenticate
# Create your views here.
from rest_framework import generics

from .models import (
    User, 
    ResidentProfile, 
    EmergencyContact
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
)

from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action

from rest_framework_simplejwt.tokens import RefreshToken

from rest_framework.views import APIView
from rest_framework.response import Response

from rest_framework.permissions import IsAuthenticated, AllowAny

from .permissions import (
    IsResident,
    IsAdminOrSecurity,
    IsResidentAdminOrSecurity,
    )

from rest_framework import viewsets
from rest_framework.filters import SearchFilter
from django_filters.rest_framework import DjangoFilterBackend


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


