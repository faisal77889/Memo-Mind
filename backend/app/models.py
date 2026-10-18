from sqlalchemy import Column,Integer,String,Enum,ForeignKey,Boolean,JSON,Computed, Index
from app.database import Base
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import TSVECTOR
import enum
from pgvector.sqlalchemy import Vector


class Role(enum.Enum):
    admin = "admin"
    employee = "employee"


class SourceType(enum.Enum):
    slack = "slack"
    gmail = "gmail"
    gdrive = "gdrive"



class Status(enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


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
    thread_id = Column(String,nullable = True,index=True)
    unique_id = Column(String,nullable=False,unique=True,index=True)  #gmail id etc would be there
    content = Column(String,nullable=True)
    status = Column(Enum(Status),default=Status.pending)
    user_id = Column(Integer,ForeignKey("users.id"),index=True)

    user = relationship("User",back_populates="datasources")

# add data source pages also

# alter table document_pages add column tsv tsvector 
# generated as always (to_tsvector('english',coalesce('chunk',''))) stored

class DocumentPages(Base):
    __tablename__ = "document_pages"

    id = Column(Integer,primary_key=True, autoincrement=True)
    meta_data = Column(String,nullable=True)
    data_source_id = Column(Integer,ForeignKey("datasources.id",ondelete="CASCADE"),index=True)
    chunk = Column(String,nullable=False)
    tsv = Column(
            TSVECTOR,
            Computed("to_tsvector('english',COALESCE(chunk,''))",persisted=True)
        )
    embedding = Column(Vector(768))
    __table_args__ = (
        Index("idx_document_chunks_tsv", "tsv", postgresql_using="gin"),
    )

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