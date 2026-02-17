import httpx
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List
from src.schemas.weather import WeatherSnapshot, ForecastItem, LocationBase

class WeatherAPIError(Exception):
    """Raised when OpenWeatherMap requests fail."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class WeatherAPIClient:
    """Client for OpenWeatherMap API."""
    
    BASE_URL = "https://api.openweathermap.org/data/2.5"
    ONE_CALL_URL = "https://api.openweathermap.org/data/3.0"
    GEO_URL = "https://api.openweathermap.org/geo/1.0"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENWEATHER_API_KEY")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            # Increased timeout to 30s to handle slower satellite links
            # trust_env=False prevents system proxy interference 
            self._client = httpx.AsyncClient(timeout=30.0, trust_env=False)
        return self._client

    def set_client(self, client: httpx.AsyncClient):
        self._client = client

    async def _request_json(self, url: str, params: Dict[str, Any]) -> Any:
        if not self.api_key:
            raise WeatherAPIError("OpenWeatherMap API key is missing")
        try:
            response = await self.client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response else None
            message = f"Weather API request failed ({status})"
            try:
                payload = exc.response.json()
                if isinstance(payload, dict) and payload.get("message"):
                    message = f"{message}: {payload['message']}"
            except Exception:
                pass
            raise WeatherAPIError(message, status_code=status) from exc
        except httpx.RequestError as exc:
            raise WeatherAPIError(f"Weather API network error: {exc}") from exc

    async def get_location_coords(self, city: str, country: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch coordinates for a city name."""
        query = city
        if country:
            query += f",{country}"
        
        params = {
            "q": query,
            "limit": 5,
            "appid": self.api_key
        }
        
        data = await self._request_json(f"{self.GEO_URL}/direct", params=params)
        return data if isinstance(data, list) else []

    async def get_current_weather(self, lat: float, lon: float, units: str = "metric") -> WeatherSnapshot:
        """Fetch current weather for given coordinates."""
        params = {
            "lat": lat,
            "lon": lon,
            "units": units,
            "appid": self.api_key
        }
        
        data = await self._request_json(f"{self.BASE_URL}/weather", params=params)
        
        return WeatherSnapshot(
            temperature=data["main"]["temp"],
            feels_like=data["main"]["feels_like"],
            temp_min=data["main"]["temp_min"],
            temp_max=data["main"]["temp_max"],
            pressure=data["main"]["pressure"],
            humidity=data["main"]["humidity"],
            weather_main=data["weather"][0]["main"],
            weather_description=data["weather"][0]["description"],
            weather_icon=data["weather"][0]["icon"],
            wind_speed=data["wind"]["speed"],
            wind_deg=data["wind"].get("deg"),
            clouds=data["clouds"]["all"],
            visibility=data.get("visibility"),
            api_timestamp=data["dt"]
        )

    async def get_forecast(self, lat: float, lon: float, units: str = "metric") -> List[ForecastItem]:
        """Fetch 5-day forecast for given coordinates."""
        params = {
            "lat": lat,
            "lon": lon,
            "units": units,
            "appid": self.api_key
        }
        
        data = await self._request_json(f"{self.BASE_URL}/forecast", params=params)
        
        forecast_items = []
        for item in data["list"]:
            forecast_items.append(ForecastItem(
                forecast_timestamp=item["dt"],
                temperature=item["main"]["temp"],
                feels_like=item["main"]["feels_like"],
                temp_min=item["main"]["temp_min"],
                temp_max=item["main"]["temp_max"],
                pressure=item["main"]["pressure"],
                humidity=item["main"]["humidity"],
                weather_main=item["weather"][0]["main"],
                weather_description=item["weather"][0]["description"],
                weather_icon=item["weather"][0]["icon"],
                wind_speed=item["wind"]["speed"],
                wind_deg=item["wind"].get("deg"),
                clouds=item["clouds"]["all"],
                pop=item.get("pop", 0.0)
            ))
        
        return forecast_items

    async def get_historical_weather(self, lat: float, lon: float, days: int = 5, units: str = "metric") -> List[WeatherSnapshot]:
        """Fetch point-in-time historical weather snapshots for previous days."""
        rows: List[WeatherSnapshot] = []
        now_utc = datetime.now(timezone.utc)
        for day_offset in range(1, days + 1):
            target = (now_utc - timedelta(days=day_offset)).replace(hour=12, minute=0, second=0, microsecond=0)
            params = {
                "lat": lat,
                "lon": lon,
                "dt": int(target.timestamp()),
                "units": units,
                "appid": self.api_key,
            }
            data = await self._request_json(f"{self.ONE_CALL_URL}/onecall/timemachine", params=params)

            point = None
            if isinstance(data, dict) and isinstance(data.get("data"), list) and data["data"]:
                # pick record nearest to 12:00 UTC
                point = min(data["data"], key=lambda item: abs(int(item.get("dt", params["dt"])) - params["dt"]))
            elif isinstance(data, dict) and isinstance(data.get("current"), dict):
                point = data["current"]

            if not point:
                continue

            weather = point.get("weather", [{}])[0] if isinstance(point.get("weather"), list) else {}
            temp = float(point.get("temp", 0.0))
            rows.append(
                WeatherSnapshot(
                    temperature=temp,
                    feels_like=float(point.get("feels_like", temp)),
                    temp_min=float(point.get("temp_min", temp)),
                    temp_max=float(point.get("temp_max", temp)),
                    pressure=int(point.get("pressure", 0)),
                    humidity=int(point.get("humidity", 0)),
                    weather_main=str(weather.get("main", "Unknown")),
                    weather_description=str(weather.get("description", "unknown")),
                    weather_icon=str(weather.get("icon", "01d")),
                    wind_speed=float(point.get("wind_speed", 0.0)),
                    wind_deg=point.get("wind_deg"),
                    clouds=int(point.get("clouds", 0)),
                    visibility=point.get("visibility"),
                    api_timestamp=int(point.get("dt", params["dt"])),
                    timestamp=datetime.fromtimestamp(int(point.get("dt", params["dt"])), tz=timezone.utc).replace(tzinfo=None),
                )
            )

        rows.sort(key=lambda item: item.api_timestamp, reverse=True)
        return rows

    async def close(self):
        await self.client.aclose()
