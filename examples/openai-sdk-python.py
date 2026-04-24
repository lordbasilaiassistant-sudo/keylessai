"""
KeylessAI + OpenAI Python SDK — drop-in.
pip install openai
"""

from openai import OpenAI

client = OpenAI(
    base_url="https://keylessai.thryx.workers.dev/v1",
    api_key="not-needed",
)

stream = client.chat.completions.create(
    model="openai-fast",
    messages=[
        {"role": "system", "content": "You respond in a maximum of 3 sentences."},
        {"role": "user", "content": "Why would I use a keyless LLM endpoint?"},
    ],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)
print()
