from rest_framework import serializers
from .models import Society, Block, Flat


class SocietySerializer(serializers.ModelSerializer):
    class Meta:
        model = Society
        fields = "__all__"


class BlockSerializer(serializers.ModelSerializer):
    society_name = serializers.CharField(
        source="society.name",
        read_only=True
    )

    class Meta:
        model = Block
        fields = (
            "id",
            "society",
            "society_name",
            "name",
            "total_flats",
        )


class FlatSerializer(serializers.ModelSerializer):
    block_name = serializers.CharField(
        source="block.name",
        read_only=True
    )

    class Meta:
        model = Flat
        fields = (
            "id",
            "block",
            "block_name",
            "flat_number",
            "floor",
            "flat_type",
            "is_occupied",
        )
