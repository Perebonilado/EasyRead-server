"""
Lecture narration on Kokoro, a small open voice with a pronunciation
dictionary in front of it, on a rented GPU billed by the second.

One container loads the model once and takes pages a few at a time; the
card's work is done one page at a time under a lock, since a page is under
a second. The worker posts one page, as one text or as pieces each at its
own pace with a silence after it, and gets the mp3 back on the same
connection. Every page is mastered before it is encoded: a touch of
presence, gentle compression, loudness at the podcast standard. Modal
scales the container to zero between runs.

    modal deploy modal/kokoro_service.py                  # put it behind a URL
    modal run modal/kokoro_service.py --path scripts.txt  # bench: audio seconds per wall second, and the price

    TTS_GPU=T4 modal deploy ...                           # try a cheaper card
    TTS_VOICE=bm_george modal deploy ...                  # another default voice

The secret `easiread-tts` holds TTS_TOKEN; the server checks it as a
bearer token and never prints it.
"""

import asyncio
import os
import re
import socket
import struct
import subprocess
import tempfile
import threading
import time

import modal

REPO = "hexgrad/Kokoro-82M"
GPU = os.environ.get("TTS_GPU", "L4")
VOICE = os.environ.get("TTS_VOICE", "am_puck")
SAMPLE_RATE = 24_000
# Pages one container takes at once; the card sees them one at a time.
INTAKE = 8
# The longest page the service will take, in characters, pieces together.
INPUT_LIMIT = 8_000
# The most pieces a page may come as: a sentence each, on a long page.
PIECES_LIMIT = 120
# A breath between paragraphs inside one piece, in seconds.
BREATH = 0.25
# The longest silence a piece may ask for after itself, in seconds.
PAUSE_LIMIT = 3.0
# The voice pads every piece with dead air, about a quarter second before
# and two thirds after. It is trimmed to a short natural margin so the
# only silence on a page is the silence the pace model placed.
TRIM_DB = -45.0
HEAD_KEEP = 0.05
TAIL_KEEP = 0.08
FADE_IN = 0.008
FADE_OUT = 0.04
# A whisper of room tone under every gap, so a pause is a person waiting
# and not a cut. The master lifts it by about thirteen decibels, so it is
# set well below hearing here; set to 0 to switch it off.
ROOM_TONE_DB = -78.0
# The master: presence above 3.5 kHz, a gentle squeeze, loudness at -16 LUFS.
MASTER = "highpass=f=70,treble=g=3:f=3500:w=0.6,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120:makeup=2"
LOUDNESS = "I=-16:TP=-1.5:LRA=9"
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
        self.render([("The lecture voice is warming up before the chapter begins.", 1.0, 0.0)], VOICE)
        print(f"kokoro ready on {device} ({GPU}) in {time.time() - started:.1f}s, voice {VOICE}")

    def render(self, pieces: list, voice: str):
        """The page as samples at 24 kHz, and its length in seconds; pieces are (text, speed, silence after)."""
        import numpy as np

        out = []
        with self.lock:
            for text, speed, pause_after in pieces:
                said = []
                for result in self.pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
                    if result.audio is None:
                        continue
                    if said:
                        said.append(gap(BREATH))
                    said.append(trimmed(result.audio.detach().cpu().numpy().astype(np.float32)))
                if not said:
                    continue
                out.extend(said)
                if pause_after > 0:
                    out.append(gap(pause_after))
        if not out:
            raise ValueError("nothing to say")
        audio = np.concatenate(out)
        return audio, len(audio) / SAMPLE_RATE

    def check_voice(self, voice: str) -> None:
        """A voice is one name, or names joined by commas for an even blend; anything else is refused."""
        from huggingface_hub import hf_hub_download

        if ":" in voice:
            raise ValueError("a weighted blend is not supported; join names with commas for an even one")
        for name in voice.split(","):
            if not re.fullmatch(r"[abefhijpz][fm]_[a-z]+", name):
                raise ValueError(f"no voice named {name}")
            try:
                hf_hub_download(REPO, f"voices/{name}.pt", local_files_only=True)
            except Exception:
                raise ValueError(f"no voice named {name}")

    @modal.asgi_app()
    def serve(self):
        from fastapi import FastAPI, Header, HTTPException, Request
        from fastapi.responses import Response

        api = FastAPI()
        expected = f"Bearer {os.environ['TTS_TOKEN']}"

        @api.get("/health")
        def health():
            return {"status": "ok", "model": "kokoro-82m", "voice": VOICE, "gpu": GPU, "version": 3}

        @api.post("/v1/audio/speech")
        async def speech(request: Request, authorization: str = Header(default="")):
            if authorization != expected:
                raise HTTPException(status_code=401, detail="the key was refused")
            body = await request.json()
            voice = str(body.get("voice") or VOICE)
            try:
                self.check_voice(voice)
                pieces = read_pieces(body)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
            fmt = str(body.get("response_format") or "mp3").lower()
            if fmt not in ("mp3", "wav"):
                raise HTTPException(status_code=400, detail="response_format must be mp3 or wav")
            # The delivery note and the language, if sent, are read by no one here.
            started = time.time()
            try:
                audio, seconds = await asyncio.to_thread(self.render, pieces, voice)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
            data = await asyncio.to_thread(to_mp3 if fmt == "mp3" else to_wav, audio)
            return Response(
                content=data,
                media_type="audio/mpeg" if fmt == "mp3" else "audio/wav",
                headers={
                    "x-audio-seconds": f"{seconds:.2f}",
                    "x-render-seconds": f"{time.time() - started:.2f}",
                },
            )

        return api


