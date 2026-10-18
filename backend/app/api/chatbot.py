from langgraph.graph import StateGraph, START, END
from langchain_groq import ChatGroq
from typing import TypedDict, Annotated, List
from app.models import DocumentPages
from app.database import SessionMaker
from langchain.tools import tool
from sqlalchemy import func, Text
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, AIMessageChunk
from langgraph.graph.message import add_messages
from langgraph.prebuilt.tool_node import ToolNode, tools_condition
from langgraph.checkpoint.memory import InMemorySaver

embedding = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001",output_dimensionality=768)

llm = ChatGroq(model="qwen/qwen3.8-27b")



@tool
def textBasedSearch(search_text: str, limit: int = 5):
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
    if not results :
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

tools = [semantic_search,textBasedSearch]

llm_with_tools = llm.bind_tools(tools)

class ChatMessages(TypedDict):
    messages : Annotated[List[BaseMessage],add_messages]

def ChatLLM(state : ChatMessages) -> ChatMessages:
    query = state["messages"]

    result = llm_with_tools.invoke(query)

    return {"messages" : [result]}

tool_node = ToolNode(tools)

graph = StateGraph(ChatMessages)

graph.add_node("chat_node",ChatLLM)
graph.add_node("tools",tool_node)


graph.add_edge(START,"chat_node")
graph.add_conditional_edges("chat_node",tools_condition)
graph.add_edge("tools","chat_node")

checkpointer = InMemorySaver()

chat_bot = graph.compile(checkpointer=checkpointer)
config = {"configurable": {"thread_id": "terminal_session_1"}}

# while(True):
#     query = input("Enter the query : \n")
#     if query.strip().lower() == "exit":
#         break

#     message = HumanMessage(content=query)
#     for message_chunk, metadata in chat_bot.stream({"messages" : [message]},config=config,stream_mode="messages"):
#         print(message_chunk.content,end="",flush=True)
    
#     print("\n")
    


async def chat_bot_fn(query : str):
    message = HumanMessage(content=query)
    content = ""
    async for message_chunk, metadata in chat_bot.astream({"messages" : [message]},config=config,stream_mode="messages"):
        if (
            isinstance(message_chunk, AIMessageChunk)
            and message_chunk.content
        ):  
            print(message_chunk.content,end="",flush=True)
            yield message_chunk.content




# create a llm
# bind it with tools
# make tool and tool node
# add nodes in the langgraph workflow
# define the flow of the node 
# loop in for rag

