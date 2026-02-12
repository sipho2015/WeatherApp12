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

