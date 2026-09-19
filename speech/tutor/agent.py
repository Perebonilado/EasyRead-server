"""
The live tutor on our own line: a LiveKit agent that joins the learner's
room with the brief the API wrote into its dispatch, listens with
faster-whisper, thinks with an OpenAI text model, speaks with Kokoro, and
forwards every tool call to the browser, which runs it as it always has.

    LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET   the room
    OPENAI_API_KEY, TUTOR_LLM_MODEL                    the brain
    TUTOR_VOICE_URL, TUTOR_VOICE_TOKEN                 the voice
    WHISPER_MODEL                                      the ears

    python agent.py download-files    fetch the hearing models (at build)
    python agent.py start             serve
    python agent.py dev               serve with reload, for a laptop
"""

import asyncio
import json
import logging
import os

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    cli,
    function_tool,
)
from livekit.plugins import openai, silero
from livekit.plugins.turn_detector.english import EnglishModel

from ears import Ears
from voice import Voice

log = logging.getLogger("tutor")

AGENT_NAME = "easiread-tutor"
# The RPCs the browser answers, as `livekit-call.ts` registers them.
TOOL_RPC = "tutor.tool"
CONTEXT_RPC = "tutor.context"
CONTEXT_TOPIC = "tutor.context"
# A tool's answer must come back inside this, page turns included.
TOOL_TIMEOUT = 20.0

server = AgentServer()


def browser_tools(tools: list, learner: str, room: rtc.Room) -> list:
    """Each tool in the brief, as a function the model may call, whose body is one RPC to the learner's browser."""
    made = []
    for spec in tools:
        name = spec["name"]

        async def run(raw_arguments: dict, context: RunContext, _name: str = name) -> str:
            payload = json.dumps({"name": _name, "args": json.dumps(raw_arguments or {})})
            try:
                answer = await room.local_participant.perform_rpc(
                    destination_identity=learner, method=TOOL_RPC, payload=payload, response_timeout=TOOL_TIMEOUT
                )
            except Exception as error:
                log.warning("tool %s failed: %s", _name, error)
                return json.dumps({"error": "the screen did not answer"})
            return answer or "{}"

        made.append(
            function_tool(
                run,
                raw_schema={
                    "name": name,
                    "description": spec.get("description", ""),
                    "parameters": spec.get("parameters") or {"type": "object", "properties": {}},
                },
            )
        )
    return made


class Tutor(Agent):
    def __init__(self, brief: dict, learner: str, room: rtc.Room) -> None:
        super().__init__(instructions=brief["instructions"], tools=browser_tools(brief.get("tools") or [], learner, room))
        self.base = brief["instructions"]

    async def read_page(self, page: str) -> None:
        """The page the learner is on, folded under the brief, as the OpenAI line did with session.update."""
        await self.update_instructions(self.base + page)


@server.rtc_session(agent_name=AGENT_NAME)
async def tutor(ctx: JobContext) -> None:
    brief = json.loads(ctx.job.metadata or "{}")
    if not brief.get("instructions"):
        log.error("no brief in the dispatch; leaving")
        return
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    learner = participant.identity
    log.info("room %s: learner %s, %d tools", ctx.room.name, learner, len(brief.get("tools") or []))

    agent = Tutor(brief, learner, ctx.room)
    session = AgentSession(
        stt=Ears(),
        llm=openai.LLM(model=os.environ.get("TUTOR_LLM_MODEL", "gpt-4.1-mini")),
        tts=Voice(brief.get("voice") or "am_puck", float(brief.get("speed") or 1.0)),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(turn_detection=EnglishModel()),
    )

    # Page turns arrive as data on their topic.
    @ctx.room.on("data_received")
    def on_data(packet: rtc.DataPacket) -> None:
        if packet.topic == CONTEXT_TOPIC and packet.participant and packet.participant.identity == learner:
            asyncio.create_task(agent.read_page(packet.data.decode(errors="ignore")))

    await session.start(room=ctx.room, agent=agent)

    # The page the learner is on, asked for once before the first word.
    try:
        page = await ctx.room.local_participant.perform_rpc(
            destination_identity=learner, method=CONTEXT_RPC, payload="", response_timeout=5.0
        )
        if page:
            await agent.read_page(page)
    except Exception as error:
        log.warning("no page from the browser yet: %s", error)

    await session.generate_reply(instructions="Greet the learner in one short breath and begin.")


if __name__ == "__main__":
    cli.run_app(server)
