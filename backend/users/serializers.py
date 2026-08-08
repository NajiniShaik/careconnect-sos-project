from rest_framework import serializers
from django.utils import timezone
from .models import (
    User,
    ResidentProfile,
    GuardianProfile,
    VolunteerProfile,
    SecurityProfile,
    EmergencyContact,
)
from society.models import Society, Block, Flat

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "phone", "role")

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "role", "phone")

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            role=validated_data.get("role", "RESIDENT"),
            phone=validated_data.get("phone", "")
        )
        return user  

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)



class ResidentRegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = serializers.CharField()
    role = serializers.CharField(required=False, write_only=True)

    society = serializers.PrimaryKeyRelatedField(
        queryset=Society.objects.all()
    )
    
    block = serializers.PrimaryKeyRelatedField(
        queryset=Block.objects.all()
    )
    
    flat= serializers.PrimaryKeyRelatedField(
        queryset=Flat.objects.all()
    )

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )
        return value

    def validate_phone(self, value):
        if len(value) != 10 or not value.isdigit():
            raise serializers.ValidationError(
                "Phone number must contain exactly 10 digits."
            )
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data["phone"],
            role=User.Role.RESIDENT,
        )

        ResidentProfile.objects.create(
            user=user,
            society=validated_data["society"],
            block=validated_data["block"],
            flat=validated_data["flat"],
        )

        return user   


class ResidentProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)

    society_name = serializers.CharField(source="society.name", read_only=True)
    block_name = serializers.CharField(source="block.name", read_only=True)
    flat_number = serializers.CharField(source="flat.flat_number", read_only=True)

    class Meta:
        model = ResidentProfile
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "society",
            "society_name",
            "block",
            "block_name",
            "flat",
            "flat_number",
            "approval_status",
        )
       

class GuardianRegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = serializers.CharField()
    role = serializers.CharField(required=False, write_only=True)

    resident_name = serializers.CharField()
    relationship = serializers.CharField()

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )
        return value

    def validate_phone(self, value):
        if len(value) != 10 or not value.isdigit():
            raise serializers.ValidationError(
                "Phone number must contain exactly 10 digits."
            )
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data["phone"],
            role=User.Role.GUARDIAN,
        )

        GuardianProfile.objects.create(
            user=user,
            resident_name=validated_data["resident_name"],
            relationship=validated_data["relationship"],
        )

        return user
    
class VolunteerRegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = serializers.CharField()
    role = serializers.CharField(required=False, write_only=True)

    society = serializers.PrimaryKeyRelatedField(
        queryset=Society.objects.all()
    )
    skills = serializers.CharField()
    availability = serializers.CharField()

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        if len(value) != 10 or not value.isdigit():
            raise serializers.ValidationError("Phone number must contain exactly 10 digits.")
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data["phone"],
            role=User.Role.VOLUNTEER,
        )

        VolunteerProfile.objects.create(
            user=user,
            society=validated_data["society"],
            skills=validated_data["skills"],
            availability=validated_data["availability"],
        )

        return user

class SecurityRegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = serializers.CharField()
    role = serializers.CharField(required=False, write_only=True)

    society = serializers.PrimaryKeyRelatedField(
        queryset=Society.objects.all()
    )
    employee_id = serializers.CharField()
    shift = serializers.CharField()

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        if len(value) != 10 or not value.isdigit():
            raise serializers.ValidationError("Phone number must contain exactly 10 digits.")
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data["phone"],
            role=User.Role.SECURITY,
        )

        SecurityProfile.objects.create(
            user=user,
            society=validated_data["society"],
            employee_id=validated_data["employee_id"],
            shift=validated_data["shift"],
        )

        return user

