from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv
import os



load_dotenv(override=True)


sqlalchemy_db_url = os.getenv("DB_URL") or ""


engine = create_engine(url=sqlalchemy_db_url)


SessionMaker = sessionmaker(autoflush=False,bind=engine)


Base = declarative_base()

def get_db():
    db = SessionMaker()
    try:
        yield db
    finally:
        db.close()