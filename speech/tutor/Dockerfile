# The live tutor: a LiveKit agent with open ears (faster-whisper on CPU),
# an OpenAI text brain and Kokoro's voice from the tutor voice service.
# The hearing models (Silero, the turn detector, whisper) are fetched at
# build so a deploy downloads nothing.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV HF_HOME=/models \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL=small.en

WORKDIR /app
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install -r requirements.txt

COPY agent.py ears.py voice.py ./
RUN python agent.py download-files \
    && python -c "import ears; ears.bake()"

CMD ["python", "agent.py", "start"]
