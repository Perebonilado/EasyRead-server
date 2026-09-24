"""
The lecture voice: Kokoro-82M with a pronunciation dictionary in front of
it, the same whether it runs on a Modal GPU (`modal/kokoro_service.py`) or
on Railway's CPUs (`speech/kokoro/server.py`). Everything the two share
lives here, so a change to the voice is made once.

A page comes as pieces, each at its own pace with a silence after it. Every
piece has the voice's dead air trimmed from both ends, every page is
mastered before it is encoded: a touch of presence, gentle compression,
loudness at the podcast standard. Heavy imports stay inside functions so
this file costs nothing to import where the model is absent.
"""

import asyncio
import json
import os
import re
import struct
import subprocess
import tempfile
import threading
import time

REPO = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24_000
# The longest page the service will take, in characters, pieces together.
INPUT_LIMIT = 8_000
# The most pieces a page may come as: a sentence each, on a long page.
PIECES_LIMIT = 120
# A breath between paragraphs inside one piece, in seconds.
BREATH = 0.25
# The most of a piece the model is handed at once. Its memory grows with
# the length of what it renders, so a long piece is rendered in runs of
# whole sentences, with a short pause between runs, the pause a reader
# takes anyway. A sentence longer than this is never cut.
RUN_CHARS = 300
RUN_GAP = 0.35
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
WARM_UP = "The lecture voice is warming up before the chapter begins."
# The tutor mode: a reply is spoken sentence by sentence as raw audio, the
# first sentence leaving before the last is rendered, with no mastering,
# since a learner mid-conversation is waiting on every word.
TUTOR_GAP = 0.3


def release_memory() -> None:
    """What the allocator kept after a render, handed back to the box; the model stays where it is."""
    try:
        import ctypes

        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


def bake_model(voice: str) -> None:
    """Weights, every voice and the English front-end's data, fetched once into the image."""
    from huggingface_hub import snapshot_download

    snapshot_download(REPO)
    import spacy

    try:
        spacy.load("en_core_web_sm")
    except Exception:
        spacy.cli.download("en_core_web_sm")
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="a", repo_id=REPO)
    list(pipeline("The image is being built.", voice=voice))


class Renderer:
    """One loaded model, rendering one page at a time under a lock."""

    def __init__(self, voice: str):
        self.voice = voice
        self.lock = threading.Lock()
        self.pipeline = None
        self.device = "cpu"

    def load(self) -> float:
        """The model onto the card, or the cores, and one line spoken so the first page pays nothing."""
        import torch
        from kokoro import KPipeline

        started = time.time()
        if torch.cuda.is_available():
            self.device = "cuda"
        else:
            torch.set_num_threads(threads())
        self.pipeline = KPipeline(lang_code="a", repo_id=REPO, device=self.device)
        self.render([(WARM_UP, 1.0, 0.0)], self.voice)
        return time.time() - started

    def render(self, pieces: list, voice: str, timestamps: bool = False, lead: float = 0.0):
        """The page as samples at 24 kHz, its length in seconds, where each piece starts, and, when asked, when each word is spoken; pieces are (text, speed, silence after), or with a voice of their own as a fourth, and `lead` seconds of quiet come first."""
        import numpy as np

        out = []
        starts = []
        words = []
        length = 0

        def add(chunk) -> None:
            nonlocal length
            out.append(chunk)
            length += len(chunk)

        with self.lock:
            if lead > 0:
                add(gap(lead))
            for item in pieces:
                text, speed, pause_after = item[0], item[1], item[2]
                # A story's character says their own line in their own voice.
                speaker = item[3] if len(item) > 3 and item[3] else voice
                begun = None
                for run in runs(text):
                    spoken = False
                    for result in self.pipeline(run, voice=speaker, speed=speed, split_pattern=r"\n+"):
                        if result.audio is None:
                            continue
                        piece, head = trimmed(result.audio.detach().cpu().numpy().astype(np.float32))
                        # A breath between the voice's own chunks of a run, a longer
                        # pause between runs; the same silences as ever.
                        if spoken:
                            add(gap(BREATH))
                        elif begun is not None:
                            add(gap(RUN_GAP))
                        if begun is None:
                            begun = length
                        if timestamps:
                            # The voice times each token from the start of its own
                            # chunk; the chunk lost `head` samples to the trim, and a
                            # last word's time runs on into the silence trimmed off
                            # its end, so every time is held inside the audio kept.
                            origin = (length - head) / SAMPLE_RATE
                            low = length / SAMPLE_RATE
                            high = (length + len(piece)) / SAMPLE_RATE
                            for token in result.tokens or []:
                                if token.start_ts is None or token.end_ts is None:
                                    continue
                                start = min(max(origin + token.start_ts, low), high)
                                end = min(max(origin + token.end_ts, start), high)
                                words.append((token.text, start, end))
                        add(piece)
                        spoken = True
                if begun is None:
                    continue
                starts.append(begun / SAMPLE_RATE)
                if pause_after > 0:
                    add(gap(pause_after))
        if not out:
            raise ValueError("nothing to say")
        audio = np.concatenate(out)
        return audio, len(audio) / SAMPLE_RATE, starts, words

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


