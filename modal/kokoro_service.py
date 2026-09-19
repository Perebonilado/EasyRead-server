"""
Lecture narration on Kokoro, a small open voice with a pronunciation
dictionary in front of it, on a rented GPU billed by the second.

One container loads the model once and takes pages a few at a time; the
card's work is done one page at a time under a lock, since a page is under
a second. The worker posts one page, as one text or as pieces each at its
own pace with a silence after it, and gets the mp3 back on the same
connection. Modal scales the container to zero between runs.

The voice itself, the trimming, the pauses, the mastering and the two
routes, lives in `speech/kokoro/voice.py`, shared with the CPU service on
Railway that voices learner uploads. This file is the Modal wrapper.

    modal deploy modal/kokoro_service.py                  # put it behind a URL
    modal run modal/kokoro_service.py --path scripts.txt  # bench: audio seconds per wall second, and the price

    TTS_GPU=T4 modal deploy ...                           # try a cheaper card
    TTS_VOICE=bm_george modal deploy ...                  # another default voice

The secret `easiread-tts` holds TTS_TOKEN; the server checks it as a
bearer token and never prints it.
"""

import asyncio
import os
import socket
import sys
import time
from pathlib import Path

import modal

SHARED = Path(__file__).resolve().parent.parent / "speech" / "kokoro"
sys.path.insert(0, str(SHARED))
import voice as lecture_voice  # noqa: E402

GPU = os.environ.get("TTS_GPU", "L4")
VOICE = os.environ.get("TTS_VOICE", "am_puck")
# Pages one container takes at once; the card sees them one at a time.
INTAKE = 8
# What Modal bills a card for, per hour, for the bench's arithmetic.
USD_PER_GPU_HOUR = {"T4": 0.59, "L4": 0.80, "A10": 1.10, "L40S": 1.95, "A100": 2.10, "H100": 3.95}
OPENAI_USD_PER_AUDIO_HOUR = 0.90
MODEL_DIR = "/models"

app = modal.App(os.environ.get("TTS_APP_NAME", "easiread-kokoro"))


def bake_model() -> None:
    lecture_voice.bake_model(VOICE)


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("espeak-ng", "ffmpeg")
    .pip_install("kokoro==0.9.4", "soundfile==0.13.1", "fastapi[standard]==0.115.12")
    .env({"HF_HOME": MODEL_DIR, "TTS_VOICE": VOICE, "TTS_GPU": GPU})
    # The shared voice, into the image before the bake so the bake can import it.
    .add_local_file(SHARED / "voice.py", "/root/voice.py", copy=True)
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
        self.renderer = lecture_voice.Renderer(VOICE)
        took = self.renderer.load()
        print(f"kokoro ready on {self.renderer.device} ({GPU}) in {took:.1f}s, voice {VOICE}")

    @modal.asgi_app()
    def serve(self):
        from fastapi import FastAPI

        return lecture_voice.mount(FastAPI(), self.renderer, os.environ["TTS_TOKEN"], GPU)


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
                return lecture_voice.wav_seconds(data)

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
