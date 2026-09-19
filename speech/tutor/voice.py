"""
The tutor's voice: Kokoro on the tutor voice service (`speech/kokoro` in
tutor mode), as a LiveKit TTS plugin. One request per reply; the service
streams raw 24 kHz audio sentence by sentence and the first sentence is
heard before the last is rendered.

    TUTOR_VOICE_URL    the service's address (private on Railway)
    TUTOR_VOICE_TOKEN  its bearer token; never printed
"""

import os

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


class Voice(tts.TTS):
    def __init__(self, voice: str, speed: float = 1.0) -> None:
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False), sample_rate=SAMPLE_RATE, num_channels=1)
        self.voice = voice
        self.speed = speed
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
        try:
            async with self.voice_service.client.stream(
                "POST",
                f"{self.voice_service.base}/v1/audio/stream",
                headers={"authorization": f"Bearer {self.voice_service.token}", "content-type": "application/json"},
                json={"input": self._input_text, "voice": self.voice_service.voice, "speed": self.voice_service.speed},
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
