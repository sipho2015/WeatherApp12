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

class LocationSearchResult(BaseModel):
    name: str
    country: str
    state: Optional[str] = None
    latitude: float
    longitude: float
    display_name: str

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
    wind_deg: Optional[int] = None
    clouds: int
    visibility: Optional[int] = None
    api_timestamp: int
    timestamp: Optional[datetime] = None

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
    wind_deg: Optional[int] = None
    clouds: int
    pop: float

class ForecastConfidence(BaseModel):
    label: str
    score: int
    reason: str

class DailyImpactScores(BaseModel):
    commute: int
    outdoor: int
    laundry: int
    running: int

class InsightTimelineEvent(BaseModel):
    timestamp: int
    title: str
    severity: str
    detail: str

class ForecastChangeSummary(BaseModel):
    headline: str
    temperature_delta: float
    rain_delta: float
    wind_delta: float

class WeatherInsights(BaseModel):
    briefing: str
    confidence: List[ForecastConfidence]
    impact_scores: DailyImpactScores
    timeline: List[InsightTimelineEvent]
    alerts: List[str]
    change_summary: Optional[ForecastChangeSummary] = None

class WeatherData(BaseModel):
    location: Location
    current: Optional[WeatherSnapshot] = None
    forecast: Optional[List[ForecastItem]] = None
    last_synced: Optional[datetime] = None
    insights: Optional[WeatherInsights] = None
    sync_note: Optional[str] = None

class LocationWeatherOverview(BaseModel):
    location: Location
    current: Optional[WeatherSnapshot] = None
    last_synced: Optional[datetime] = None

class SystemStatus(BaseModel):
    total_locations: int
    synced_locations: int
    failed_sync_last_24h: int
    last_success_sync: Optional[datetime] = None
    sync_interval_seconds: int
    api_configured: bool

class Preference(BaseModel):
    key: str
    value: str

class PreferenceUpdate(BaseModel):
    value: str
