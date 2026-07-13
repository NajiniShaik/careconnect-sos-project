from django.shortcuts import render

# Create your views here.
from django.db.models import Q
from rest_framework import viewsets
from .models import Society
from .serializers import SocietySerializer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter

from .models import Society, Block, Flat
from .serializers import (
    SocietySerializer,
    BlockSerializer,
    FlatSerializer,
)


class SocietyViewSet(viewsets.ModelViewSet):
    queryset = Society.objects.all()   # <-- Keep this
    serializer_class = SocietySerializer

    def get_queryset(self):
        queryset = Society.objects.all()

        search = self.request.query_params.get("search")
        filter_by = self.request.query_params.get("filter")

        if search and filter_by:
            if filter_by == "name":
                queryset = queryset.filter(name__icontains=search)

            elif filter_by == "city":
                queryset = queryset.filter(city__icontains=search)

            elif filter_by == "address":
                queryset = queryset.filter(address__icontains=search)

            elif filter_by == "state":
                queryset = queryset.filter(state__icontains=search)

        return queryset
    
class BlockViewSet(viewsets.ModelViewSet):
    queryset = Block.objects.all()
    serializer_class = BlockSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["society"]
    search_fields = ["name"]


class FlatViewSet(viewsets.ModelViewSet):
    queryset = Flat.objects.all()
    serializer_class = FlatSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["block", "is_occupied"]
    search_fields = ["flat_number"]

