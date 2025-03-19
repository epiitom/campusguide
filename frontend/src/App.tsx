import { useState, useRef, useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Button } from './components/ui/button'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Icon } from 'leaflet'

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface Message {
  id: string
  text: string
  isUser: boolean
  location?: string
  timestamp: Date
}

interface Location {
  id: string
  name: string
  lat: number
  lng: number
  direction: string
}

interface CollegeInfo {
  id: number
  name: string
  lat: number
  lng: number
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", text: "Welcome to the Campus Guide! How can I help you today?", isUser: false, timestamp: new Date() }
  ])
  const [inputValue, setInputValue] = useState("")
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [campusLocations, setCampusLocations] = useState<Location[]>([])
  const [collegeInfo, setCollegeInfo] = useState<CollegeInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Fetch campus locations on component mount
  useEffect(() => {
    fetchLocations()
    fetchCollegeInfo()
  }, [])

  // Fetch locations from backend
  const fetchLocations = async () => {
    try {
      console.log('Fetching locations from backend...')
      const response = await fetch('http://localhost:3001/api/locations')
      if (!response.ok) {
        console.error('Failed to fetch locations:', response.status, response.statusText)
        throw new Error(`Failed to fetch locations: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      console.log('Received locations:', data)
      setCampusLocations(data)
    } catch (error) {
      console.error('Error fetching locations:', error)
      // Add error message to chat
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Sorry, I'm having trouble connecting to the server. Please make sure the backend is running on port 3001.",
        isUser: false,
        timestamp: new Date()
      }])
    }
  }

  const fetchCollegeInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/college')
      if (!response.ok) {
        console.error('Failed to fetch college info:', response.status, response.statusText)
        throw new Error(`Failed to fetch college info: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      console.log('Received college info:', data)
      setCollegeInfo(data)
    } catch (error) {
      console.error('Error fetching college info:', error)
      // Add error message to chat
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Sorry, I'm having trouble connecting to the server. Please make sure the backend is running on port 3001.",
        isUser: false,
        timestamp: new Date()
      }])
    }
  }

  // Initialize user location with continuous tracking
  useEffect(() => {
    if (navigator.geolocation) {
      // Get initial position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude])
        },
        (error) => {
          console.error("Geolocation error:", error)
          // Use default location if user location is not available
          setUserLocation([21.0060, 79.0490])
        }
      )

      // Set up continuous tracking
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation: [number, number] = [position.coords.latitude, position.coords.longitude]
          setUserLocation(newLocation)
          
          // Update map if it's showing and we have a selected location
          if (showMap && selectedLocation && mapRef.current) {
            const locationInfo = campusLocations.find(loc => loc.id === selectedLocation)
            if (locationInfo) {
              const locationCoords: [number, number] = [locationInfo.lat, locationInfo.lng]
              
              // Update user marker
              mapRef.current.eachLayer((layer) => {
                if (layer instanceof L.Marker && layer.options.icon?.options.iconUrl?.includes('blue')) {
                  mapRef.current?.removeLayer(layer)
                }
              })

              // Add new user marker
              const userIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })

              L.marker(newLocation, { icon: userIcon })
                .addTo(mapRef.current)
                .bindPopup('You are here')

              // Update path
              mapRef.current.eachLayer((layer) => {
                if (layer instanceof L.Polyline) {
                  mapRef.current?.removeLayer(layer)
                }
              })

              L.polyline([newLocation, locationCoords], {
                color: '#4F46E5',
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 10'
              }).addTo(mapRef.current)

              // Adjust map bounds
              mapRef.current.fitBounds([newLocation, locationCoords], {
                padding: [50, 50]
              })
            }
          }
        },
        (error) => {
          console.error("Geolocation watch error:", error)
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      )

      // Cleanup function to stop watching position
      return () => {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [showMap, selectedLocation, campusLocations])

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Initialize or update map when showing
  useEffect(() => {
    if (showMap && mapContainerRef.current) {
      // If map doesn't exist, create it
      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current).setView([21.0047, 79.0476], 17)
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(mapRef.current)
      }

      // Clear existing markers and paths
      mapRef.current.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          mapRef.current?.removeLayer(layer)
        }
      })

      // Add markers and paths if location is selected
      if (selectedLocation && campusLocations.length > 0) {
        const locationInfo = campusLocations.find(loc => loc.id === selectedLocation)
        if (locationInfo) {
          const locationCoords: [number, number] = [locationInfo.lat, locationInfo.lng]
          
          // Add destination marker with custom icon
          const destinationIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
          })

          const destinationMarker = L.marker(locationCoords, { icon: destinationIcon })
            .addTo(mapRef.current)
            .bindPopup(`<b>${locationInfo.name}</b><br>${locationInfo.direction}`)
            .openPopup()

          // Add user location if available
          if (userLocation) {
            const userIcon = L.icon({
              iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
              shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41]
            })

            const userMarker = L.marker(userLocation, { icon: userIcon })
              .addTo(mapRef.current)
              .bindPopup('You are here')

            // Draw path from user to destination with distance
            const path = L.polyline([userLocation, locationCoords], {
              color: '#4F46E5',
              weight: 4,
              opacity: 0.8,
              dashArray: '10, 10'
            }).addTo(mapRef.current)

            // Calculate and display distance
            const distance = L.latLng(userLocation[0], userLocation[1])
              .distanceTo(L.latLng(locationCoords[0], locationCoords[1]))
            const distanceText = distance < 1000 
              ? `${Math.round(distance)} meters` 
              : `${(distance / 1000).toFixed(1)} km`

            // Add distance label to the path
            const midPoint = path.getBounds().getCenter()
            L.marker(midPoint, {
              icon: L.divIcon({
                className: 'distance-label',
                html: `<div class="bg-white px-2 py-1 rounded shadow text-sm">${distanceText}</div>`,
                iconSize: [100, 20],
                iconAnchor: [50, 10]
              })
            }).addTo(mapRef.current)

            // Fit bounds to show both markers with padding
            mapRef.current.fitBounds([userLocation, locationCoords], {
              padding: [50, 50]
            })

            // Add direction instructions
            const directionPopup = L.popup({
              closeButton: true,
              className: 'direction-popup'
            })
              .setLatLng(midPoint)
              .setContent(`
                <div class="text-sm">
                  <p><strong>Directions to ${locationInfo.name}:</strong></p>
                  <p>${locationInfo.direction}</p>
                  <p>Distance: ${distanceText}</p>
                </div>
              `)
              .addTo(mapRef.current)
          } else {
            mapRef.current.setView(locationCoords, 18)
          }
        }
      }

      // Handle map resize
      setTimeout(() => {
        mapRef.current?.invalidateSize()
      }, 100)
    }

    return () => {
      if (mapRef.current && !showMap) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [showMap, selectedLocation, userLocation, campusLocations])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)
    
    try {
      console.log('Sending message to backend:', inputValue)
      const response = await fetch('http://localhost:3001/api/campus-guide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: inputValue }),
      })

      if (!response.ok) {
        console.error('Failed to get response:', response.status, response.statusText)
        throw new Error(`Failed to get response: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('Received response:', data)
      
      const responseMsg: Message = {
        id: Date.now().toString(),
        text: data.message,
        isUser: false,
        location: data.location?.id,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, responseMsg])
      
      if (data.showMap && data.location) {
        setSelectedLocation(data.location.id)
        setShowMap(true)
      }
    } catch (error) {
      console.error('Error processing message:', error)
      
      // Fallback response with more specific error message
      const fallbackMsg: Message = {
        id: Date.now().toString(),
        text: "Sorry, I'm having trouble connecting to the server. Please make sure the backend is running on port 3001.",
        isUser: false,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, fallbackMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleLocationButtonClick = (locationId: string) => {
    const location = campusLocations.find(loc => loc.id === locationId)
    if (location) {
      setInputValue(`Where is the ${location.name.toLowerCase()}?`)
      // Auto-submit after a short delay
      setTimeout(() => {
        const event = new Event('submit') as unknown as React.FormEvent
        handleSendMessage(event)
      }, 100)
    }
  }

  const closeMap = () => {
    setShowMap(false)
    setSelectedLocation(null)
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Chat Interface */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${showMap ? 'w-1/2' : 'w-full'}`}>
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Chat Header */}
          <div className="bg-gray-800 p-4 border-b border-gray-700">
            <h1 className="text-xl font-semibold text-white">Campus Guide Assistant</h1>
          </div>

          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900"
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.isUser
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-100'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <span className="text-xs text-gray-400 mt-1 block">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 text-gray-100 rounded-lg p-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Access Buttons */}
          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <div className="flex flex-wrap gap-2">
              {campusLocations.map((location) => (
                <button
                  key={location.id}
                  onClick={() => {
                    setInputValue(`Where is ${location.name}?`)
                    handleSendMessage(new Event('submit') as unknown as React.FormEvent)
                  }}
                  className="px-3 py-1 bg-gray-700 text-white rounded-full text-sm hover:bg-gray-600 transition-colors"
                >
                  {location.name}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage(e)
                  }
                }}
                placeholder="Ask about campus locations..."
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
              <button
                onClick={(e) => {
                  e.preventDefault()
                  handleSendMessage(e)
                }}
                disabled={!inputValue.trim() || isLoading}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Map Interface */}
      {showMap && (
        <div className="w-1/2 bg-gray-900 relative transition-all duration-300">
          <button
            onClick={closeMap}
            className="absolute top-4 right-4 z-10 bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {collegeInfo && (
            <MapContainer
              center={[collegeInfo.lat, collegeInfo.lng]}
              zoom={15}
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {selectedLocation && (
                <Marker position={[campusLocations.find(loc => loc.id === selectedLocation)?.lat || 0, campusLocations.find(loc => loc.id === selectedLocation)?.lng || 0]}>
                  <Popup>
                    <div className="text-gray-800">
                      <h3 className="font-semibold">{campusLocations.find(loc => loc.id === selectedLocation)?.name}</h3>
                      <p className="text-sm text-gray-600">{campusLocations.find(loc => loc.id === selectedLocation)?.direction}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}
        </div>
      )}
    </div>
  )
}

export default App