def threads() -> int:
    """Cores for the model: TTS_THREADS, else the container's CPU quota, else every core it reports. A platform shows the host's cores while metering a few; forty-eight threads on eight cores load the model ten times slower."""
    asked = os.environ.get("TTS_THREADS")
    if asked:
        return max(1, int(asked))
    try:
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()
        if quota != "max":
            return max(1, round(int(quota) / int(period)))
    except (OSError, ValueError):
        pass
    return os.cpu_count() or 1


def mount(api, renderer: Renderer, token: str, where: str, mode: str = "lecture"):
    """The routes both homes answer, on a FastAPI app: health, a page as mp3 or wav, and in tutor mode a reply as streamed raw audio."""
    from fastapi import Header, HTTPException, Request
    from fastapi.responses import Response, StreamingResponse

    expected = f"Bearer {token}"

    @api.get("/health")
    def health():
        return {"status": "ok", "model": "kokoro-82m", "voice": renderer.voice, "gpu": where, "mode": mode, "version": 6}

    @api.post("/v1/audio/stream")
    async def stream(request: Request, authorization: str = Header(default="")):
        """A reply as raw 24 kHz 16-bit mono, one sentence at a time, the first out as soon as it is said."""
        if authorization != expected:
            raise HTTPException(status_code=401, detail="the key was refused")
        body = await request.json()
        voice = str(body.get("voice") or renderer.voice)
        try:
            renderer.check_voice(voice)
            # As pieces, each at its pace with its silence after, the way a
            # page comes; or as one text, cut at sentences, at one speed.
            if body.get("pieces") is not None:
                parts = read_pieces(body)
            else:
                speed = min(2.0, max(0.5, float(body.get("speed") or 1.0)))
                text = str(body.get("input") or "").strip()
                if not text:
                    raise ValueError("input is empty")
                if len(text) > INPUT_LIMIT:
                    raise ValueError(f"input is over {INPUT_LIMIT} characters")
                said = sentences(text)
                parts = [(sentence, speed, 0.0 if i == len(said) - 1 else TUTOR_GAP) for i, sentence in enumerate(said)]
            # A beat of quiet before the first word: a person turning to you.
            lead = min(PAUSE_LIMIT, max(0.0, float(body.get("lead") or 0.0)))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))

        async def pieces():
            if lead > 0:
                yield _pcm(gap(lead))
            for text, speed, pause_after, *_ in parts:
                audio, _seconds, _starts, _words = await asyncio.to_thread(renderer.render, [(text, speed, 0.0)], voice)
                yield _pcm(audio)
                if pause_after > 0:
                    yield _pcm(gap(pause_after))
            release_memory()

        return StreamingResponse(pieces(), media_type="audio/pcm", headers={"x-sample-rate": str(SAMPLE_RATE)})

    @api.post("/v1/audio/speech")
    async def speech(request: Request, authorization: str = Header(default="")):
        """A page as mp3 or wav. With "timestamps": true the answer is JSON: the audio in base64, where each piece starts, and when each word is spoken."""
        if authorization != expected:
            raise HTTPException(status_code=401, detail="the key was refused")
        body = await request.json()
        voice = str(body.get("voice") or renderer.voice)
        try:
            renderer.check_voice(voice)
            pieces = read_pieces(body)
            for piece in pieces:
                if piece[3]:
                    renderer.check_voice(piece[3])
            # Quiet before the first word: the stage opens on its own first.
            lead = min(PAUSE_LIMIT, max(0.0, float(body.get("lead") or 0.0)))
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error))
        fmt = str(body.get("response_format") or "mp3").lower()
        if fmt not in ("mp3", "wav"):
            raise HTTPException(status_code=400, detail="response_format must be mp3 or wav")
        timestamps = bool(body.get("timestamps"))
        # The delivery note and the language, if sent, are read by no one here.
        started = time.time()
        try:
            audio, seconds, starts, words = await asyncio.to_thread(renderer.render, pieces, voice, timestamps, lead)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
        data = await asyncio.to_thread(to_mp3 if fmt == "mp3" else to_wav, audio)
        release_memory()
        rendered = time.time() - started
        if timestamps:
            import base64

            from fastapi.responses import JSONResponse

            # JSON, not a header: a long page's words outgrow a header's limit.
            return JSONResponse(
                {
                    "audio": base64.b64encode(data).decode("ascii"),
                    "mime_type": "audio/mpeg" if fmt == "mp3" else "audio/wav",
                    "seconds": round(seconds, 3),
                    "render_seconds": round(rendered, 2),
                    "piece_starts": [round(start, 3) for start in starts],
                    "words": [[text, round(start, 3), round(end, 3)] for text, start, end in words],
                }
            )
        return Response(
            content=data,
            media_type="audio/mpeg" if fmt == "mp3" else "audio/wav",
            headers={
                "x-audio-seconds": f"{seconds:.2f}",
                "x-render-seconds": f"{rendered:.2f}",
                # Where each piece starts, so a card can land in the pause before its sentence.
                "x-piece-starts": ",".join(f"{start:.3f}" for start in starts),
            },
        )

    return api


