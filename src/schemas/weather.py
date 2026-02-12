from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class LocationBase(BaseModel):
    name: str
    country: str
    latitude: float
    longitude: float

class LocationCreate(BaseModel):
    name: str
    country: Optional[str] = None

class LocationUpdate(BaseModel):
    display_name: Optional[str] = None
    is_favorite: Optional[bool] = None

class Location(LocationBase):
    id: int
    display_name: Optional[str]
    is_favorite: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class WeatherSnapshot(BaseModel):
    temperature: float
    feels_like: float
    temp_min: float
    temp_max: float
    pressure: int
    humidity: int
    weather_main: str
    weather_description: str
    weather_icon: str
    wind_speed: float
    wind_deg: Optional[int]
    clouds: int
    visibility: Optional[int]
    api_timestamp: int
    timestamp: Optional[datetime]

class ForecastItem(BaseModel):
    forecast_timestamp: int
    temperature: float
    feels_like: float
    temp_min: float
    temp_max: float
    pressure: int
    humidity: int
    weather_main: str
    weather_description: str
    weather_icon: str
    wind_speed: float
    wind_deg: Optional[int]
    clouds: int
    pop: float

class WeatherData(BaseModel):
    location: Location
    current: Optional[WeatherSnapshot]
    forecast: Optional[List[ForecastItem]]
    last_synced: Optional[datetime]

class UserPreference(BaseModel):
    key: str
    value: str
