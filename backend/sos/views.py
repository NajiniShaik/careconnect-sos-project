from django.shortcuts import render 
from .serializers import SOSSerializer

# Create your views here.
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import SOS
from users.permissions import IsResident

class CreateSOSView(APIView):
    permission_classes = [IsAuthenticated & IsResident]

    def post(self, request):
        message = request.data.get("message", "")
        location = request.data.get("location", "")

        sos = SOS.objects.create(
            user=request.user,
            message=message,
            location=location,
            status="OPEN"
        )

        return Response({
            "id": sos.id,
            "status": sos.status,
            "message": "SOS triggered successfully"
        })
    
    def get(self, request):
        sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")

        serializer = SOSSerializer(sos_list, many=True)

        return Response(serializer.data)