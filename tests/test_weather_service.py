import pytest
from unittest.mock import AsyncMock, MagicMock
from src.services.weather_service import WeatherService
from src.schemas.weather import LocationCreate, Location, WeatherSnapshot
from datetime import datetime

@pytest.fixture
def mock_db():
    db = MagicMock()
    # Mock row factory behavior
    db.execute.return_value.fetchone.return_value = {
        "id": 1,
        "name": "London",
        "country": "GB",
        "latitude": 51.5074,
        "longitude": -0.1278,
        "display_name": "London",
        "is_favorite": False,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }
    return db

@pytest.fixture
def mock_api_client():
    client = AsyncMock()
    client.get_location_coords.return_value = [{
        "name": "London",
        "lat": 51.5074,
        "lon": -0.1278,
        "country": "GB"
    }]
    client.get_current_weather.return_value = WeatherSnapshot(
        temperature=15.0,
        feels_like=14.0,
        temp_min=13.0,
        temp_max=17.0,
        pressure=1012,
        humidity=70,
        weather_main="Clouds",
        weather_description="broken clouds",
        weather_icon="04d",
        wind_speed=5.0,
        clouds=75,
        api_timestamp=1618317040
    )
    client.get_forecast.return_value = []
    return client

@pytest.mark.asyncio
async def test_add_location(mock_db, mock_api_client):
    service = WeatherService(mock_db, mock_api_client)
    location_data = LocationCreate(name="London")
    
    location = await service.add_location(location_data)
    
    assert location.name == "London"
    assert location.id == 1
    mock_api_client.get_location_coords.assert_called_once_with("London", None)
    assert mock_db.execute.called

@pytest.mark.asyncio
async def test_sync_weather(mock_db, mock_api_client):
    # Setup service
    service = WeatherService(mock_db, mock_api_client)
    
    # Mock get_location to return a valid location
    service.get_location = MagicMock(return_value=Location(
        id=1, name="London", country="GB", latitude=51.5074, longitude=-0.1278,
        display_name="London", is_favorite=False, 
        created_at=datetime.now(), updated_at=datetime.now()
    ))
    
    current, forecast = await service.sync_weather(1)
    
    assert current.temperature == 15.0
    assert len(forecast) == 0
    assert mock_db.commit.called
