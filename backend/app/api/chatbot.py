import os
import uuid
import asyncio
import logging
from typing import TypedDict, Annotated, List, Optional
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger(__name__)

from langgraph.graph import StateGraph, START, END
from langchain_groq import ChatGroq
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, AIMessageChunk
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import func, Text

from app.models import DocumentPages
from app.database import SessionMaker

embedding = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
    output_dimensionality=768
)

llm = ChatGroq(
    model="qwen/qwen3.8-27b",
    streaming=True
)


from langchain.tools import tool

@tool
def textBasedSearch(search_text: str, limit: int = 5):
    """Takes search_text as input and provides the text matched result by full text based search in the database"""
    parsed_query = func.plainto_tsquery('english', search_text)
    db = SessionMaker()
    try:
        or_query = func.to_tsquery(
            'english', 
            func.replace(func.cast(parsed_query, Text), '&', '|')
        )
        relevance_score = func.ts_rank_cd(DocumentPages.tsv, or_query).label("relevance_score")
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
        if not results:
            return "no relevant information found in the database"
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
    finally:
        db.close()


@tool
def semantic_search(query: str, limit: int = 5):
    """
    Takes query string from input and returns the list of documents based on the cosine similarity between the query vector and vector stored in the database
    """
    db = SessionMaker()
    try:
        query_vector = embedding.embed_query(query)
        distance = DocumentPages.embedding.cosine_distance(query_vector).label("distance")
        similarity = (1 - distance).label("similarity_score")
        results = (
            db.query(
                DocumentPages.id,
                DocumentPages.chunk,
                DocumentPages.meta_data,
                DocumentPages.data_source_id,
                similarity
            )
            .order_by(distance.asc())
            .limit(limit)
            .all()
        )
        if not results:
            return "No relevant information is found in the database"
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
    finally:
        db.close()


tools = [semantic_search, textBasedSearch]
llm_with_tools = llm.bind_tools(tools)


class ChatMessages(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]


async def ChatLLM(state: ChatMessages) -> ChatMessages:
    query = state["messages"]
    result = await llm_with_tools.ainvoke(query)
    return {"messages": [result]}


tool_node = ToolNode(tools)

graph = StateGraph(ChatMessages)
graph.add_node("chat_node", ChatLLM)
graph.add_node("tools", tool_node)

graph.add_edge(START, "chat_node")
graph.add_conditional_edges("chat_node", tools_condition)
graph.add_edge("tools", "chat_node")

checkpointer = InMemorySaver()
chat_bot = graph.compile(checkpointer=checkpointer)


async def chat_bot_fn(query: str, thread_id: Optional[str] = None):
    """
    Runs the RAG conversational graph and streams back real-time text chunks.
    """
    if not thread_id:
        thread_id = str(uuid.uuid4())
    session_config = {"configurable": {"thread_id": thread_id}}
    message = HumanMessage(content=query)

    try:
        async for message_chunk, metadata in chat_bot.astream(
            {"messages": [message]},
            config=session_config,
            stream_mode="messages"
        ):
            # Only stream assistant answer content from the chat_node
            if (
                metadata.get("langgraph_node") == "chat_node"
                and isinstance(message_chunk, (AIMessage, AIMessageChunk))
                and message_chunk.content
            ):
                content = message_chunk.content
                if isinstance(content, str) and content:
                    words = content.split(" ")
                    for i in range(0, len(words), 2):
                        chunk_str = " ".join(words[i:i+2])
                        if i + 2 < len(words):
                            chunk_str += " "
                        yield chunk_str
                        await asyncio.sleep(0.015)
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, str):
                            yield item
                        elif isinstance(item, dict) and "text" in item:
                            yield item["text"]
                        await asyncio.sleep(0.015)
    except Exception as e:
        logger.error(f"Error streaming response from chatbot: {e}", exc_info=True)
        yield f"\n\n[Error generating response: {str(e)}]"


