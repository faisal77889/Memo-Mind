from langgraph.graph import StateGraph, START , END
from typing import TypedDict, List, Annotated
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage,HumanMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import InMemorySaver
from langchain_groq import ChatGroq
from dotenv import load_dotenv
import os
from groq import Groq
load_dotenv(override=True)


class ChatState(TypedDict):
    message : Annotated[List[BaseMessage],add_messages]


api_key = os.environ["GROQ_API_KEY"]
client = Groq(api_key=api_key)
for models in client.models.list().data:
    print(models.id)
print(api_key)
llm = ChatGroq(model="qwen/qwen3.8-27b",api_key=api_key)
def chat_bot(state : ChatState) -> ChatState:
    messages = state['message']
    result = llm.invoke(messages)
    return {"message" : [result]}

check_pointer = InMemorySaver()
    
graph = StateGraph(ChatState)

graph.add_node('chat_node',chat_bot)

graph.add_edge(START,'chat_node')
graph.add_edge('chat_node',END)

workflow = graph.compile(checkpointer=check_pointer)

config1 = {"configurable": {"thread_id": "2"}}


while(True) :
    query = input("Ask the question \n")
    if(query.lower() == 'exit'):
        break
    initial_state = {
    'message': [HumanMessage(content=query)]
    }   
    result = workflow.invoke(initial_state,config=config1)
    print(result['message'][-1].content)






    