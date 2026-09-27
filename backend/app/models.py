from sqlalchemy import Column,Integer,String,Enum,ForeignKey,Boolean,JSON
from app.database import Base
from sqlalchemy.orm import relationship
import enum


class Role(enum.Enum):
    admin = "admin"
    employee = "employee"


class SourceType(enum.Enum):
    slack = "slack"
    gmail = "gmail"
    gdrive = "gdrive"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer,primary_key=True,autoincrement=True)
    name = Column(String,nullable=False)
    email = Column(String,nullable=False,index=True,unique=True)
    google_refresh_token = Column(String)
    #password = Column(String,nullable=False)
    role = Column(Enum(Role),nullable=False,default=Role.employee)

    datasources = relationship("DataSources",back_populates="user")

class DataSources(Base):
    __tablename__ = "datasources"

    id = Column(Integer,primary_key=True,autoincrement=True)
    name = Column(String,nullable=True)
    mimeType = Column(String,nullable=False)
    type = Column(Enum(SourceType),nullable=False)
    unique_id = Column(String,nullable=False,unique=True,index=True)  #gmail id etc would be there
    content = Column(String)
    user_id = Column(Integer,ForeignKey("users.id"),index=True)

    user = relationship("User",back_populates="datasources")

class DataSourceVectors(Base):

    __tablename__ = "datasourcevector"

    id = Column(Integer,primary_key=True,autoincrement=True)
    embedding = Column(Integer)  # will change it to vector


class ChatActivity(Base):

    __tablename__ = "chat_activities"

    id = Column(Integer,primary_key=True,autoincrement=True)
    user_id = Column(Integer,ForeignKey("users.id"),index=True)
    title = Column(String,nullable=False)
    #date should also be there

class Activity(Base):

    __tablename__ = "activities"

    id = Column(Integer,primary_key=True,autoincrement=True)
    chat_id = Column(Integer,ForeignKey("chat_activities.id"),index=True)
    query = Column(String,nullable=False)
    answer = Column(String,nullable=False)
    order = Column(Integer,nullable=False)