def trimmed(audio):
    """The voice's dead air cut from both ends, a short margin kept, and the edges faded so nothing clicks."""
    import numpy as np

    floor = 10 ** (TRIM_DB / 20)
    loud = np.flatnonzero(np.abs(audio) > floor)
    if not len(loud):
        return audio[: int(SAMPLE_RATE * HEAD_KEEP)]
    start = max(0, int(loud[0]) - int(SAMPLE_RATE * HEAD_KEEP))
    stop = min(len(audio), int(loud[-1]) + int(SAMPLE_RATE * TAIL_KEEP))
    piece = audio[start:stop].copy()
    fade_in = min(len(piece), int(SAMPLE_RATE * FADE_IN))
    fade_out = min(len(piece), int(SAMPLE_RATE * FADE_OUT))
    if fade_in:
        piece[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out:
        piece[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return piece


def gap(seconds: float):
    """Silence with a whisper of room tone under it, or plain silence when the tone is off."""
    import numpy as np

    count = int(SAMPLE_RATE * seconds)
    if count <= 0:
        return np.zeros(0, dtype=np.float32)
    if ROOM_TONE_DB >= 0:
        return np.zeros(count, dtype=np.float32)
    level = 10 ** (ROOM_TONE_DB / 20)
    return (np.random.default_rng(count).standard_normal(count) * level).astype(np.float32)


def read_pieces(body: dict) -> list:
    """The page as (text, speed, silence after) triples, from `pieces` or from a plain `input`."""
    raw = body.get("pieces")
    if raw is None:
        text = str(body.get("input") or "").strip()
        if not text:
            raise ValueError("input is empty")
        raw = [{"text": text, "speed": body.get("speed"), "pause_after": 0}]
    if not isinstance(raw, list) or not raw:
        raise ValueError("pieces must be a list with at least one piece")
    if len(raw) > PIECES_LIMIT:
        raise ValueError(f"a page may come as at most {PIECES_LIMIT} pieces")
    pieces = []
    total = 0
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each piece is an object with text, speed and pause_after")
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        total += len(text)
        try:
            speed = min(2.0, max(0.5, float(item.get("speed") or 1.0)))
            pause_after = min(PAUSE_LIMIT, max(0.0, float(item.get("pause_after") or 0.0)))
        except (TypeError, ValueError):
            raise ValueError("speed and pause_after must be numbers")
        pieces.append((text, speed, pause_after))
    if not pieces:
        raise ValueError("input is empty")
    if total > INPUT_LIMIT:
        raise ValueError(f"input is over {INPUT_LIMIT} characters")
    return pieces


def _pcm(audio) -> bytes:
    import numpy as np

    return (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()


def _ffmpeg(args: list, pcm: bytes) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", *args],
        input=pcm,
        capture_output=True,
        check=True,
    )


def master_filter(pcm: bytes) -> str:
    """The master with loudness measured first, so it is applied as a plain gain and never pumps."""
    import json

    measured = _ffmpeg(["-af", f"{MASTER},loudnorm={LOUDNESS}:print_format=json", "-f", "null", "-"], pcm)
    text = measured.stderr.decode(errors="ignore")
    start = text.rfind("{")
    if start < 0:
        return f"{MASTER},loudnorm={LOUDNESS}"
    stats = json.loads(text[start:])
    return (
        f"{MASTER},loudnorm={LOUDNESS}"
        f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}"
        f":measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}"
        f":offset={stats['target_offset']}:linear=true"
    )


def to_mp3(audio) -> bytes:
    """Written to a file, not a pipe, so the header carries the true length and a player seeks right."""
    pcm = _pcm(audio)
    with tempfile.NamedTemporaryFile(suffix=".mp3") as out:
        _ffmpeg(["-af", master_filter(pcm), "-codec:a", "libmp3lame", "-q:a", "2", "-y", out.name], pcm)
        out.seek(0)
        return out.read()


def to_wav(audio) -> bytes:
    pcm = _pcm(audio)
    done = _ffmpeg(["-af", master_filter(pcm), "-codec:a", "pcm_s16le", "-f", "wav", "pipe:1"], pcm)
    return done.stdout


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
