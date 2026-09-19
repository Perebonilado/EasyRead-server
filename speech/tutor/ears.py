"""
The tutor's ears: faster-whisper on CPU, as a LiveKit STT plugin.

Not streaming: the session's voice activity detector hands over each
finished utterance and this turns it into text. A small English model in
int8 hears a sentence in well under a second on a few cores, which is
most of the tutor's delay and the price of owning the ears.

    WHISPER_MODEL   small.en (default), base.en for quicker, medium.en for sharper
    WHISPER_THREADS cores for the model; the container's count when unset
"""

import asyncio
import os

from livekit import rtc
from livekit.agents import APIConnectOptions, stt
from livekit.agents.types import NOT_GIVEN, NotGivenOr

MODEL = os.environ.get("WHISPER_MODEL", "small.en")


def threads() -> int:
    asked = os.environ.get("WHISPER_THREADS")
    if asked:
        return max(1, int(asked))
    try:
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()
        if quota != "max":
            return max(1, round(int(quota) / int(period)))
    except (OSError, ValueError):
        pass
    return os.cpu_count() or 1


def bake() -> None:
    """The model's weights fetched once, into the image."""
    from faster_whisper import WhisperModel

    WhisperModel(MODEL, device="cpu", compute_type="int8")


class Ears(stt.STT):
    def __init__(self) -> None:
        super().__init__(capabilities=stt.STTCapabilities(streaming=False, interim_results=False))
        from faster_whisper import WhisperModel

        self.whisper = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=threads())
        self.lock = asyncio.Lock()

    async def _recognize_impl(
        self,
        buffer: rtc.AudioFrame | list[rtc.AudioFrame],
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        import io

        import numpy as np

        frame = rtc.combine_audio_frames(buffer)
        # Whisper wants 16 kHz mono float samples; the room gives 48 kHz.
        pcm = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
        if frame.num_channels > 1:
            pcm = pcm.reshape(-1, frame.num_channels).mean(axis=1)
        if frame.sample_rate != 16_000:
            count = int(len(pcm) * 16_000 / frame.sample_rate)
            pcm = np.interp(np.linspace(0, len(pcm), count, endpoint=False), np.arange(len(pcm)), pcm).astype(np.float32)

        def hear() -> str:
            segments, _info = self.whisper.transcribe(pcm, language="en", beam_size=1, vad_filter=False, condition_on_previous_text=False)
            return " ".join(segment.text.strip() for segment in segments).strip()

        async with self.lock:
            text = await asyncio.to_thread(hear)
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language="en", text=text)],
        )
