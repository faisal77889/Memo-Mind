from fastapi import FastAPI
from app.api import admin
from fastapi.middleware.cors import CORSMiddleware
from app.api import agent

app = FastAPI(
    title="Corporate-synapse-backend",
    description="Backend of corporate synapse project",
    version="1.0.0"
)


origins = [
    "http://localhost:5173",  
    "https://your-production-site.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       
    allow_credentials=True,      
    allow_methods=["*"],         
    allow_headers=["*"],       
)


app.include_router(admin.router)
app.include_router(agent.router)



