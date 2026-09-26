from fastapi import FastAPI
from app.api import admin

app = FastAPI(
    title="Corporate-synapse-backend",
    description="Backend of corporate synapse project",
    version="1.0.0"
)


app.include_router(admin.router)