def sentences(text: str) -> list:
    """A reply cut at sentence ends, each said on its own so the first is heard before the rest exist."""
    return [part for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part]


def runs(text: str) -> list:
    """A piece as runs of whole sentences, each at most RUN_CHARS long where the sentences allow it."""
    if len(text) <= RUN_CHARS:
        return [text]
    out = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if current and len(current) + 1 + len(sentence) > RUN_CHARS:
            out.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}" if current else sentence
    if current:
        out.append(current)
    return out


def trimmed(audio):
    """The voice's dead air cut from both ends, a short margin kept, and the edges faded so nothing clicks; with how many samples came off the front."""
    import numpy as np

    floor = 10 ** (TRIM_DB / 20)
    loud = np.flatnonzero(np.abs(audio) > floor)
    if not len(loud):
        return audio[: int(SAMPLE_RATE * HEAD_KEEP)], 0
    start = max(0, int(loud[0]) - int(SAMPLE_RATE * HEAD_KEEP))
    stop = min(len(audio), int(loud[-1]) + int(SAMPLE_RATE * TAIL_KEEP))
    piece = audio[start:stop].copy()
    fade_in = min(len(piece), int(SAMPLE_RATE * FADE_IN))
    fade_out = min(len(piece), int(SAMPLE_RATE * FADE_OUT))
    if fade_in:
        piece[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out:
        piece[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return piece, start


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
    """The page as (text, speed, silence after, voice or None) from `pieces`, or from a plain `input`."""
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
        # A voice of its own for this piece, checked by the caller.
        own = str(item.get("voice") or "").strip() or None
        pieces.append((text, speed, pause_after, own))
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
