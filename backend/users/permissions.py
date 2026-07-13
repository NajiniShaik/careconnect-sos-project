from rest_framework.permissions import BasePermission


class IsResident(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "RESIDENT"
        )


class IsSecurity(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "SECURITY"
        )


class IsVolunteer(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "VOLUNTEER"
        )


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "ADMIN"
        )

class IsAdminOrSecurity(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role in [
                "ADMIN",
                "SECURITY",
            ]
        )


class IsResidentAdminOrSecurity(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role in [
                "RESIDENT",
                "ADMIN",
                "SECURITY",
            ]
        )