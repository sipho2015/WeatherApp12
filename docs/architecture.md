# System Architecture - Weather Data Integration Platform

## Overview
The platform follows a classic Client-Server architecture with a clean separation of concerns and a data-driven service layer.

## Component Breakdown

### 1. Frontend (React + TypeScript)
- **UI Framework**: React 18 with functional components and hooks.
- **Styling**: Vanilla CSS using CSS Variables and Glassmorphism techniques for a premium look.
- **State Management**: Local state managed via `useState` and `useEffect` for simplicity and performance.
- **API Client**: Uses standard `fetch` with a Vite proxy to communicate with the backend.

### 2. Backend (FastAPI + Python)
- **Web Framework**: FastAPI for high-performance async processing.
- **Core Modules**:
  - `WeatherAPIClient`: Handles low-level HTTP communication with OpenWeatherMap.
  - `WeatherService`: Implements business logic, orchestrating database operations and API calls.
  - `Database`: Custom wrapper around `sqlite3` for thread-safe session management.
  - `Schemas`: Pydantic models for strict type checking and serialization.

### 3. Data Layer (SQLite)
- **Storage**: Single-file relational database for portability.
- **Schema**:
    - `locations`: Source of truth for cities.
    - `weather_snapshots`: Historical log of current weather data.
    - `forecasts`: 5-day predictive data, refreshed on sync.
    - `sync_history`: Audit trail for synchronization events.

## Key Workflows

### Location Management (CRUD)
1. User enters city name on Frontend.
2. Backend receives request, calls OpenWeatherMap Geo API to resolve coordinates.
3. Valid coordinates and city metadata are stored in the database.
4. UI updates to show the new location in the sidebar.

### Data Synchronization
1. User clicks "Sync" on a specific location.
2. Backend fetches both "Current Weather" and "5-day Forecast" from OpenWeatherMap.
3. Old forecast records for that location are purged.
4. New snapshots and forecasts are inserted into the database within a transaction.
5. Sync status and timestamps are recorded in the history table.

## Security & Reliability
- **Error Handling**: Custom `HTTPException` mapping for API errors (404 for unknown cities, 429 for rate limits).
- **Environment Variables**: API keys are never hardcoded and must be provided via `.env`.
- **Foreign Keys**: Enforced via PRAGMA in SQLite to ensure data integrity during deletions.
