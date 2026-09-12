"""
Lecture narration on Kokoro, a small open voice with a pronunciation
dictionary in front of it, on a rented GPU billed by the second.

One container loads the model once and takes pages a few at a time; the
card's work is done one page at a time under a lock, since a page is under
a second. The worker posts one page and gets the mp3 back on the same
connection, the same request shape the Qwen service takes. Modal scales
the container to zero between runs.

    modal deploy modal/kokoro_service.py                  # put it behind a URL
    modal run modal/kokoro_service.py --path scripts.txt  # bench: audio seconds per wall second, and the price

    TTS_GPU=T4 modal deploy ...                           # try a cheaper card
    TTS_VOICE=bm_george modal deploy ...                  # another default voice

The secret `easiread-tts` holds TTS_TOKEN; the server checks it as a
bearer token and never prints it.
"""

import asyncio
import io
import os
import socket
import struct
import subprocess
import threading
import time

import modal

REPO = "hexgrad/Kokoro-82M"
GPU = os.environ.get("TTS_GPU", "L4")
VOICE = os.environ.get("TTS_VOICE", "am_michael")
SAMPLE_RATE = 24_000
# Pages one container takes at once; the card sees them one at a time.
INTAKE = 8
# The longest page the service will take, in characters.
INPUT_LIMIT = 5_000
# A breath between paragraphs, in seconds.
BREATH = 0.25
# What Modal bills a card for, per hour, for the bench's arithmetic.
USD_PER_GPU_HOUR = {"T4": 0.59, "L4": 0.80, "A10": 1.10, "L40S": 1.95, "A100": 2.10, "H100": 3.95}
OPENAI_USD_PER_AUDIO_HOUR = 0.90
MODEL_DIR = "/models"

app = modal.App(os.environ.get("TTS_APP_NAME", "easiread-kokoro"))


def bake_model() -> None:
    """Weights, every voice and the English front-end's data, into the image."""
    from huggingface_hub import snapshot_download

    snapshot_download(REPO)
    import spacy

    try:
        spacy.load("en_core_web_sm")
    except Exception:
        spacy.cli.download("en_core_web_sm")
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="a", repo_id=REPO)
    list(pipeline("The image is being built.", voice=VOICE))


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("espeak-ng", "ffmpeg")
    .pip_install("kokoro==0.9.4", "soundfile==0.13.1", "fastapi[standard]==0.115.12")
    .env({"HF_HOME": MODEL_DIR, "TTS_VOICE": VOICE, "TTS_GPU": GPU})
    .run_function(bake_model)
)


@app.cls(
    image=image,
    gpu=GPU,
    secrets=[modal.Secret.from_name("easiread-tts")],
    # Five minutes of warmth after the last page: a run that pauses finds
    # the card still there, and a cold start is seconds anyway.
    scaledown_window=300,
    timeout=600,
    max_containers=3,
)
@modal.concurrent(max_inputs=INTAKE)
class Speech:
    @modal.enter()
    def load(self):
        import torch
        from kokoro import KPipeline

        started = time.time()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.pipeline = KPipeline(lang_code="a", repo_id=REPO, device=device)
        self.lock = threading.Lock()
        self.render("The lecture voice is warming up before the chapter begins.", VOICE, 1.0)
        print(f"kokoro ready on {device} ({GPU}) in {time.time() - started:.1f}s, voice {VOICE}")

    def render(self, text: str, voice: str, speed: float):
        """The page as samples at 24 kHz, and its length in seconds."""
        import numpy as np

        pieces = []
        breath = np.zeros(int(SAMPLE_RATE * BREATH), dtype=np.float32)
        with self.lock:
            for result in self.pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
                if result.audio is None:
                    continue
                if pieces:
                    pieces.append(breath)
                pieces.append(result.audio.detach().cpu().numpy().astype(np.float32))
        if not pieces:
            raise ValueError("nothing to say")
        audio = np.concatenate(pieces)
        return audio, len(audio) / SAMPLE_RATE

    @modal.asgi_app()
    def serve(self):
        from fastapi import FastAPI, Header, HTTPException, Request
        from fastapi.responses import Response

        api = FastAPI()
        expected = f"Bearer {os.environ['TTS_TOKEN']}"

        @api.get("/health")
        def health():
            return {"status": "ok", "model": "kokoro-82m", "voice": VOICE, "gpu": GPU}

        @api.post("/v1/audio/speech")
        async def speech(request: Request, authorization: str = Header(default="")):
            if authorization != expected:
                raise HTTPException(status_code=401, detail="the key was refused")
            body = await request.json()
            text = str(body.get("input") or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail="input is empty")
            if len(text) > INPUT_LIMIT:
                raise HTTPException(status_code=400, detail=f"input is over {INPUT_LIMIT} characters")
            voice = str(body.get("voice") or VOICE)
            try:
                speed = min(2.0, max(0.5, float(body.get("speed") or 1.0)))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="speed must be a number")
            fmt = str(body.get("response_format") or "mp3").lower()
            if fmt not in ("mp3", "wav"):
                raise HTTPException(status_code=400, detail="response_format must be mp3 or wav")
            # The delivery note and the language, if sent, are read by no one here.
            started = time.time()
            try:
                audio, seconds = await asyncio.to_thread(self.render, text, voice, speed)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
            except FileNotFoundError:
                raise HTTPException(status_code=400, detail=f"no voice named {voice}")
            data = to_mp3(audio) if fmt == "mp3" else to_wav(audio)
            return Response(
                content=data,
                media_type="audio/mpeg" if fmt == "mp3" else "audio/wav",
                headers={
                    "x-audio-seconds": f"{seconds:.2f}",
                    "x-render-seconds": f"{time.time() - started:.2f}",
                },
            )

        return api


