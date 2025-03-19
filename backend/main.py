from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import Optional, Dict, Any
import logging
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('backend.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configure Gemini API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY not found in environment variables")
    raise ValueError("GOOGLE_API_KEY is required")

# Define the model name
MODEL_NAME = "models/gemini-1.5-flash"

logger.info("Initializing Gemini API")
genai.configure(api_key=GOOGLE_API_KEY)

async def test_gemini_connection():
    try:
        logger.info("Testing Gemini API connection...")
        logger.info(f"Attempting to use model: {MODEL_NAME}")
        
        # Initialize the model
        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content("Hello")
        logger.info("Gemini API connection test successful")
        return True
    except Exception as e:
        logger.error(f"Gemini API connection test failed: {str(e)}")
        return False

# Initialize model after testing
model = None  # Will be initialized after testing connection

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS middleware configured")

# Sample campus locations data
CAMPUS_LOCATIONS = [
    {
        "id": "main_gate",
        "name": "Main Gate",
        "lat": 21.0060,
        "lng": 79.0490,
        "direction": "north"
    },
    {
        "id": "library",
        "name": "Central Library",
        "lat": 21.0050,
        "lng": 79.0480,
        "direction": "central"
    },
    {
        "id": "cafeteria",
        "name": "Cafeteria",
        "lat": 21.0040,
        "lng": 79.0470,
        "direction": "south"
    }
]

# Sample college information
COLLEGE_INFO = {
    "id": 1,
    "name": "St. Vincent Pallotti College of Engineering and Technology",
    "lat": 21.0047,
    "lng": 79.0476
}

class Query(BaseModel):
    query: str

@app.get("/api/locations")
async def get_locations():
    logger.info("GET /api/locations - Request received")
    try:
        logger.info(f"Returning {len(CAMPUS_LOCATIONS)} locations")
        return CAMPUS_LOCATIONS
    except Exception as e:
        logger.error(f"Error in get_locations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/college")
async def get_college_info():
    logger.info("GET /api/college - Request received")
    try:
        logger.info("Returning college information")
        return COLLEGE_INFO
    except Exception as e:
        logger.error(f"Error in get_college_info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/campus-guide")
async def process_query(query: Query):
    logger.info(f"POST /api/campus-guide - Request received with query: {query.query}")
    try:
        if not model:
            raise HTTPException(status_code=503, detail="Gemini API not initialized")
            
        # Create a prompt for Gemini
        prompt = f"""You are a helpful campus guide assistant for St. Vincent Pallotti College of Engineering and Technology.
        The user asked: {query.query}
        
        Available locations on campus:
        {CAMPUS_LOCATIONS}
        
        Please provide a helpful and witty response. If the user is asking about a specific location, 
        include the location ID in your response. Make your response engaging and friendly.
        If the user is asking for directions, indicate that a map should be shown by including 'showMap: true' in your response.
        """
        
        logger.info("Generating response using Gemini")
        # Generate response using Gemini
        response = model.generate_content(prompt)
        response_text = response.text
        logger.info(f"Generated response: {response_text}")
        
        # Check if the response mentions any location
        location_id = None
        show_map = False
        
        for location in CAMPUS_LOCATIONS:
            if location["name"].lower() in response_text.lower():
                location_id = location["id"]
                show_map = True
                logger.info(f"Location found in response: {location['name']}")
                break
        
        result = {
            "message": response_text,
            "location": {"id": location_id} if location_id else None,
            "showMap": show_map
        }
        logger.info(f"Returning response: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error in process_query: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up the application")
    logger.info(f"Server will run on port 3001")
    logger.info("Available endpoints:")
    logger.info("- GET /api/locations")
    logger.info("- GET /api/college")
    logger.info("- POST /api/campus-guide")
    
    # Test Gemini API connection
    connection_success = await test_gemini_connection()
    if not connection_success:
        logger.error("Failed to connect to Gemini API. Please check your API key and internet connection.")
        raise Exception("Gemini API connection failed")
    
    # Initialize the model globally after successful connection
    global model
    model = genai.GenerativeModel(MODEL_NAME)
    logger.info(f"Initialized model: {MODEL_NAME}")

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting server...")
    uvicorn.run(app, host="0.0.0.0", port=3001) 