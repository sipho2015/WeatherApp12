import httpx
import os
from typing import Dict, Any, Optional, List
from src.schemas.weather import WeatherSnapshot, ForecastItem, LocationBase

class WeatherAPIClient:
    """Client for OpenWeatherMap API."""
    
    BASE_URL = "https://api.openweathermap.org/data/2.5"
    GEO_URL = "http://api.openweathermap.org/geo/1.0"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENWEATHER_API_KEY")
        if not self.api_key:
            raise ValueError("OpenWeatherMap API Key is required")
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
        
        response = await self.client.get(f"{self.GEO_URL}/direct", params=params)
        response.raise_for_status()
        return response.json()

    async def get_current_weather(self, lat: float, lon: float, units: str = "metric") -> WeatherSnapshot:
        """Fetch current weather for given coordinates."""
        params = {
            "lat": lat,
            "lon": lon,
            "units": units,
            "appid": self.api_key
        }
        
        response = await self.client.get(f"{self.BASE_URL}/weather", params=params)
        response.raise_for_status()
        data = response.json()
        
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
        
        response = await self.client.get(f"{self.BASE_URL}/forecast", params=params)
        response.raise_for_status()
        data = response.json()
        
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

    async def close(self):
        await self.client.aclose()
