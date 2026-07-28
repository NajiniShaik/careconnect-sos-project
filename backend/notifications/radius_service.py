import math
from typing import Optional, Tuple


class IncidentVisibilityRadiusService:
    def __init__(self, default_radius_meters=1000):
        self.default_radius_meters = default_radius_meters

    def _validate_coordinates(self, latitude, longitude):
        if latitude is None or longitude is None:
            return False
        if not (-90 <= latitude <= 90):
            return False
        if not (-180 <= longitude <= 180):
            return False
        return True

    def get_effective_radius(self, radius_meters):
        if radius_meters is None:
            return self.default_radius_meters
        return radius_meters

    def calculate_distance_meters(self, incident_latitude, incident_longitude, user_latitude, user_longitude):
        if not self._validate_coordinates(incident_latitude, incident_longitude):
            return None
        if not self._validate_coordinates(user_latitude, user_longitude):
            return None

        radius_of_earth = 6371000.0
        incident_lat = math.radians(incident_latitude)
        user_lat = math.radians(user_latitude)
        delta_lat = math.radians(user_latitude - incident_latitude)
        delta_lon = math.radians(user_longitude - incident_longitude)

        a = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(incident_lat) * math.cos(user_lat) * math.sin(delta_lon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius_of_earth * c

    def evaluate_candidate(self, incident_latitude, incident_longitude, user_latitude, user_longitude, radius_meters):
        effective_radius = self.get_effective_radius(radius_meters)
        if not self._validate_coordinates(incident_latitude, incident_longitude):
            return False, None, effective_radius, False
        if not self._validate_coordinates(user_latitude, user_longitude):
            return False, None, effective_radius, False

        distance = self.calculate_distance_meters(incident_latitude, incident_longitude, user_latitude, user_longitude)
        if distance is None:
            return False, None, effective_radius, False

        inside = distance <= effective_radius
        return inside, distance, effective_radius, True
