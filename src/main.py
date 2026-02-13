import sys
import os
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from src.db.database import get_db, Database
from src.schemas.weather import (
    Location, LocationCreate, LocationUpdate, 
    WeatherSnapshot, ForecastItem, WeatherData,
    Preference, PreferenceUpdate, LocationSearchResult
)
from src.api.weather_client import WeatherAPIClient
from src.services.weather_service import WeatherService
import os
from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    db = get_db()
    db.initialize_schema()
    yield

app = FastAPI(title="Weather Data Integration Platform", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key check
API_KEY = os.getenv("OPENWEATHER_API_KEY")
if not API_KEY:
    print("Warning: OPENWEATHER_API_KEY not found in environment variables.")

# Dependency injection for services
def get_weather_service(db: Database = Depends(get_db)):
    client = WeatherAPIClient(api_key=API_KEY)
    return WeatherService(db, client)


@app.post("/locations", response_model=Location)
async def create_location(
    location: LocationCreate, 
    service: WeatherService = Depends(get_weather_service)
):
    try:
        return await service.add_location(location)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/locations", response_model=List[Location])
async def get_locations(service: WeatherService = Depends(get_weather_service)):
    return service.get_all_locations()

@app.get("/locations/search", response_model=List[LocationSearchResult])
async def search_locations(
    q: str = Query(..., min_length=2, description="City name search query"),
    country: Optional[str] = Query(None, description="Optional country code"),
    service: WeatherService = Depends(get_weather_service),
):
    try:
        return await service.search_locations(q, country)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/locations/{location_id}", response_model=Location)
async def get_location(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    loc = service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc

@app.patch("/locations/{location_id}", response_model=Location)
async def update_location(
    location_id: int, 
    update: LocationUpdate, 
    service: WeatherService = Depends(get_weather_service)
):
    loc = service.update_location(location_id, update)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc

@app.delete("/locations/{location_id}")
async def delete_location(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    if not service.delete_location(location_id):
        raise HTTPException(status_code=404, detail="Location not found")
    return {"status": "deleted"}

@app.post("/locations/{location_id}/sync", response_model=WeatherData)
async def sync_weather(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    try:
        current, forecast = await service.sync_weather(location_id)
        location = service.get_location(location_id)
        if not location:
            raise HTTPException(status_code=404, detail="Location record missing after sync")
            
        last_synced = service.get_last_sync_time(location_id)
        return WeatherData(
            location=location,
            current=current,
            forecast=forecast,
            last_synced=last_synced
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        print(f"Sync error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Satellite sync failed: {str(e) or type(e).__name__}")

@app.get("/locations/{location_id}/weather", response_model=WeatherData)
async def get_weather_data(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    location = service.get_location(location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    current = service.get_latest_weather(location_id)
    forecast = service.get_forecast(location_id)
    last_synced = service.get_last_sync_time(location_id)
    
    return WeatherData(
        location=location,
        current=current,
        forecast=forecast,
        last_synced=last_synced
    )

@app.get("/preferences", response_model=List[Preference])
async def get_preferences(service: WeatherService = Depends(get_weather_service)):
    return service.get_preferences()

@app.patch("/preferences/{key}", response_model=dict)
async def update_preference(
    key: str, 
    update: PreferenceUpdate, 
    service: WeatherService = Depends(get_weather_service)
):
    service.update_preference(key, update.value)
    return {"status": "updated", "key": key, "value": update.value}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
