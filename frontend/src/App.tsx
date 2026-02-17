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
import jsPDF from 'jspdf'
import type {
  Location,
  LocationSearchResult,
  WeatherData,
  WeatherSnapshot,
  LocationWeatherOverview,
  SystemStatus
} from './types/weather'
import './index.css'

function App() {
  const DEGREE_SYMBOL = '\u00B0'
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
  const [showForecastDetails, setShowForecastDetails] = useState(false)
  const [showForecastPanel, setShowForecastPanel] = useState(false)
  const [historyData, setHistoryData] = useState<WeatherSnapshot[]>([])
  const [historySource, setHistorySource] = useState<'api' | 'local' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [locationOverview, setLocationOverview] = useState<LocationWeatherOverview[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [showAddLocationForm, setShowAddLocationForm] = useState(false)
  const [formCityName, setFormCityName] = useState('')
  const [formCountryCode, setFormCountryCode] = useState('')
  const [formUnits, setFormUnits] = useState('metric')
  const [formInterval, setFormInterval] = useState('600')

  useEffect(() => {
    fetchLocations()
    fetchLocationOverview()
    fetchSystemStatus()
    fetchPreferences()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      fetchSystemStatus()
    }, 30000)
    return () => clearInterval(timer)
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
    setFormUnits(preferences.units || 'metric')
    setFormInterval(preferences.refresh_interval || '600')
  }, [preferences.units, preferences.refresh_interval])

  useEffect(() => {
    if (!statusMessage) return
    const timer = setTimeout(() => {
      setStatusMessage(null)
    }, 2500)
    return () => clearTimeout(timer)
  }, [statusMessage])

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
      if (!response.ok) throw new Error('Failed to load preferences')
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

  const readErrorMessage = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json()
      if (typeof payload?.detail === 'string') return payload.detail
      if (payload?.detail) return JSON.stringify(payload.detail)
    } catch (error) {
      // ignore parse errors and use fallback
    }
    return fallback
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
      if (!response.ok) throw new Error('Failed to load locations')
      const data = await response.json()
      setLocations(data)
    } catch (error) {
      console.error('Failed to fetch locations:', error)
    }
  }

  const fetchLocationOverview = async () => {
    try {
      const response = await fetch('/api/locations/overview')
      if (!response.ok) throw new Error('Failed to load locations overview')
      const data: LocationWeatherOverview[] = await response.json()
      setLocationOverview(data)
    } catch (error) {
      console.error('Failed to fetch locations overview:', error)
      // Keep last good overview so UI does not fall back to "Never"/"No current data"
    }
  }

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/status')
      if (!response.ok) throw new Error('Failed to load system status')
      const data: SystemStatus = await response.json()
      setSystemStatus(data)
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    }
  }

  const upsertOverviewFromWeatherData = (data: WeatherData) => {
    const entry: LocationWeatherOverview = {
      location: data.location,
      current: data.current,
      last_synced: data.last_synced
    }
    setLocationOverview(prev => {
      const withoutCurrent = prev.filter(item => item.location.id !== data.location.id)
      return [entry, ...withoutCurrent]
    })
  }

  const fetchHistory = async (locationId: number) => {
    try {
      const response = await fetch(`/api/locations/${locationId}/history?days=5&source=auto`)
      if (!response.ok) throw new Error('Failed to load 5-day history')
      const data: WeatherSnapshot[] = await response.json()
      const sourceHeader = response.headers.get('X-History-Source')
      if (sourceHeader === 'api' || sourceHeader === 'local') {
        setHistorySource(sourceHeader)
      } else {
        setHistorySource(null)
      }
      setHistoryData(data)
    } catch (error) {
      console.error('Failed to fetch history:', error)
      setHistorySource(null)
      setHistoryData([])
    }
  }

  const updatePreferenceValue = async (key: string, value: string) => {
    const response = await fetch(`/api/preferences/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    if (!response.ok) {
      const message = await readErrorMessage(response, `Failed to update ${key}`)
      throw new Error(message)
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
        const newLocation: Location = await response.json()
        setSearchQuery('')
        setSelectedSearchCountry(null)
        setSearchResults([])
        setShowSearchResults(false)
        setErrorMessage(null)
        await fetchLocations()
        await fetchLocationOverview()
        await handleViewWeather(newLocation)
        await fetchHistory(newLocation.id)
      } else {
        const message = await readErrorMessage(response, 'Failed to add location')
        setErrorMessage(message)
      }
    } catch (error) {
      console.error('Error adding location:', error)
      setErrorMessage('Failed to add location due to network or server error.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLocationFromForm = async (e: React.FormEvent) => {
    e.preventDefault()
    const city = formCityName.trim()
    const country = formCountryCode.trim().toUpperCase()
    if (!city) {
      setErrorMessage('City name is required.')
      return
    }
    if (!country || country.length < 2) {
      setErrorMessage('Country code is required (for example BW, ZA, US).')
      return
    }
    const parsedInterval = Number(formInterval)
    if (!Number.isFinite(parsedInterval) || parsedInterval < 60) {
      setErrorMessage('Interval must be at least 60 seconds.')
      return
    }

    try {
      await updatePreferenceValue('units', formUnits)
      await updatePreferenceValue('refresh_interval', String(parsedInterval))
      setPreferences(prev => ({
        ...prev,
        units: formUnits,
        refresh_interval: String(parsedInterval)
      }))
      await createLocation(city, country)
      setShowAddLocationForm(false)
      setFormCityName('')
      setFormCountryCode('')
      setErrorMessage(null)
    } catch (error) {
      console.error('Failed to create location from form:', error)
      setErrorMessage((error as Error).message || 'Failed to create location')
    }
  }

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    if (!selectedSearchCountry) {
      setErrorMessage('Please choose a city from the search suggestions before adding.')
      return
    }
    await createLocation(searchQuery.trim(), selectedSearchCountry || undefined)
  }

  const handleSelectSearchResult = async (result: LocationSearchResult) => {
    setSearchQuery(result.display_name)
    setSelectedSearchCountry(result.country)
    setErrorMessage(null)
    await createLocation(result.name, result.country)
  }

  const handleDeleteLocation = async (id: number) => {
    if (!confirm('Are you sure you want to remove this location?')) return

    try {
      await fetch('/api/locations/' + id, { method: 'DELETE' })
      if (selectedLocation?.location.id === id) {
        setSelectedLocation(null)
        setHistoryData([])
        setShowForecastPanel(false)
      }
      setErrorMessage(null)
      await fetchLocations()
      await fetchLocationOverview()
      await fetchSystemStatus()
    } catch (error) {
      console.error('Error deleting location:', error)
      setErrorMessage('Failed to delete location.')
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
      await fetchLocationOverview()
      await fetchSystemStatus()
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
      if (!response.ok) {
        const message = await readErrorMessage(response, 'Failed to fetch weather')
        throw new Error(message)
      }
      const data = await response.json()
      setSelectedLocation(data)
      upsertOverviewFromWeatherData(data)
      setErrorMessage(null)
      await fetchHistory(location.id)
    } catch (error) {
      console.error('Error fetching weather:', error)
      setSelectedLocation(null)
      setHistoryData([])
      setErrorMessage((error as Error).message || 'Failed to fetch weather data.')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncWeather = async (
    id: number,
    options: { selectSynced?: boolean; silent?: boolean } = {}
  ) => {
    if (!id) return
    setSyncing(id)
    try {
      const response = await fetch(`/api/locations/${id}/sync?force=true`, { method: 'POST' })
      if (!response.ok) {
        const message = await readErrorMessage(response, 'Internal error')
        if (!options.silent) {
          setErrorMessage(`Sync failed: ${message}`)
        }
        return false
      }
      const data = await response.json()
      if (options.selectSynced || selectedLocation?.location?.id === id) {
        setSelectedLocation(data)
      }
      upsertOverviewFromWeatherData(data)
      await fetchHistory(id)
      setErrorMessage(null)
      setStatusMessage(`Synced ${data.location.display_name} successfully.`)
      await fetchLocations()
      await fetchLocationOverview()
      await fetchSystemStatus()
      return true
    } catch (error) {
      console.error('Error syncing weather:', error)
      if (!options.silent) {
        setErrorMessage('Sync failed due to network or server error.')
      }
      setStatusMessage(null)
      return false
    } finally {
      setSyncing(null)
    }
  }

  const handleSyncNowFromHistory = async () => {
    if (!activeData?.location?.id) return
    const ok = await handleSyncWeather(activeData.location.id, { selectSynced: true })
    if (ok) {
      await handleViewWeather(activeData.location)
    }
  }

  const handleViewForecastForLocation = async (location: Location) => {
    await handleViewWeather(location)
    setShowForecastPanel(true)
  }

  const handleExportLocation = async (location: Location) => {
    try {
      const response = await fetch(`/api/locations/${location.id}/export?history_days=30`)
      let payload: any
      if (response.ok) {
        payload = await response.json()
      } else if (response.status === 404) {
        // Fallback for backend instances that do not yet expose /export.
        const weatherRes = await fetch(`/api/locations/${location.id}/weather`)
        if (!weatherRes.ok) {
          const message = await readErrorMessage(weatherRes, 'Export failed')
          setErrorMessage(message)
          return
        }
        const historyRes = await fetch(`/api/locations/${location.id}/history?days=30`)
        const weatherPayload = await weatherRes.json()
        const historyPayload = historyRes.ok ? await historyRes.json() : []
        payload = {
          exported_at: new Date().toISOString(),
          history_days: 30,
          location: weatherPayload.location,
          current: weatherPayload.current,
          forecast: weatherPayload.forecast || [],
          history: historyPayload || [],
          last_synced: weatherPayload.last_synced,
          sync_note: weatherPayload.sync_note || null
        }
      } else {
        const message = await readErrorMessage(response, 'Export failed')
        setErrorMessage(message)
        return
      }
      const doc = new jsPDF()
      const safeName = (location.display_name || location.name).replace(/[^a-z0-9-_]+/gi, '_')
      doc.setFontSize(16)
      doc.text(`Weather Export: ${location.display_name || location.name}`, 14, 16)
      doc.setFontSize(10)
      doc.text(`Country: ${location.country}`, 14, 24)
      doc.text(`Exported At: ${payload.exported_at || 'N/A'}`, 14, 30)
      doc.text(`Last Synced: ${payload.last_synced || 'Never'}`, 14, 36)

      const current = payload.current
      let y = 46
      doc.setFontSize(12)
      doc.text('Current Weather', 14, y)
      y += 6
      doc.setFontSize(10)
      if (current) {
        doc.text(`Temp: ${Math.round(current.temperature)}${DEGREE_SYMBOL}`, 14, y)
        y += 5
        doc.text(`Condition: ${current.weather_main} (${current.weather_description})`, 14, y)
        y += 5
        doc.text(`Humidity: ${current.humidity}% | Wind: ${current.wind_speed} m/s`, 14, y)
      } else {
        doc.text('No current data available.', 14, y)
      }

      y += 10
      doc.setFontSize(12)
      doc.text('Forecast Snapshot', 14, y)
      y += 6
      doc.setFontSize(10)
      const forecastItems = (payload.forecast || []).slice(0, 6)
      if (!forecastItems.length) {
        doc.text('No forecast records available.', 14, y)
      } else {
        forecastItems.forEach((item: any, index: number) => {
          const dt = format(new Date(item.forecast_timestamp * 1000), 'MMM d, HH:mm')
          doc.text(
            `${index + 1}. ${dt} | ${Math.round(item.temperature)}${DEGREE_SYMBOL} | ${item.weather_main} | Hum ${item.humidity}%`,
            14,
            y
          )
          y += 5
          if (y > 275 && index < forecastItems.length - 1) {
            doc.addPage()
            y = 18
          }
        })
      }

      doc.save(`${safeName}_weather_export.pdf`)
      setErrorMessage(null)
    } catch (error) {
      console.error('Export failed:', error)
      setErrorMessage('Failed to export location data.')
    }
  }

  const getWeatherIcon = (condition: string, className = 'w-12 h-12') => {
    const cond = condition.toLowerCase()
    if (cond.includes('cloud')) return <Cloud className={className} />
    if (cond.includes('rain') || cond.includes('drizzle')) return <CloudRain className={className} />
    if (cond.includes('clear') || cond.includes('sun')) return <Sun className={className} />
    if (cond.includes('snow') || cond.includes('sleet')) return <CloudSnow className={className} />
    if (cond.includes('storm') || cond.includes('thunder')) return <CloudLightning className={className} />
    if (cond.includes('mist') || cond.includes('fog')) return <Wind className={className} />
    return <Cloud className={className} />
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

  const dailyForecast = useMemo(() => {
    const rows = activeData?.forecast || []
    const byDay = new Map<string, (typeof rows)[number]>()
    for (const item of rows) {
      const key = format(new Date(item.forecast_timestamp * 1000), 'yyyy-MM-dd')
      if (!byDay.has(key)) {
        byDay.set(key, item)
      }
      if (byDay.size >= 6) break
    }
    return Array.from(byDay.values())
  }, [activeData])
  const overviewMap = useMemo(
    () => new Map(locationOverview.map(item => [item.location.id, item])),
    [locationOverview]
  )
  const insights = activeData?.insights || null

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
              <span className="pill">
                {systemStatus?.api_configured ? (systemStatus.failed_sync_last_24h > 0 ? 'Warning' : 'Healthy') : 'No API Key'}
              </span>
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
            <p className="map-label">Tracked: {systemStatus?.total_locations ?? locations.length}</p>
            <p className="map-label">Synced: {systemStatus?.synced_locations ?? 0}</p>
            <p className="map-label">Failed(24h): {systemStatus?.failed_sync_last_24h ?? 0}</p>
            <p className="map-label">
              Last success: {systemStatus?.last_success_sync ? format(new Date(systemStatus.last_success_sync), 'MMM d, HH:mm') : 'Never'}
            </p>
            <button className="glass-btn text-btn status-refresh-btn" type="button" onClick={fetchSystemStatus}>
              Refresh Status
            </button>
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
            <p className="map-label">Auto sync interval: {(systemStatus?.sync_interval_seconds ?? preferences.refresh_interval ?? '600')}s</p>
          </section>

          <section className="locations-list glass-soft">
            {locations.length === 0 ? (
              <div className="empty-locations">
                <Database className="w-7 h-7" />
                <p>No locations yet</p>
              </div>
            ) : (
              locations.map(loc => (
                <button
                  key={loc.id}
                  type="button"
                  className={`location-row ${activeData?.location?.id === loc.id ? 'active' : ''}`}
                  onClick={() => handleViewWeather(loc)}
                  aria-label={`View weather for ${loc.display_name}`}
                >
                  <div className="loc-main">
                    <p className="loc-name">{loc.display_name}</p>
                    <p className="loc-meta">{loc.latitude.toFixed(2)} / {loc.longitude.toFixed(2)}</p>
                    <p className="loc-weather-meta">
                      {(overviewMap.get(loc.id)?.current || (selectedLocation?.location?.id === loc.id ? selectedLocation.current : null))
                        ? `${Math.round((overviewMap.get(loc.id)?.current || selectedLocation?.current)!.temperature)}${DEGREE_SYMBOL} | ${(overviewMap.get(loc.id)?.current || selectedLocation?.current)!.weather_main}`
                        : 'No current data'}
                    </p>
                    <p className="loc-weather-meta">
                      Last synced:{' '}
                      {(overviewMap.get(loc.id)?.last_synced || (selectedLocation?.location?.id === loc.id ? selectedLocation.last_synced : null))
                        ? format(new Date((overviewMap.get(loc.id)?.last_synced || selectedLocation?.last_synced)!), 'MMM d, HH:mm')
                        : 'Never'}
                    </p>
                  </div>
                  <div className="loc-actions" onClick={e => e.stopPropagation()}>
                    <button className="icon-btn-mini" onClick={() => handleRenameLocation(loc)} title="Rename location" aria-label={`Rename ${loc.display_name}`}>
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button className="icon-btn-mini" onClick={() => handleToggleFavorite(loc)} title="Toggle favorite" aria-label={`Toggle favorite for ${loc.display_name}`}>
                      <Star className={`w-4 h-4 ${loc.is_favorite ? 'is-favorite' : ''}`} />
                    </button>
                    <button className="icon-btn-mini" onClick={() => handleDeleteLocation(loc.id)} title="Delete location" aria-label={`Delete ${loc.display_name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </button>
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
              <p className="date">
                Last updated: {activeData?.last_synced ? format(new Date(activeData.last_synced), 'MMM d, HH:mm') : 'Not synced yet'}
              </p>
              {activeData?.sync_note && <p className="date">Sync note: {activeData.sync_note}</p>}
            </div>

            <div className="actions">
              <button
                className="glass-btn text-btn"
                type="button"
                onClick={() => setShowAddLocationForm(v => !v)}
                aria-label="Open add location form"
              >
                {showAddLocationForm ? 'Close Add Form' : 'Add Location'}
              </button>
              <div className="search-box">
                <form onSubmit={handleAddLocation} className="add-form">
                  <input
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value)
                      setSelectedSearchCountry(null)
                      setErrorMessage(null)
                      setStatusMessage(null)
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 120)}
                    placeholder="Search and add city..."
                    disabled={loading}
                    aria-label="Search city"
                  />
                  <button className="glass-btn icon-btn" type="submit" aria-label="Add location">
                    <Search size={16} />
                  </button>
                </form>

                {showSearchResults && (searchLoading || searchResults.length > 0) && (
                  <div className="search-results glass-soft" role="listbox" aria-label="Search results">
                    {searchLoading && <div className="search-result-item muted">Searching...</div>}
                    {!searchLoading &&
                      searchResults.map(result => (
                        <button
                          key={`${result.name}-${result.country}-${result.latitude}-${result.longitude}`}
                          type="button"
                          className="search-result-item"
                          onMouseDown={() => handleSelectSearchResult(result)}
                          aria-label={`Add ${result.display_name}`}
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
                aria-label="Sync selected location weather"
              >
                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              </button>

              <button className="glass-btn icon-btn" onClick={() => setShowSettings(v => !v)} title="Preferences" aria-label="Open preferences">
                <Settings size={16} />
              </button>
            </div>
          </header>

          {errorMessage && (
            <section className="error-banner glass-soft" role="alert" aria-live="polite">
              <p>{errorMessage}</p>
            </section>
          )}

          {statusMessage && (
            <section className="status-banner glass-soft" role="status" aria-live="polite">
              <p>{statusMessage}</p>
            </section>
          )}

          {showAddLocationForm && (
            <section className="add-location-panel glass-soft">
              <p className="status-title">Add Location Details</p>
              <form className="add-location-grid" onSubmit={handleCreateLocationFromForm}>
                <label>
                  City Name
                  <input
                    value={formCityName}
                    onChange={e => setFormCityName(e.target.value)}
                    placeholder="e.g. Gaborone"
                  />
                </label>
                <label>
                  Country Code
                  <input
                    value={formCountryCode}
                    onChange={e => setFormCountryCode(e.target.value)}
                    placeholder="e.g. BW"
                    maxLength={3}
                  />
                </label>
                <label>
                  Units
                  <select value={formUnits} onChange={e => setFormUnits(e.target.value)}>
                    <option value="metric">Metric (C)</option>
                    <option value="imperial">Imperial (F)</option>
                  </select>
                </label>
                <label>
                  Sync Interval (seconds)
                  <input
                    type="number"
                    min={60}
                    value={formInterval}
                    onChange={e => setFormInterval(e.target.value)}
                  />
                </label>
                <button className="glass-btn text-btn" type="submit">
                  Save And Add
                </button>
                <button
                  className="glass-btn text-btn"
                  type="button"
                  onClick={() => {
                    setShowAddLocationForm(false)
                    setFormCityName('')
                    setFormCountryCode('')
                    setFormUnits(preferences.units || 'metric')
                    setFormInterval(preferences.refresh_interval || '600')
                    setErrorMessage(null)
                  }}
                >
                  Cancel
                </button>
              </form>
            </section>
          )}

          {showSettings && (
            <section className="settings-panel glass-soft">
              <p className="status-title">Units</p>
              <select value={preferences.units} onChange={e => handleUpdatePreference('units', e.target.value)}>
                <option value="metric">Metric (C)</option>
                <option value="imperial">Imperial (F)</option>
              </select>
              <button
                className="glass-btn icon-btn"
                title="Toggle theme"
                onClick={() => handleUpdatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light')}
                aria-label="Toggle theme"
              >
                {preferences.theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
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
                  <p className="temp-main">{Math.round(activeData.current.temperature)}{DEGREE_SYMBOL}</p>
                  <p className="temp-small">{Math.round(activeData.current.feels_like)}{DEGREE_SYMBOL}</p>
                </div>
                <div className="temp-badges">
                  <span className="badge">H: {maxTemp || Math.round(activeData.current.temperature)}{DEGREE_SYMBOL}</span>
                  <span className="badge">L: {minTemp || Math.round(activeData.current.temperature)}{DEGREE_SYMBOL}</span>
                </div>
                <p className="summary">{activeData.current.weather_description || activeData.current.weather_main}</p>
              </div>
            </section>
          )}

          <section className="tracked-cities-panel glass-soft">
            <div className="forecast-head">
              <p className="forecast-title">Tracked Cities</p>
            </div>
            <div className="tracked-cities-grid">
              {locations.length === 0 && <div className="history-empty">No tracked cities yet.</div>}
              {locations.map(loc => {
                const overview = overviewMap.get(loc.id)
                return (
                  <article key={`tracked-${loc.id}`} className="tracked-city-card">
                    <p className="tracked-city-name">{loc.display_name}</p>
                    <p className="tracked-city-meta">{loc.country}</p>
                    <p className="tracked-city-meta">
                      {overview?.current
                        ? `Current: ${Math.round(overview.current.temperature)}${DEGREE_SYMBOL} ${overview.current.weather_main}`
                        : 'Current: no data'}
                    </p>
                    <p className="tracked-city-meta">
                      Last synced:{' '}
                      {overview?.last_synced
                        ? format(new Date(overview.last_synced), 'MMM d, HH:mm')
                        : 'Never'}
                    </p>
                    <div className="tracked-city-actions">
                      <button
                        className="glass-btn text-btn"
                        type="button"
                        onClick={() => handleSyncWeather(loc.id, { selectSynced: true })}
                      >
                        Refresh
                      </button>
                      <button
                        className="glass-btn text-btn"
                        type="button"
                        onClick={async () => {
                          await handleViewForecastForLocation(loc)
                          setShowForecastDetails(true)
                        }}
                      >
                        View Forecast
                      </button>
                      <button className="glass-btn text-btn" type="button" onClick={() => handleDeleteLocation(loc.id)}>
                        Remove
                      </button>
                      <button className="glass-btn text-btn" type="button" onClick={() => handleExportLocation(loc)}>
                        Export
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {showForecastPanel && (
            <section className="forecast glass-soft">
              <div className="forecast-head">
                <p className="forecast-title">Forecast</p>
                <button
                  className="glass-btn text-btn"
                  type="button"
                  onClick={() => setShowForecastDetails(v => !v)}
                  disabled={!dailyForecast.length}
                >
                  {showForecastDetails ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
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
                    <p className="day-temp">{Math.round(item.temperature)}{DEGREE_SYMBOL}</p>
                  </div>
                ))}
              </div>

              {showForecastDetails && (
                <div className="forecast-cards">
                  {dailyForecast.map(item => (
                    <article key={`full-${item.forecast_timestamp}`} className="forecast-card">
                      <div className="forecast-card-top">
                        <div>
                          <p className="forecast-card-day">{format(new Date(item.forecast_timestamp * 1000), 'EEEE')}</p>
                          <p className="forecast-card-date">{format(new Date(item.forecast_timestamp * 1000), 'MMM d, HH:mm')}</p>
                        </div>
                        {getWeatherIcon(item.weather_main, 'w-8 h-8')}
                      </div>
                      <p className="forecast-card-summary">{item.weather_description}</p>
                      <p className="forecast-card-temp">{Math.round(item.temperature)}{DEGREE_SYMBOL}</p>
                      <div className="forecast-card-stats">
                        <div className="metric-row">
                          <span>Feels</span>
                          <span>{Math.round(item.feels_like)}{DEGREE_SYMBOL}</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, ((item.feels_like + 20) / 70) * 100))}%` }} /></div>
                        </div>
                        <div className="metric-row">
                          <span>Min/Max</span>
                          <span>{Math.round(item.temp_min)}{DEGREE_SYMBOL}/{Math.round(item.temp_max)}{DEGREE_SYMBOL}</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, ((item.temp_max + 20) / 70) * 100))}%` }} /></div>
                        </div>
                        <div className="metric-row">
                          <span>Humidity</span>
                          <span>{item.humidity}%</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, item.humidity))}%` }} /></div>
                        </div>
                        <div className="metric-row">
                          <span>Wind</span>
                          <span>{item.wind_speed} m/s</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, (item.wind_speed / 25) * 100))}%` }} /></div>
                        </div>
                        <div className="metric-row">
                          <span>Rain Chance</span>
                          <span>{Math.round(item.pop * 100)}%</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, item.pop * 100))}%` }} /></div>
                        </div>
                        <div className="metric-row">
                          <span>Pressure</span>
                          <span>{item.pressure} hPa</span>
                          <div className="metric-bar"><div style={{ width: `${Math.min(100, Math.max(0, ((item.pressure - 950) / 120) * 100))}%` }} /></div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="history-panel glass-soft">
            <div className="forecast-head">
              <p className="forecast-title">Last 5 Days History</p>
              {historySource && (
                <p className="status-title">
                  Source: {historySource === 'api' ? 'Historical API' : 'Local snapshots'}
                </p>
              )}
            </div>
            <div className="history-grid">
              {historyData.length === 0 && (
                <div className="history-empty">
                  <p>No historical snapshots yet. Run sync to create snapshots.</p>
                  {activeData?.location?.id && (
                    <button
                      className="glass-btn text-btn history-sync-btn"
                      type="button"
                      onClick={handleSyncNowFromHistory}
                      disabled={syncing === activeData.location.id}
                    >
                      {syncing === activeData.location.id ? 'Syncing...' : 'Sync Now'}
                    </button>
                  )}
                </div>
              )}
              {historyData.slice(0, 5).map((item, index) => (
                <article key={`${item.api_timestamp}-${index}`} className="history-card">
                  <p className="history-time">
                    {item.timestamp ? format(new Date(item.timestamp), 'MMM d, HH:mm') : format(new Date(item.api_timestamp * 1000), 'MMM d, HH:mm')}
                  </p>
                  <p className="history-temp">{Math.round(item.temperature)}{DEGREE_SYMBOL}</p>
                  <p className="history-desc">{item.weather_description}</p>
                  <p className="history-meta">Humidity {item.humidity}% | Wind {item.wind_speed} m/s</p>
                </article>
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

