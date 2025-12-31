Aeko Python SDK
Use Cases

Analytics

Bots

Monitoring

AI agents

Installation
pip install aeko-sdk

Example
from aeko import sign, submit

signature = sign(message, private_key)
submit(message, signature)