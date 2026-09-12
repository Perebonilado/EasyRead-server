"""
Lecture narration for a school's catalogue, on a rented GPU billed by the second.

One container runs vLLM-Omni's own speech server for Qwen3-TTS and takes many
pages at once. The engine batches them continuously: a page joins the batch
the moment it arrives and leaves the moment it is done, so the card never
waits for a batch to fill or for the longest page to finish. The worker posts
one page and gets the mp3 back on the same connection. Modal scales the
container to zero between runs.

    modal deploy modal/tts_service.py                  # put it behind a URL
    modal run modal/tts_service.py --path scripts.txt  # bench: seconds of audio per wall second, and the price

    TTS_GPU=L40S modal deploy ...                      # try another card
    TTS_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice ... # or the bigger voice
    TTS_EAGER=true ...                                 # no CUDA graphs, for comparison

The secret `easiread-tts` holds TTS_TOKEN; the engine takes it as its API key
and the server sends it as a bearer token.
"""

import asyncio
import json
import os
import struct
import subprocess
import time
import urllib.request

import modal

# Apache 2.0. The 1.7B checkpoint is the quality step up; only the id changes.
MODEL = os.environ.get("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
GPU = os.environ.get("TTS_GPU", "L4")
EAGER = os.environ.get("TTS_EAGER", "false") == "true"
VOICE = "ryan"
PORT = 8000
# Pages one container takes at once; the engine batches them itself.
INTAKE = 32
# The longest delivery note the engine will take, in characters.
INSTRUCTIONS_LIMIT = 2_000
# What Modal bills a card for, per hour, for the bench's arithmetic.
USD_PER_GPU_HOUR = {"L4": 0.80, "A10": 1.10, "L40S": 1.95, "A100": 2.10, "H100": 3.95}
OPENAI_USD_PER_AUDIO_HOUR = 0.90

app = modal.App("easiread-tts")

# The engine's own release image, pinned. HF_HOME on the volume so a cold
# start reads the weights from disk rather than from Hugging Face.
image = modal.Image.from_registry("vllm/vllm-omni:v0.28.0").env(
    {
        "HF_HOME": "/weights",
        # The engine compiles the model and captures its graphs on every
        # start and would throw the result away with the container. Kept on
        # the volume, the next start reads them instead of making them.
        "VLLM_CACHE_ROOT": "/weights/vllm-cache",
        "TORCHINDUCTOR_CACHE_DIR": "/weights/inductor-cache",
        "TRITON_CACHE_DIR": "/weights/triton-cache",
        "VLLM_LOGGING_LEVEL": "INFO",
    }
)

weights = modal.Volume.from_name("easiread-tts-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu=GPU,
    volumes={"/weights": weights},
    secrets=[modal.Secret.from_name("easiread-tts")],
    # Ten minutes of warmth after the last page: a run that pauses, because
    # the writer is behind or the connection blinked, finds the card still
    # there. Ten idle minutes cost about one cold start and save nine.
    scaledown_window=600,
    # One request's ceiling. A page is seconds on a warm card.
    timeout=600,
    # The worker keeps two containers busy; a large run may add a third.
    max_containers=3,
)
@modal.concurrent(max_inputs=INTAKE)
class Speech:
    @modal.web_server(PORT, startup_timeout=900)
    def serve(self):
        """Starts the engine, waits until it answers, voices one sentence, then takes traffic."""
        started = time.time()
        command = [
            "vllm", "serve", MODEL,
            "--omni",
            "--host", "0.0.0.0",
            "--port", str(PORT),
            "--trust-remote-code",
            # A style's delivery note is a few hundred characters; the
            # engine refuses anything over 500 unless told otherwise.
            "--tts-max-instructions-length", str(INSTRUCTIONS_LIMIT),
        ]
        if EAGER:
            command.append("--enforce-eager")
        # The key goes in by environment, not on the command line: the
        # engine prints its non-default arguments to the log at start.
        subprocess.Popen(command, env={**os.environ, "VLLM_API_KEY": os.environ["TTS_TOKEN"]})

        self._wait_for_health(deadline=started + 840)
        ready = time.time() - started
        weights.commit()

        # The first page of a run should not pay the first-call path.
        warm_started = time.time()
        self._speak("The lecture voice is warming up before the chapter begins.")
        print(
            f"engine ready in {ready:.0f}s, warm-up in {time.time() - warm_started:.1f}s "
            f"({MODEL} on {GPU}{', eager' if EAGER else ''})"
        )

    @staticmethod
    def _wait_for_health(deadline: float) -> None:
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=5) as answer:
                    if answer.status == 200:
                        return
            except Exception:
                pass
            time.sleep(2)
        raise RuntimeError("the speech engine did not come up in time")

    @staticmethod
    def _speak(text: str) -> bytes:
        body = json.dumps(
            {"input": text, "voice": VOICE, "language": "English", "response_format": "mp3"}
        ).encode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/v1/audio/speech",
            data=body,
            headers={
                "content-type": "application/json",
                "authorization": f"Bearer {os.environ['TTS_TOKEN']}",
            },
        )
        with urllib.request.urlopen(request, timeout=300) as answer:
            return answer.read()


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
    in_flight: str = "8,16,32",
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
        body = {"input": text, "voice": VOICE, "language": "English", "response_format": "wav"}
        async with gate:
            async with session.post(f"{base}/v1/audio/speech", json=body, headers=headers) as answer:
                data = await answer.read()
                if answer.status != 200:
                    raise RuntimeError(f"{answer.status}: {data[:200]!r}")
                return wav_seconds(data)

    async def run(width: int) -> tuple[float, float]:
        gate = asyncio.Semaphore(width)
        timeout = aiohttp.ClientTimeout(total=3600)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            started = time.time()
            seconds = await asyncio.gather(*(speak(session, gate, page) for page in pages))
            return sum(seconds), time.time() - started

    async def warm() -> float:
        started = time.time()
        timeout = aiohttp.ClientTimeout(total=1200)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            await speak(session, asyncio.Semaphore(1), "Warming up the lecture voice before the chapter begins.")
        return time.time() - started

    cold = asyncio.run(warm())
    print(f"first call answered in {cold:.0f}s ({MODEL} on {GPU}{', eager' if EAGER else ''})")
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
