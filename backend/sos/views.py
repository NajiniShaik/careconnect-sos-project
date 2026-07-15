from django.shortcuts import render 
from .serializers import SOSSerializer, SOSStatusUpdateSerializer, SOSResidentUpdateSerializer, SOSMessageCreateSerializer, SOSMessageSerializer

# Create your views here.
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from .models import SOS, SOSMessage
from .utils import reverse_geocode_coordinates
from users.permissions import IsAdmin, IsResident, IsSecurity


class SOSCategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = [
            {"value": "medical", "label": "Medical", "description": "Medical assistance needed"},
            {"value": "fire", "label": "Fire", "description": "Fire or smoke emergency"},
            {"value": "security", "label": "Security", "description": "Security or intrusion concern"},
            {"value": "power", "label": "Power", "description": "Power outage or electrical issue"},
            {"value": "other", "label": "Other", "description": "Other urgent assistance"},
        ]

        return Response({"categories": categories})


class CreateSOSView(APIView):
    permission_classes = [IsAuthenticated & IsResident]

    def post(self, request):
        message = request.data.get("message", "")
        location = request.data.get("location", "")
        category = request.data.get("category") or request.data.get("category_name") or ""
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")

        latitude_value = float(latitude) if latitude not in [None, "", " "] else None
        longitude_value = float(longitude) if longitude not in [None, "", " "] else None

        geocode_payload = reverse_geocode_coordinates(latitude_value, longitude_value) or {}
        resolved_location = geocode_payload.get("location") or location or ""

        sos = SOS.objects.create(
            user=request.user,
            message=message,
            location=resolved_location if resolved_location else location,
            category=category,
            latitude=latitude_value,
            longitude=longitude_value,
            address=geocode_payload.get("address") or None,
            city=geocode_payload.get("city") or None,
            state=geocode_payload.get("state") or None,
            country=geocode_payload.get("country") or None,
            status="OPEN"
        )

        return Response({
            "id": sos.id,
            "status": sos.status,
            "message": "SOS triggered successfully",
            "category": sos.category,
            "latitude": sos.latitude,
            "longitude": sos.longitude,
            "address": sos.address,
            "city": sos.city,
            "state": sos.state,
            "country": sos.country,
            "location": sos.location,
        })
    
    def get(self, request):
        sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")

        serializer = SOSSerializer(sos_list, many=True)

        return Response(serializer.data)


class SOSMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["RESIDENT", "SECURITY", "ADMIN"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        messages = SOSMessage.objects.filter(sos=sos).order_by("created_at", "id")
        serializer = SOSMessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["RESIDENT", "SECURITY", "ADMIN"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SOSMessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        message = SOSMessage.objects.create(
            sos=sos,
            sender=request.user,
            message=serializer.validated_data["message"],
        )

        output_serializer = SOSMessageSerializer(message)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class SOSAlertManagementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == "RESIDENT":
            sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")
        elif request.user.role in ["SECURITY", "ADMIN"]:
            sos_list = SOS.objects.all().order_by("-created_at")
        else:
            sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")

        serializer = SOSSerializer(sos_list, many=True)
        return Response(serializer.data)

    def patch(self, request, pk):
        if not isinstance(request.user.role, str):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "ADMIN":
            serializer = SOSStatusUpdateSerializer(sos, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(SOSSerializer(sos).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role == "RESIDENT":
            if sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            serializer = SOSResidentUpdateSerializer(sos, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            updated_sos = serializer.save()

            latitude = request.data.get("latitude", None)
            longitude = request.data.get("longitude", None)
            latitude_value = None if latitude in [None, "", " "] else float(latitude)
            longitude_value = None if longitude in [None, "", " "] else float(longitude)

            should_refresh_geocoding = (
                ("latitude" in request.data or "longitude" in request.data)
                and (
                    latitude_value != updated_sos.latitude
                    or longitude_value != updated_sos.longitude
                )
            )

            if should_refresh_geocoding:
                geocode_payload = reverse_geocode_coordinates(latitude_value, longitude_value) or {}
                updated_sos.address = geocode_payload.get("address") or None
                updated_sos.city = geocode_payload.get("city") or None
                updated_sos.state = geocode_payload.get("state") or None
                updated_sos.country = geocode_payload.get("country") or None
                updated_sos.location = geocode_payload.get("location") or updated_sos.location or ""
                updated_sos.save(update_fields=["address", "city", "state", "country", "location"])

            return Response(SOSSerializer(updated_sos).data, status=status.HTTP_200_OK)

        return Response(status=status.HTTP_403_FORBIDDEN)

    def delete(self, request, pk):
        if not isinstance(request.user.role, str):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "ADMIN":
            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        if request.user.role == "RESIDENT":
            if sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(status=status.HTTP_403_FORBIDDEN)