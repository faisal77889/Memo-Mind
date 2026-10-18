from typing import List, Optional, TypedDict
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, Text
from sqlalchemy.orm import Session
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.tools import tool
from app.database import get_db
from app.models import DocumentPages
from langchain.agents import create_agent
from langsmith import Client
from app.database import SessionMaker




router = APIRouter(tags=["search"])

client = Client()

prompt = client.pull_prompt("hwchase17/react",dangerously_pull_public_prompt=True)

# print(prompt)
# 1. Fixed LangGraph State schema (use TypedDict, not StateGraph)
class AgentState(TypedDict):
    messages: str

embedding = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001",output_dimensionality=768)
llm = ChatGoogleGenerativeAI(model="gemini-3.8-flash")



# 2. Text-based search function
@tool
def textBasedSearch(search_text: str, limit: int = 10):
    """ Takes search_text as input and provides the text matched result by full text based search in the database"""
    parsed_query = func.plainto_tsquery('english', search_text)
    # 2. Replace '&' with '|' so it becomes: 'syllabus' | 'advanc' | 'rag'
    # This allows partial keyword matching
    db = SessionMaker()
    or_query = func.to_tsquery(
        'english', 
        func.replace(func.cast(parsed_query, Text), '&', '|')
    )
    # 3. Calculate rank (chunks with more matching words rank higher)
    relevance_score = func.ts_rank_cd(DocumentPages.tsv, or_query).label("relevance_score")
    # 4. Filter and sort
    results = (
        db.query(
            DocumentPages.id,
            DocumentPages.chunk,
            DocumentPages.meta_data,
            DocumentPages.data_source_id,
            relevance_score
        )
        .filter(DocumentPages.tsv.op("@@")(or_query))
        .order_by(relevance_score.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "chunk": r.chunk,
            "meta_data": r.meta_data,
            "data_source_id": r.data_source_id,
            "relevance_score": float(r.relevance_score),
        }
        for r in results
    ]


@tool
def semantic_search(query: str, limit: int = 5):
    """
    Takes query string from input and returns the list of documents based on the cosine similarity between the query vector and vector stored in the database
    """
    # 1. Calculate cosine distance
    db = SessionMaker()
    query_vector = embedding.embed_query(query)
    distance = DocumentPages.embedding.cosine_distance(query_vector).label("distance")
    
    # 2. Convert to similarity score: (1 - distance)
    similarity = (1 - distance).label("similarity_score")
    # 3. Query: sort by lowest distance (most similar first)

    results = (
        db.query(
            DocumentPages.id,
            DocumentPages.chunk,
            DocumentPages.meta_data,
            DocumentPages.data_source_id,
            similarity
        )
        .order_by(distance.asc())  # Smallest distance = highest similarity
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "chunk": r.chunk,
            "meta_data": r.meta_data,
            "data_source_id": r.data_source_id,
            "similarity_score": round(float(r.similarity_score), 4),
        }
        for r in results
    ]


agent = create_agent(model=llm,tools=[textBasedSearch,semantic_search],system_prompt=prompt.template)


# input = {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
result = agent.invoke({"messages": [{"role": "user", "content": "Summarize the email sent from apollo team to me ?"}]})
# 5. Get the final answer
# result["messages"] contains the full step-by-step history (User -> AI tool call -> Tool result -> Final AI response)
final_answer = result["messages"][-1].content
print(final_answer)
# 3. FastAPI Endpoint
# @router.get("/abc")
# def text_search(
#     q: str = Query("most people", description="Search query string"),
#     db: Session = Depends(get_db)
# ):
#     return {
#         "hello" : "hello"
#     }
    # result = textBasedSearch(search_text=q, db=db)
    # return {"query": q, "count": len(result), "results": result}


# @router.get("/semantic-search")
# def sem_search(
#     q: str = Query("most people", description="Search query string"),
#     db: Session = Depends(get_db)
# ):
#     return {
#             "hello" : "hello"
#         }
    # result = semantic_search(q, db=db)
    # return {"query": q, "count": len(result), "results": result}