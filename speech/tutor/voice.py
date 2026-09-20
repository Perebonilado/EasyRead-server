"""
The tutor's voice: Kokoro on the tutor voice service (`speech/kokoro` in
tutor mode), as a LiveKit TTS plugin. One request per reply; the service
streams raw 24 kHz audio sentence by sentence and the first sentence is
heard before the last is rendered.

    TUTOR_VOICE_URL    the service's address (private on Railway)
    TUTOR_VOICE_TOKEN  its bearer token; never printed
"""

import os
import re

import httpx
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    tts,
    utils,
)

SAMPLE_RATE = 24_000
# The lecture's own gaps and pace, as `delivery.ts` keeps them, sent in the
# brief so a reply is delivered the way a page is: a breath after a
# sentence, longer after an idea, longer still after a question, and a
# beat of quiet before the first word.
DEFAULT_DELIVERY = {
    "speed": 0.9,
    "gaps": {"sentence": 0.6, "perTenWords": 0.1, "sentenceMax": 0.9, "idea": 1.2, "question": 1.8},
    "lead": 0.5,
    "pronunciations": [],
}
# Words a sentence ends with that close a thought, so the pause after is an idea's.
THOUGHT_ENDS = ("that is why", "so that", "which is why", "in short", "that's it", "that is it")


def shape(text: str, delivery: dict) -> tuple:
    """A reply as pieces (text, speed, silence after) at the lecture's pace, and the beat before it."""
    speed = float(delivery.get("speed") or DEFAULT_DELIVERY["speed"])
    gaps = {**DEFAULT_DELIVERY["gaps"], **(delivery.get("gaps") or {})}
    said = spoken(text, delivery.get("pronunciations") or [])
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", said) if s.strip()]
    pieces = []
    for i, sentence in enumerate(parts):
        last = i == len(parts) - 1
        if last:
            pause = 0.0
        elif sentence.endswith("?"):
            pause = gaps["question"]
        elif any(sentence.lower().rstrip(".!").endswith(end) for end in THOUGHT_ENDS) or parts[i + 1][:1].isupper() and parts[i + 1].split(" ")[0] in ("So", "Now", "Next", "Then", "That"):
            pause = gaps["idea"]
        else:
            words = len(sentence.split())
            pause = min(gaps["sentenceMax"], gaps["sentence"] + gaps["perTenWords"] * (words // 10))
        pieces.append({"text": sentence, "speed": speed, "pause_after": round(pause, 2)})
    return pieces, float(delivery.get("lead", DEFAULT_DELIVERY["lead"]))


def spoken(text: str, pronunciations: list) -> str:
    """The document's own way of saying its terms, applied whole-word, case blind."""
    for term, said in pronunciations:
        if not term:
            continue
        text = re.sub(r"(?<![\w-])" + re.escape(term) + r"(?![\w-])", said, text, flags=re.IGNORECASE)
    return text


class Voice(tts.TTS):
    def __init__(self, voice: str, delivery: dict | None = None) -> None:
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False), sample_rate=SAMPLE_RATE, num_channels=1)
        self.voice = voice
        self.delivery = {**DEFAULT_DELIVERY, **(delivery or {})}
        self.base = os.environ["TUTOR_VOICE_URL"].rstrip("/")
        self.token = os.environ["TUTOR_VOICE_TOKEN"]
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> tts.ChunkedStream:
        return Reply(tts=self, input_text=text, conn_options=conn_options)


class Reply(tts.ChunkedStream):
    def __init__(self, *, tts: Voice, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self.voice_service = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = utils.shortuuid()
        output_emitter.initialize(request_id=request_id, sample_rate=SAMPLE_RATE, num_channels=1, mime_type="audio/pcm")
        pieces, lead = shape(self._input_text, self.voice_service.delivery)
        if not pieces:
            output_emitter.flush()
            return
        try:
            async with self.voice_service.client.stream(
                "POST",
                f"{self.voice_service.base}/v1/audio/stream",
                headers={"authorization": f"Bearer {self.voice_service.token}", "content-type": "application/json"},
                json={"pieces": pieces, "lead": lead, "voice": self.voice_service.voice},
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode(errors="ignore")[:200]
                    raise APIStatusError(message=f"the voice refused the reply: {body}", status_code=response.status_code, request_id=request_id, body=body)
                async for chunk in response.aiter_bytes():
                    if chunk:
                        output_emitter.push(chunk)
            output_emitter.flush()
        except httpx.TimeoutException:
            raise APITimeoutError() from None
        except APIStatusError:
            raise
        except Exception as error:
            raise APIConnectionError() from error
