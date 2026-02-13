# Weather Data Integration Platform

A modern, full-stack weather application that integrates with OpenWeatherMap API, stores data locally, and provides a sleek interface for managing favorite locations.

## Features

- **API Integration**: Fetches real-time weather and 5-day forecasts.
- **Local Persistence**: SQLite database for storing locations, historical snapshots, and preferences.
- **CRUD Operations**: Full management of tracked cities (Add, View, Update, Delete).
- **Modern UI**: Responsive React frontend with a premium aesthetic.
- **Data Sync**: On-demand synchronization with timestamps and history tracking.
- **Error Handling**: Graceful management of API limits and invalid data.

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLite
- **Frontend**: React, TypeScript, Vite, CSS Modules / Vanilla CSS
- **API**: OpenWeatherMap (Current & Forecast)

## Setup Instructions

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher
- An OpenWeatherMap API Key (Get one at [https://openweathermap.org/api](https://openweathermap.org/api))

### 1. Backend Setup
1. Clone the repository and navigate to the root directory.
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the root directory and add your API key:
   ```env
   OPENWEATHER_API_KEY=your_actual_api_key_here
   ```
5. Run the backend server:
   ```bash 
   .\venv\Scripts\python src/main.py
   ```
   The API will be available at `http://localhost:8000`.

### 2. Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:5173`.

## Architecture Decisions

- **FastAPI**: Selected for its high performance, automatic OpenAPI documentation, and excellent async support which is crucial for external API calls.
- **SQLite**: Chosen for zero-configuration local storage, making the application easy to set up and portable while providing full relational database capabilities.
- **Layered Pattern**: The backend follows a clear separation of concerns:
  - `api/`: External service communication.
  - `services/`: Core business logic (syncing, data transformations).
  - `db/`: Database connection and raw SQL management.
  - `schemas/`: Data validation and serialization.
  - `main.py`: Route definitions and app initialization.
- **Frontend State**: Managed with React hooks for simplicity and performance.
## Assumptions

### Technical Assumptions
- **Single User Environment**: The application is designed for local/personal use. No authentication, multi-tenancy, or concurrent user access management is implemented.
- **Network Connectivity**: Assumes stable internet connection for API calls to OpenWeatherMap. The app does not implement offline mode or request queuing.
- **API Rate Limits**: OpenWeatherMap free tier allows 1,000 calls/day. The app assumes manual sync triggers and does not implement automatic background refresh or rate limit handling.
- **Development Environment**: The application runs in development mode (`npm run dev` for frontend, direct Python execution for backend). Production deployment requires separate configuration.
- **Local Storage**: SQLite database (`weather.db`) is stored locally. No cloud backup, replication, or distributed database features are implemented.

### Operational Assumptions
- **Manual Synchronization**: Weather data is only updated when the user explicitly clicks "Request Sync" or "Initialize Satellite Link". There is no automatic refresh mechanism.
- **Data Staleness**: Cached weather data in the database may become outdated. The UI shows "Last Synced" timestamp, but doesn't warn users about stale data.
- **Error Recovery**: Failed API calls display error alerts but don't retry automatically. Users must manually trigger sync again.
- **Browser Compatibility**: Frontend assumes modern browsers with ES6+ support. No polyfills for legacy browser compatibility are included.
- **Port Availability**: Backend assumes port 8000 is available, frontend assumes port 5173. No dynamic port assignment is implemented.

### Design Assumptions
- **Aesthetic Over Automation**: The "NYC Terminal" theme uses technical jargon ("nodes", "PlanetNexus", "satellite sync") purely for visual appeal. These terms don't reflect actual system architecture.
- **Decorative UI Elements**: Labels like "Orbital Refresh: 10hz", "Frame: 00492-AX", and "WGS84" are static text for aesthetic purposes and don't indicate real functionality.
- **Minimal Validation**: City names are passed directly to OpenWeatherMap API. Invalid entries show error alerts but don't provide input validation or suggestions.
- **No User Preferences Persistence**: UI theme (dark/light mode) and layout preferences are not saved. Only temperature units (metric/imperial) are persisted in the database.

### Data Management Assumptions
- **No Data Retention Limits**: Weather snapshots accumulate indefinitely in the database. No automatic cleanup or archival mechanism exists.
- **Forecast Overwrite**: Each sync deletes all previous forecast data for that location and replaces it with fresh data. Historical forecasts are not preserved.
- **Coordinate Precision**: Uses OpenWeatherMap's coordinate resolution. Multiple cities with similar coordinates may show identical weather data.
- **Timezone Handling**: All timestamps are stored as UTC. The frontend displays times in the user's local timezone without explicit timezone indicators.

### Security Assumptions
- **API Key Exposure**: The `.env` file stores the OpenWeatherMap API key in plain text. This is acceptable for local development but not secure for production deployment.
- **No Input Sanitization**: Location names and user inputs are not sanitized for SQL injection (mitigated by using parameterized queries) or XSS attacks.
- **CORS Configuration**: The frontend dev server proxies API requests to avoid CORS issues. Production deployment requires proper CORS headers or reverse proxy configuration.
- **No HTTPS**: Both frontend and backend run on HTTP (localhost). Assumes local development environment without SSL/TLS requirements.
