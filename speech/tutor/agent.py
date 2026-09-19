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
# The moves the lecture's ask makes, each one RPC from the browser.
TURN_START = "turn.start"
TURN_END = "turn.end"
TURN_CANCEL = "turn.cancel"
SAY_DIRECT = "say.direct"
SAY_NOTE = "say.note"
SAY_STOP = "say.stop"

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


class Moves:
    """
    What the lecture's ask does to the tutor, one method per move, so the
    browser's RPCs and a test both reach the same code. Turns are manual
    here: the learner holds the mic, and nothing is heard or answered
    until the browser says the hold began and ended.
    """

    def __init__(self, session: AgentSession, agent: "Tutor") -> None:
        self.session = session
        self.agent = agent

    async def turn_start(self) -> str:
        """The hold began: the tutor is cut off, the last turn forgotten, the ears open."""
        await self.session.interrupt(force=True)
        self.session.clear_user_turn()
        self.session.input.set_audio_enabled(True)
        return "ok"

    async def turn_end(self) -> str:
        """The hold ended: the ears close and what was heard becomes the turn. The answer is asked for separately, since the browser may first add what the book says about it."""
        self.session.input.set_audio_enabled(False)
        self.session.commit_user_turn(skip_reply=True)
        return "ok"

    async def turn_cancel(self) -> str:
        """A tap: nothing was said, nothing is sent."""
        self.session.input.set_audio_enabled(False)
        self.session.clear_user_turn()
        return "ok"

    async def say_direct(self, text: str = "") -> str:
        """The tutor speaks now: from a line the lecture hands it, or from what has been said and noted."""
        if text:
            self.session.generate_reply(instructions=text)
        else:
            self.session.generate_reply()
        return "ok"

    async def say_note(self, text: str, role: str = "system") -> str:
        """A note the tutor reads and keeps in mind without speaking."""
        chat = self.agent.chat_ctx.copy()
        chat.add_message(role="user" if role == "user" else "system", content=text)
        await self.agent.update_chat_ctx(chat)
        return "ok"

    async def say_stop(self) -> str:
        """The tutor is cut off, whatever it was saying or about to say."""
        await self.session.interrupt(force=True)
        return "ok"


def register_moves(room: rtc.Room, moves: Moves) -> None:
    """The six moves as RPCs on the tutor's own participant, payloads as JSON."""

    def rpc(method, handler):
        async def handle(data: rtc.RpcInvocationData) -> str:
            try:
                body = json.loads(data.payload) if data.payload else {}
            except ValueError:
                body = {}
            try:
                return await handler(**body)
            except TypeError as error:
                raise rtc.RpcError(1400, f"bad arguments for {method}: {error}")

        room.local_participant.register_rpc_method(method, handle)

    rpc(TURN_START, moves.turn_start)
    rpc(TURN_END, moves.turn_end)
    rpc(TURN_CANCEL, moves.turn_cancel)
    rpc(SAY_DIRECT, moves.say_direct)
    rpc(SAY_NOTE, moves.say_note)
    rpc(SAY_STOP, moves.say_stop)


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
    try:
        participant = await ctx.wait_for_participant()
    except RuntimeError as error:
        # The room closed before anyone came: a session abandoned at the door.
        log.info("room %s closed before a learner arrived: %s", ctx.room.name, error)
        return
    learner = participant.identity
    log.info("room %s: learner %s, %d tools", ctx.room.name, learner, len(brief.get("tools") or []))

    # The lecture's ask holds the mic: turns are the browser's to start
    # and end. The conversation lets the tutor hear when a turn ends.
    manual = brief.get("turnDetection") == "off"
    agent = Tutor(brief, learner, ctx.room)
    session = AgentSession(
        stt=Ears(),
        llm=openai.LLM(model=os.environ.get("TUTOR_LLM_MODEL", "gpt-4.1-mini")),
        tts=Voice(brief.get("voice") or "am_puck", float(brief.get("speed") or 1.0)),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(turn_detection="manual" if manual else EnglishModel()),
    )
    moves = Moves(session, agent)
    register_moves(ctx.room, moves)

    # Page turns arrive as data on their topic.
    @ctx.room.on("data_received")
    def on_data(packet: rtc.DataPacket) -> None:
        if packet.topic == CONTEXT_TOPIC and packet.participant and packet.participant.identity == learner:
            asyncio.create_task(agent.read_page(packet.data.decode(errors="ignore")))

    await session.start(room=ctx.room, agent=agent)
    if manual:
        # Nothing is heard until the learner holds the mic.
        session.input.set_audio_enabled(False)

    # The page the learner is on, asked for once before the first word.
    try:
        page = await ctx.room.local_participant.perform_rpc(
            destination_identity=learner, method=CONTEXT_RPC, payload="", response_timeout=5.0
        )
        if page:
            await agent.read_page(page)
    except Exception as error:
        log.warning("no page from the browser yet: %s", error)

    if not manual:
        await session.generate_reply(instructions="Greet the learner in one short breath and begin.")


if __name__ == "__main__":
    cli.run_app(server)
