import json
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def reverse_geocode_coordinates(latitude, longitude):
    if latitude is None or longitude is None:
        return None

    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except (TypeError, ValueError):
        return None

    try:
        params = urlencode({
            "format": "jsonv2",
            "lat": latitude_value,
            "lon": longitude_value,
            "zoom": 18,
            "addressdetails": 1,
        })
        request = Request(
            f"https://nominatim.openstreetmap.org/reverse?{params}",
            headers={"User-Agent": "careconnect/1.0"},
        )
        with urlopen(request, timeout=5) as response:
            payload = json.load(response)
    except (URLError, ValueError, TimeoutError, json.JSONDecodeError):
        return None

    address_details = payload.get("address") or {}
    address_line = " ".join(
        part for part in [
            address_details.get("house_number"),
            address_details.get("road"),
            address_details.get("suburb"),
        ] if part
    )
    city = (
        address_details.get("city")
        or address_details.get("town")
        or address_details.get("village")
        or address_details.get("suburb")
        or ""
    )
    state = address_details.get("state") or address_details.get("region") or ""
    country = address_details.get("country") or ""

    formatted_address = ", ".join(part for part in [address_line, city, state, country] if part)

    return {
        "address": address_line,
        "city": city,
        "state": state,
        "country": country,
        "location": formatted_address or (payload.get("display_name") or ""),
    }
