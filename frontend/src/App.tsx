import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Database,
  Edit3,
  RefreshCw,
  Search,
  Settings,
  Star,
  Sun,
  Moon,
  Trash2,
  Wind
} from 'lucide-react'
import { format } from 'date-fns'
import type { Location, LocationSearchResult, WeatherData } from './types/weather'
import './index.css'

function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<WeatherData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [preferences, setPreferences] = useState<{ [key: string]: string }>({ units: 'metric' })
  const [showSettings, setShowSettings] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedSearchCountry, setSelectedSearchCountry] = useState<string | null>(null)

  useEffect(() => {
    fetchLocations()
    fetchPreferences()
  }, [])

  // Ensure theme from preferences is applied to document
  useEffect(() => {
    const theme = preferences.theme || 'dark'
    try {
      document.documentElement.setAttribute('data-theme', theme)
    } catch (e) {
      // ignore for server/non-browser env
    }
  }, [preferences.theme])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true)
        const response = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        })
        if (!response.ok) throw new Error('Search failed')
        const data: LocationSearchResult[] = await response.json()
        setSearchResults(data)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Location search failed:', error)
        }
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [searchQuery])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/preferences')
      const data = await response.json()
      const prefs: { [key: string]: string } = {}
      data.forEach((p: any) => {
        prefs[p.key] = p.value
      })
      setPreferences(prefs)
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
    }
  }

  const handleUpdatePreference = async (key: string, value: string) => {
    try {
      await fetch(`/api/preferences/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      })
      setPreferences(prev => ({ ...prev, [key]: value }))
      if (selectedLocation) {
        handleViewWeather(selectedLocation.location)
      }
    } catch (error) {
      console.error('Failed to update preference:', error)
    }
  }

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/locations')
      const data = await response.json()
      setLocations(data)
    } catch (error) {
      console.error('Failed to fetch locations:', error)
    }
  }

  const createLocation = async (name: string, country?: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, country })
      })

      if (response.ok) {
        setSearchQuery('')
        setSelectedSearchCountry(null)
        setSearchResults([])
        setShowSearchResults(false)
        await fetchLocations()
      } else {
        const err = await response.json()
        alert(err.detail || 'Failed to add location')
      }
    } catch (error) {
      console.error('Error adding location:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    await createLocation(searchQuery.trim(), selectedSearchCountry || undefined)
  }

  const handleSelectSearchResult = async (result: LocationSearchResult) => {
    setSearchQuery(result.display_name)
    setSelectedSearchCountry(result.country)
    await createLocation(result.name, result.country)
  }

  const handleDeleteLocation = async (id: number) => {
    if (!confirm('Are you sure you want to remove this location?')) return

    try {
      await fetch('/api/locations/' + id, { method: 'DELETE' })
      if (selectedLocation?.location.id === id) {
        setSelectedLocation(null)
      }
      await fetchLocations()
    } catch (error) {
      console.error('Error deleting location:', error)
    }
  }

  const handleToggleFavorite = async (location: Location) => {
    try {
      await fetch('/api/locations/' + location.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !location.is_favorite })
      })
      await fetchLocations()
    } catch (error) {
      console.error('Error updating favorite:', error)
    }
  }

  const handleRenameLocation = async (location: Location) => {
    const currentName = location.display_name || location.name
    const nextName = prompt('Enter a new display name', currentName)
    if (!nextName || !nextName.trim() || nextName.trim() === currentName) return

    try {
      const response = await fetch(`/api/locations/${location.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: nextName.trim() })
      })
      if (!response.ok) {
        const err = await response.json()
        alert(err.detail || 'Failed to update display name')
        return
      }
      await fetchLocations()
      if (selectedLocation?.location?.id === location.id) {
        await handleViewWeather(location)
      }
    } catch (error) {
      console.error('Error renaming location:', error)
    }
  }

  const handleViewWeather = async (location: Location) => {
    if (!location?.id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/locations/${location.id}/weather`)
      if (!response.ok) throw new Error('Failed to fetch weather')
      const data = await response.json()
      setSelectedLocation(data)
    } catch (error) {
      console.error('Error fetching weather:', error)
      setSelectedLocation(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncWeather = async (id: number) => {
    if (!id) return
    setSyncing(id)
    try {
      const response = await fetch(`/api/locations/${id}/sync`, { method: 'POST' })
      if (!response.ok) {
        const errData = await response.json()
        alert(`Sync failed: ${errData.detail || 'Internal error'}`)
        return
      }
      const data = await response.json()
      if (selectedLocation?.location?.id === id) {
        setSelectedLocation(data)
      }
      await fetchLocations()
    } catch (error) {
      console.error('Error syncing weather:', error)
    } finally {
      setSyncing(null)
    }
  }

  const getWeatherIcon = (condition: string) => {
    const cond = condition.toLowerCase()
    if (cond.includes('cloud')) return <Cloud className="w-12 h-12" />
    if (cond.includes('rain') || cond.includes('drizzle')) return <CloudRain className="w-12 h-12" />
    if (cond.includes('clear') || cond.includes('sun')) return <Sun className="w-12 h-12" />
    if (cond.includes('snow') || cond.includes('sleet')) return <CloudSnow className="w-12 h-12" />
    if (cond.includes('storm') || cond.includes('thunder')) return <CloudLightning className="w-12 h-12" />
    if (cond.includes('mist') || cond.includes('fog')) return <Wind className="w-12 h-12" />
    return <Cloud className="w-12 h-12" />
  }

  const activeData = selectedLocation
  const weatherTheme = activeData?.current?.weather_main?.toLowerCase() || ''

  const themeClass = useMemo(() => {
    if (weatherTheme.includes('thunder') || weatherTheme.includes('storm')) return 'theme-thunder'
    if (weatherTheme.includes('rain') || weatherTheme.includes('drizzle')) return 'theme-rain'
    if (weatherTheme.includes('snow') || weatherTheme.includes('sleet')) return 'theme-snow'
    if (weatherTheme.includes('cloud') || weatherTheme.includes('mist') || weatherTheme.includes('fog')) return 'theme-cloudy'
    if (weatherTheme.includes('clear') || weatherTheme.includes('sun')) return 'theme-sunny'
    return 'theme-default'
  }, [weatherTheme])

  const dailyForecast = useMemo(
    () => activeData?.forecast?.filter((_, i) => i % 8 === 0).slice(0, 5) || [],
    [activeData]
  )

  const graphTemps = dailyForecast.map(item => Math.round(item.temperature))
  const maxTemp = graphTemps.length ? Math.max(...graphTemps) : 0
  const minTemp = graphTemps.length ? Math.min(...graphTemps) : 0
  const range = Math.max(1, maxTemp - minTemp)
  const chartWidth = 760
  const chartHeight = 120
  const chartPoints = graphTemps
    .map((temp, index) => {
      const x = graphTemps.length > 1 ? (index / (graphTemps.length - 1)) * (chartWidth - 20) + 10 : chartWidth / 2
      const y = chartHeight - (((temp - minTemp) / range) * (chartHeight - 28) + 14)
      return `${x},${y}`
    })
    .join(' ')

  if (showWelcome) {
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <p className="welcome-kicker">Weather Data Integration Platform</p>
          <h1>WeatherDesk</h1>
          <p className="welcome-text">
            Live location tracking, forecast syncing, and climate insights in a modern dashboard.
          </p>
          <div className="welcome-preview">
            <Sun className="w-8 h-8" />
            <CloudRain className="w-8 h-8" />
            <CloudSnow className="w-8 h-8" />
            <CloudLightning className="w-8 h-8" />
          </div>
          <button className="glass-btn text-btn welcome-button" onClick={() => setShowWelcome(false)}>
            Enter Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`page-bg ${themeClass}`}></div>
      <div className="overlay"></div>

      <main className={`dashboard-shell ${themeClass}`}>
        <aside className="sidebar glass">
          <div className="sidebar-top">
            <p className="app-label">Skyline</p>
            <h1 className="app-title">Weather Studio</h1>
          </div>

          <section className="status-card glass-soft">
            <div className="status-head">
              <p className="status-title">Atmosphere Status</p>
              <span className="pill">{activeData?.current ? 'Live' : 'Idle'}</span>
            </div>
            <svg className="status-curve" viewBox="0 0 240 90" aria-hidden="true">
              <defs>
                <linearGradient id="curveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#57cfff" />
                  <stop offset="100%" stopColor="#b8eeff" />
                </linearGradient>
              </defs>
              <path d="M5 68 C 40 20, 80 85, 120 40 S 205 15, 235 54" fill="none" stroke="url(#curveGlow)" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </section>

          <section className="map-card glass-soft">
            <div className="map-preview">
              <span className="dot dot-1"></span>
              <span className="dot dot-2"></span>
              <span className="dot dot-3"></span>
              <span className="line line-1"></span>
              <span className="line line-2"></span>
            </div>
            <p className="map-label">{locations.length} locations tracked</p>
          </section>

          <section className="locations-list glass-soft">
            {locations.length === 0 ? (
              <div className="empty-locations">
                <Database className="w-7 h-7" />
                <p>No locations yet</p>
              </div>
            ) : (
              locations.map(loc => (
                <div
                  key={loc.id}
                  className={`location-row ${activeData?.location?.id === loc.id ? 'active' : ''}`}
                  onClick={() => handleViewWeather(loc)}
                >
                  <div className="loc-main">
                    <p className="loc-name">{loc.display_name}</p>
                    <p className="loc-meta">{loc.latitude.toFixed(2)} / {loc.longitude.toFixed(2)}</p>
                  </div>
                  <div className="loc-actions" onClick={e => e.stopPropagation()}>
                    <button className="icon-btn-mini" onClick={() => handleRenameLocation(loc)} title="Rename location">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button className="icon-btn-mini" onClick={() => handleToggleFavorite(loc)} title="Toggle favorite">
                      <Star className={`w-4 h-4 ${loc.is_favorite ? 'is-favorite' : ''}`} />
                    </button>
                    <button className="icon-btn-mini" onClick={() => handleDeleteLocation(loc.id)} title="Delete location">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <div className="location-block">
            <p className="location-kicker">Current city</p>
            <p className="location-name">{activeData?.location?.display_name || 'Select a location'}</p>
          </div>
        </aside>

        <section className="main-panel glass">
          <header className="top-row">
            <div className="meta">
              <p className="city">{activeData?.location?.display_name || 'Weather Dashboard'}</p>
              <p className="date">{format(new Date(), 'EEEE, MMMM d')}</p>
            </div>

            <div className="actions">
              <div className="search-box">
                <form onSubmit={handleAddLocation} className="add-form">
                  <input
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value)
                      setSelectedSearchCountry(null)
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 120)}
                    placeholder="Search and add city..."
                    disabled={loading}
                  />
                  <button className="glass-btn icon-btn" type="submit" aria-label="Add location">
                    <Search size={16} />
                  </button>
                </form>

                {showSearchResults && (searchLoading || searchResults.length > 0) && (
                  <div className="search-results glass-soft">
                    {searchLoading && <div className="search-result-item muted">Searching...</div>}
                    {!searchLoading &&
                      searchResults.map(result => (
                        <button
                          key={`${result.name}-${result.country}-${result.latitude}-${result.longitude}`}
                          type="button"
                          className="search-result-item"
                          onMouseDown={() => handleSelectSearchResult(result)}
                        >
                          <span className="search-city">{result.display_name}</span>
                          <span className="search-coords">
                            {result.latitude.toFixed(2)}, {result.longitude.toFixed(2)}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <button
                className="glass-btn icon-btn"
                title="Sync weather"
                onClick={() => activeData?.location?.id && handleSyncWeather(activeData.location.id)}
                disabled={!activeData?.location?.id || syncing !== null}
              >
                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              </button>

              <button
                className="glass-btn icon-btn"
                title="Toggle theme"
                onClick={() => handleUpdatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light')}
              >
                {preferences.theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button className="glass-btn icon-btn" onClick={() => setShowSettings(v => !v)} title="Preferences">
                <Settings size={16} />
              </button>
            </div>
          </header>

          {showSettings && (
            <section className="settings-panel glass-soft">
              <p className="status-title">Units</p>
              <select value={preferences.units} onChange={e => handleUpdatePreference('units', e.target.value)}>
                <option value="metric">Metric (°C)</option>
                <option value="imperial">Imperial (°F)</option>
              </select>
            </section>
          )}

          {!activeData?.current ? (
            <section className="hero empty-hero glass-soft">
              <div className="hero-copy">
                <Activity className="w-10 h-10" />
                <p className="summary">Pick a location, then sync weather.</p>
              </div>
            </section>
          ) : (
            <section className="hero">
              <div className="hero-icon" aria-hidden="true">
                <span className="sun"></span>
                <span className="cloud"></span>
              </div>
              <div className="hero-copy">
                <div className="temp-line">
                  <p className="temp-main">{Math.round(activeData.current.temperature)}°</p>
                  <p className="temp-small">{Math.round(activeData.current.feels_like)}°</p>
                </div>
                <div className="temp-badges">
                  <span className="badge">H: {maxTemp || Math.round(activeData.current.temperature)}°</span>
                  <span className="badge">L: {minTemp || Math.round(activeData.current.temperature)}°</span>
                </div>
                <p className="summary">{activeData.current.weather_description || activeData.current.weather_main}</p>
              </div>
            </section>
          )}

          <section className="forecast glass-soft">
            <p className="forecast-title">Weekly Forecast</p>
            <div className="chart-wrap">
              <svg className="forecast-curve" viewBox="0 0 760 120" aria-hidden="true">
                {dailyForecast.length > 1 ? (
                  <>
                    <polyline fill="none" stroke="#6fd6ff" strokeWidth="4" strokeLinecap="round" points={chartPoints} />
                    {graphTemps.map((temp, index) => {
                      const x = graphTemps.length > 1 ? (index / (graphTemps.length - 1)) * (chartWidth - 20) + 10 : chartWidth / 2
                      const y = chartHeight - (((temp - minTemp) / range) * (chartHeight - 28) + 14)
                      const isActive = index === 1 || index === 0
                      return (
                        <g key={`${temp}-${index}`}>
                          <circle cx={x} cy={y} r={isActive ? 9 : 6} className={isActive ? 'active-node' : 'node'} />
                        </g>
                      )
                    })}
                  </>
                ) : (
                  <text x="50%" y="54%" textAnchor="middle" fill="rgba(226,232,240,0.55)">
                    Sync weather to render weekly curve
                  </text>
                )}
              </svg>
            </div>

            <div className="week-grid">
              {dailyForecast.length === 0 && (
                <div className="day">
                  <p className="day-name">No Forecast</p>
                  <p className="day-weather">Sync first</p>
                  <p className="day-temp">-- / --</p>
                </div>
              )}
              {dailyForecast.map((item, index) => (
                <div key={item.forecast_timestamp} className={`day ${index === 1 ? 'active' : ''}`}>
                  <p className="day-name">{format(new Date(item.forecast_timestamp * 1000), 'EEEE')}</p>
                  <p className="day-weather">{item.weather_main}</p>
                  <p className="day-temp">{Math.round(item.temperature)}°</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="footer-row">
            <section className="sun-times glass-soft">
              <div className="sun-box">
                <span className="sun-icon"></span>
                <div>
                  <p className="sun-label">Humidity</p>
                  <p className="sun-time">{activeData?.current ? `${activeData.current.humidity}%` : '--'}</p>
                </div>
              </div>
              <div className="sun-box">
                <span className="sun-icon sunset"></span>
                <div>
                  <p className="sun-label">Wind</p>
                  <p className="sun-time">{activeData?.current ? `${activeData.current.wind_speed} m/s` : '--'}</p>
                </div>
              </div>
            </section>

            <section className="temps glass-soft">
              <p>
                Visibility <strong>{activeData?.current ? `${(activeData.current.visibility || 0) / 1000} km` : '--'}</strong>
              </p>
              <p>
                Pressure <strong>{activeData?.current ? `${activeData.current.pressure} hPa` : '--'}</strong>
              </p>
            </section>
          </footer>
        </section>
      </main>
    </>
  )
}

export default App