def to_mp3(audio) -> bytes:
    import numpy as np

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    done = subprocess.run(
        [
            "ffmpeg", "-loglevel", "error",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
            "-codec:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "pipe:1",
        ],
        input=pcm,
        capture_output=True,
        check=True,
    )
    return done.stdout


def to_wav(audio) -> bytes:
    import soundfile

    buffer = io.BytesIO()
    soundfile.write(buffer, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def wav_seconds(data: bytes) -> float:
    """Length of a WAV file from its header; the bench asks for WAV so it can measure."""
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return 0.0
    offset = 12
    rate = channels = width = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = struct.unpack("<I", data[offset + 4 : offset + 8])[0]
        if chunk_id == b"fmt ":
            _, channels, rate, _, _, bits = struct.unpack("<HHIIHH", data[offset + 8 : offset + 24])
            width = bits // 8
        elif chunk_id == b"data":
            if not (rate and channels and width):
                return 0.0
            return size / (rate * channels * width)
        offset += 8 + size + (size % 2)
    return 0.0


@app.local_entrypoint()
def bench(
    path: str = "modal/opioids-chapter.txt",
    url: str = "",
    in_flight: str = "4,8,16",
):
    """
    Fires every page of a text file at the service with N pages in flight and
    reports seconds of audio per wall second, and what an hour of audio costs
    on this card against OpenAI. One container is billed for wall clock, so
    the cost is wall clock times the hourly rate.

    Pages are paragraphs separated by a blank line. The token is read from
    MODAL_TTS_TOKEN or /tmp/easiread-tts/.token and never printed.
    """
    import aiohttp

    pages = [p.strip() for p in open(path).read().split("\n\n") if len(p.strip()) > 40]
    token = os.environ.get("MODAL_TTS_TOKEN") or open("/tmp/easiread-tts/.token").read().strip()
    base = (url or Speech().serve.get_web_url()).rstrip("/")
    rate = USD_PER_GPU_HOUR.get(GPU, 1.0)
    headers = {"authorization": f"Bearer {token}", "content-type": "application/json"}

    async def speak(session: aiohttp.ClientSession, gate: asyncio.Semaphore, text: str) -> float:
        body = {"input": text, "voice": VOICE, "response_format": "wav"}
        async with gate:
            async with session.post(f"{base}/v1/audio/speech", json=body, headers=headers) as answer:
                data = await answer.read()
                if answer.status != 200:
                    raise RuntimeError(f"{answer.status}: {data[:200]!r}")
                return wav_seconds(data)

    # IPv4 only: this Mac's IPv6 route to Modal stalls for seconds on
    # every new connection, which curl and the worker's fetch sidestep on
    # their own but aiohttp does not.
    def connector() -> "aiohttp.TCPConnector":
        return aiohttp.TCPConnector(family=socket.AF_INET, limit=64)

    async def run(width: int) -> tuple[float, float]:
        gate = asyncio.Semaphore(width)
        timeout = aiohttp.ClientTimeout(total=3600)
        async with aiohttp.ClientSession(timeout=timeout, connector=connector()) as session:
            started = time.time()
            seconds = await asyncio.gather(*(speak(session, gate, page) for page in pages))
            return sum(seconds), time.time() - started

    async def warm() -> float:
        started = time.time()
        timeout = aiohttp.ClientTimeout(total=1200)
        async with aiohttp.ClientSession(timeout=timeout, connector=connector()) as session:
            await speak(session, asyncio.Semaphore(1), "Warming up the lecture voice before the chapter begins.")
        return time.time() - started

    cold = asyncio.run(warm())
    print(f"first call answered in {cold:.0f}s (kokoro-82m, voice {VOICE}, on {GPU})")
    print(f"{len(pages)} pages, {sum(len(p) for p in pages)} characters\n")
    print(f"{'in flight':>9}  {'audio':>7}  {'wall':>6}  {'audio-s/s':>9}  {'$/audio-hour':>12}  {'this deck':>9}  {'at OpenAI':>9}")
    for width in [int(w) for w in in_flight.split(",") if w.strip()]:
        audio, wall = asyncio.run(run(width))
        factor = audio / max(wall, 0.01)
        per_hour = rate / factor
        print(
            f"{width:>9}  {audio / 60:>5.1f}m  {wall:>5.0f}s  {factor:>9.2f}  "
            f"${per_hour:>11.3f}  ${wall / 3600 * rate:>8.3f}  ${audio / 3600 * OPENAI_USD_PER_AUDIO_HOUR:>8.3f}"
        )
