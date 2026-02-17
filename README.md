# Weather Data Integration Platform

Full-stack weather tracking platform with a FastAPI backend, React frontend, SQLite persistence, and OpenWeatherMap integration.

## System Summary

- Tracks locations and stores weather data locally.
- Supports location CRUD operations.
- Syncs current weather + 5-day forecast from OpenWeatherMap.
- Keeps weather snapshot history and sync history.
- Provides preferences and system status endpoints.
- Includes API rate limiting and error handling.

## Recommended IDE

- Visual Studio Code
- Useful extensions:
  - Python
  - Pylance
  - ESLint
  - Prettier
  - Docker

## Tech Stack

- Backend: Python 3.10+, FastAPI, Uvicorn, Pydantic
- Frontend: React 18, TypeScript, Vite
- Database: SQLite
- External API: OpenWeatherMap
- Containerization: Docker + Docker Compose

## Project Structure

```text
.
|-- src/
|   |-- api/               # OpenWeatherMap client
|   |-- db/                # SQLite access + schema init
|   |-- schemas/           # Pydantic models
|   |-- services/          # Business logic
|   `-- main.py            # FastAPI app + routes
|-- frontend/              # React + Vite client
|-- database/              # SQLite data and init scripts
|-- tests/                 # Backend tests
|-- Dockerfile.backend
|-- frontend/Dockerfile.frontend
`-- docker-compose.yml
```

## Prerequisites

- Git
- Python 3.10+
- Node.js 18+
- Docker Desktop
- OpenWeatherMap API key: https://openweathermap.org/api

## Clone The Repository

```bash
git clone <your-repo-url>
cd Weather-Data-Integration-Platform
```

## Environment Setup

Create `.env` in the project root:

```env
OPENWEATHER_API_KEY=your_actual_api_key_here
```

Optional rate-limit tuning:

```env
API_RATE_LIMIT_REQUESTS=120
API_RATE_LIMIT_WINDOW_SECONDS=60
```

## Run Locally Without Docker

### 1. Backend

```bash
python -m venv venv
```

Windows:

```bash
venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
```

Backend URLs:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

### 2. Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:5173`

## Run With Docker (Recommended)

This project includes:

- `Dockerfile.backend`
- `frontend/Dockerfile.frontend`
- `docker-compose.yml`

### Build and start

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`

### Run in background

```bash
docker compose up -d --build
```

### Stop services

```bash
docker compose down
```

### View logs

```bash
docker compose logs -f
```

### Notes

- First build can take several minutes.
- Warning about `version` in `docker-compose.yml` is non-blocking.

## API Endpoints (Core)

- `GET /system/status`
- `GET /locations`
- `POST /locations`
- `PATCH /locations/{location_id}`
- `DELETE /locations/{location_id}`
- `POST /locations/{location_id}/sync`
- `GET /locations/{location_id}/weather`
- `GET /locations/{location_id}/history`
- `GET /locations/{location_id}/export`
- `GET /preferences`
- `PATCH /preferences/{key}`

Interactive docs: `http://localhost:8000/docs`

## Testing

From project root:

```bash
pytest
```

## Troubleshooting

- Ports busy:
  - Stop conflicting services or change exposed ports in `docker-compose.yml`.
- Docker context canceled errors:
  - Retry `docker compose up`; often transient Docker Desktop connection issue.
- Missing API key:
  - Confirm `.env` exists at project root and contains `OPENWEATHER_API_KEY`.

## Security Notes

- Do not commit `.env` to git.
- Rotate API keys if exposed.
- `allow_origins=["*"]` is development-friendly; restrict CORS for production.