class VolunteerAvailabilitySerializer(serializers.Serializer):
    is_available = serializers.BooleanField(required=False)
    last_known_latitude = serializers.FloatField(required=False, allow_null=True)
    last_known_longitude = serializers.FloatField(required=False, allow_null=True)
    availability_updated_at = serializers.DateTimeField(read_only=True)

    def validate_last_known_latitude(self, value):
        if value is None:
            return value
        if not -90 <= value <= 90:
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_last_known_longitude(self, value):
        if value is None:
            return value
        if not -180 <= value <= 180:
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def validate(self, attrs):
        lat_present = "last_known_latitude" in attrs
        lon_present = "last_known_longitude" in attrs
        if lat_present != lon_present:
            raise serializers.ValidationError("Both latitude and longitude must be provided together.")
        return attrs

    def to_representation(self, instance):
        return {
            "is_available": getattr(instance, "is_available", False),
            "last_known_latitude": getattr(instance, "last_known_latitude", None),
            "last_known_longitude": getattr(instance, "last_known_longitude", None),
            "availability_updated_at": getattr(instance, "availability_updated_at", None),
        }

    def update(self, instance, validated_data):
        update_fields = []

        if hasattr(instance, "is_available"):
            instance.is_available = validated_data.get("is_available", getattr(instance, "is_available", False))
            update_fields.append("is_available")

        if "last_known_latitude" in validated_data and hasattr(instance, "last_known_latitude"):
            instance.last_known_latitude = validated_data["last_known_latitude"]
            update_fields.append("last_known_latitude")

        if "last_known_longitude" in validated_data and hasattr(instance, "last_known_longitude"):
            instance.last_known_longitude = validated_data["last_known_longitude"]
            update_fields.append("last_known_longitude")

        if hasattr(instance, "availability_updated_at"):
            instance.availability_updated_at = timezone.now()
            update_fields.append("availability_updated_at")

        instance.save(update_fields=update_fields)
        return instance


class EmergencyContactSerializer(serializers.ModelSerializer):
    
    resident = serializers.PrimaryKeyRelatedField(
        queryset=ResidentProfile.objects.all(),
        required=False,
    )

    resident_name = serializers.CharField(
        source="resident.user.username",
        read_only=True,
    )

    class Meta:
        model = EmergencyContact
        fields = (
            "id",
            "resident",
            "resident_name",
            "name",
            "phone",
            "relationship",
            "contact_type",
            "is_verified",
        )


class ContactDirectorySerializer(serializers.ModelSerializer):
    role = serializers.CharField(read_only=True)
    society = serializers.SerializerMethodField(read_only=True)
    society_name = serializers.SerializerMethodField(read_only=True)
    block_name = serializers.SerializerMethodField(read_only=True)
    flat_number = serializers.SerializerMethodField(read_only=True)
    phone = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "role",
            "society",
            "society_name",
            "block_name",
            "flat_number",
        )

    def get_society(self, obj):
        try:
            if getattr(obj, "resident_profile", None) and getattr(obj.resident_profile, "society", None):
                return obj.resident_profile.society.id
            if getattr(obj, "volunteer_profile", None) and getattr(obj.volunteer_profile, "society", None):
                return obj.volunteer_profile.society.id
            if getattr(obj, "security_profile", None) and getattr(obj.security_profile, "society", None):
                return obj.security_profile.society.id
        except Exception:
            return None
        return None

    def get_society_name(self, obj):
        try:
            if getattr(obj, "resident_profile", None) and getattr(obj.resident_profile, "society", None):
                return obj.resident_profile.society.name
            if getattr(obj, "volunteer_profile", None) and getattr(obj.volunteer_profile, "society", None):
                return obj.volunteer_profile.society.name
            if getattr(obj, "security_profile", None) and getattr(obj.security_profile, "society", None):
                return obj.security_profile.society.name
        except Exception:
            return None
        return None

    def get_block_name(self, obj):
        try:
            if getattr(obj, "resident_profile", None) and getattr(obj.resident_profile, "block", None):
                return obj.resident_profile.block.name
        except Exception:
            return None
        return None

    def get_flat_number(self, obj):
        try:
            if getattr(obj, "resident_profile", None) and getattr(obj.resident_profile, "flat", None):
                return obj.resident_profile.flat.flat_number
        except Exception:
            return None
        return None

    def get_phone(self, obj):
        request = self.context.get("request") if self.context else None
        # Default: mask phone unless caller has sufficient privileges or is the same user
        raw_phone = getattr(obj, "phone", None)
        if not raw_phone:
            return None
        try:
            if request and getattr(request.user, "is_authenticated", False):
                caller_role = str(getattr(request.user, "role", "") or "").upper()
                if request.user.id == obj.id:
                    return raw_phone
                if caller_role in ["ADMIN", "SECURITY", "VOLUNTEER"]:
                    return raw_phone
                # Guardians can see phone for linked resident
                if caller_role == "GUARDIAN":
                    # perform a lightweight check by comparing resident names
                    guardian_profile = getattr(request.user, "guardian_profile", None)
                    resident_username = getattr(obj, "username", "")
                    if guardian_profile and getattr(guardian_profile, "resident_name", ""):
                        if str(guardian_profile.resident_name).strip().lower() == str(resident_username).strip().lower():
                            return raw_phone
        except Exception:
            return None
        # otherwise mask
        if len(str(raw_phone)) >= 4:
            return "****" + str(raw_phone)[-4:]
        return None

