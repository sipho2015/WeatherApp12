import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timedelta

from src.services.weather_service import WeatherService
from src.schemas.weather import Location, WeatherSnapshot, ForecastItem


def build_location() -> Location:
    return Location(
        id=1,
        name="London",
        country="GB",
        latitude=51.5074,
        longitude=-0.1278,
        display_name="London",
        is_favorite=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def build_snapshot(temp: float, main: str = "Clouds") -> WeatherSnapshot:
    return WeatherSnapshot(
        temperature=temp,
        feels_like=temp - 1,
        temp_min=temp - 2,
        temp_max=temp + 2,
        pressure=1012,
        humidity=70,
        weather_main=main,
        weather_description=f"{main.lower()} conditions",
        weather_icon="01d",
        wind_speed=3.0,
        clouds=30,
        api_timestamp=1710000000,
    )


def build_forecast_item() -> ForecastItem:
    return ForecastItem(
        forecast_timestamp=1710003600,
        temperature=16.0,
        feels_like=15.0,
        temp_min=14.0,
        temp_max=18.0,
        pressure=1010,
        humidity=65,
        weather_main="Clouds",
        weather_description="broken clouds",
        weather_icon="04d",
        wind_speed=4.2,
        wind_deg=120,
        clouds=68,
        pop=0.2,
    )


@pytest.mark.asyncio
async def test_sync_weather_uses_cache_when_fresh():
    db = MagicMock()
    api_client = AsyncMock()
    service = WeatherService(db, api_client)

    cached_current = build_snapshot(18.0)
    cached_forecast = [build_forecast_item()]

    service.get_location = MagicMock(return_value=build_location())
    service.get_last_sync_time = MagicMock(return_value=datetime.utcnow())
    service._sync_cache_age_seconds = MagicMock(return_value=600)
    service.get_latest_weather = MagicMock(return_value=cached_current)
    service.get_forecast = MagicMock(return_value=cached_forecast)
    service._get_preference_value = MagicMock(return_value="metric")

    current, forecast, sync_note = await service.sync_weather(1, force=False)

    assert current.temperature == 18.0
    assert len(forecast) == 1
    assert "cached" in (sync_note or "").lower()
    api_client.get_current_weather.assert_not_called()
    api_client.get_forecast.assert_not_called()


@pytest.mark.asyncio
async def test_sync_weather_detects_significant_conflict():
    db = MagicMock()
    api_client = AsyncMock()
    service = WeatherService(db, api_client)

    service.get_location = MagicMock(return_value=build_location())
    service.get_last_sync_time = MagicMock(return_value=datetime.utcnow() - timedelta(hours=3))
    service._sync_cache_age_seconds = MagicMock(return_value=60)
    service._get_preference_value = MagicMock(return_value="metric")
    service.get_latest_weather = MagicMock(return_value=build_snapshot(5.0, "Clear"))
    api_client.get_current_weather.return_value = build_snapshot(18.0, "Thunderstorm")
    api_client.get_forecast.return_value = [build_forecast_item()]

    _, _, sync_note = await service.sync_weather(1, force=True)

    assert sync_note is not None
    assert "source of truth" in sync_note


def test_locations_overview_contains_current_and_last_synced():
    db = MagicMock()
    api_client = AsyncMock()
    service = WeatherService(db, api_client)
    location = build_location()
    now = datetime.utcnow()

    service.get_all_locations = MagicMock(return_value=[location])
    service.get_latest_weather = MagicMock(return_value=build_snapshot(22.0))
    service.get_last_sync_time = MagicMock(return_value=now)

    rows = service.get_locations_overview()

    assert len(rows) == 1
    assert rows[0].location.id == 1
    assert rows[0].current is not None
    assert rows[0].last_synced == now
