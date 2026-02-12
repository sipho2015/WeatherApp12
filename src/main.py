from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from src.db.database import get_db, Database
from src.schemas.weather import (
    Location, LocationCreate, LocationUpdate, 
    WeatherSnapshot, ForecastItem, WeatherData
)
from src.api.weather_client import WeatherAPIClient
from src.services.weather_service import WeatherService
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Weather Data Integration Platform")

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

@app.on_event("startup")
async def startup():
    db = get_db()
    db.initialize_schema()

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
        raise HTTPException(status_code=500, detail=str(e))

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
