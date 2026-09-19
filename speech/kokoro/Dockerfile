# The lecture voice on CPU. PyTorch comes from the CPU wheel index so the
# image is hundreds of megabytes and not gigabytes; the weights and every
# voice are fetched at build, so a deploy downloads nothing.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends espeak-ng ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# One allocator arena per rendering thread, and no more: the default
# grows to dozens, each keeping freed memory; two made the threads queue.
ENV HF_HOME=/models \
    TTS_VOICE=am_puck \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    MALLOC_ARENA_MAX=8

WORKDIR /app
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install -r requirements.txt

COPY voice.py server.py ./
RUN python -c "import voice; voice.bake_model('am_puck')"

EXPOSE 8880
CMD ["python", "server.py"]
