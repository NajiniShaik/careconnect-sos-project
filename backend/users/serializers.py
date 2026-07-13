from rest_framework import serializers
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
            skills=validated_data["skills"],
            availability=validated_data["availability"],
        )

        return user

class SecurityRegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = serializers.CharField()

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
            employee_id=validated_data["employee_id"],
            shift=validated_data["shift"],
        )

        return user

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

