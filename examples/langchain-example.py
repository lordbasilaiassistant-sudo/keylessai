"""
KeylessAI + LangChain — free LLM for your chains.
Zero API keys. Zero signup.

Install:
    pip install langchain langchain-openai
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI


def main() -> None:
    llm = ChatOpenAI(
        base_url="https://keylessai.thryx.workers.dev/v1",
        api_key="not-needed",
        model="openai-fast",
        streaming=True,
        temperature=0.7,
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a terse, witty assistant."),
            ("user", "{question}"),
        ]
    )

    chain = prompt | llm

    print("[KeylessAI] streaming response:\n")
    for chunk in chain.stream({"question": "Explain server-sent events to a backend dev in 2 sentences."}):
        print(chunk.content, end="", flush=True)
    print()


if __name__ == "__main__":
    main()
