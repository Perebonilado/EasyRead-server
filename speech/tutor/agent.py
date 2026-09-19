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
import re

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
    llm,
    utils,
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
# A tool the model wrote as words instead of calling, which this model
# does now and then after a sentence: "functions.lecture_resume()".
TEXT_CALL = re.compile(r"\s*functions\.(\w+)\(([^)]*)\)[.!]?\s*")
MARKER = "functions."
# What the brief gets on top, so the model calls its tools rather than naming them.
TOOL_RULE = "\n\nUse your tools by calling them, never by writing their names as words."
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
        """The hold ended: the ears close and what was heard becomes the turn. The answer is asked for separately, since the browser may first add what the book says about it. Not done until the words are in: the browser's next move waits on this one, and a reply asked for before the transcript landed would answer the turn before."""
        self.session.input.set_audio_enabled(False)
        try:
            heard = await self.session.commit_user_turn(skip_reply=True, transcript_timeout=6.0)
        except Exception as error:
            log.warning("the turn's words did not arrive: %s", error)
            return "silent"
        log.info("heard: %s", (heard or "")[:160])
        return "ok" if heard else "silent"

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
            log.info("move %s %s", method, json.dumps(body)[:120])
            try:
                return await handler(**body)
            except TypeError as error:
                log.warning("move %s refused: %s", method, error)
                raise rtc.RpcError(1400, f"bad arguments for {method}: {error}")
            except Exception as error:
                log.exception("move %s failed: %s", method, error)
                raise rtc.RpcError(1500, f"{method} failed: {error}")

        room.local_participant.register_rpc_method(method, handle)

    rpc(TURN_START, moves.turn_start)
    rpc(TURN_END, moves.turn_end)
    rpc(TURN_CANCEL, moves.turn_cancel)
    rpc(SAY_DIRECT, moves.say_direct)
    rpc(SAY_NOTE, moves.say_note)
    rpc(SAY_STOP, moves.say_stop)


def split_text_calls(text: str, names: set, final: bool) -> tuple:
    """Text to say now, text held back in case a tool's name is forming, and the tools the model wrote as words."""
    calls = []
    while True:
        found = TEXT_CALL.search(text)
        if not found:
            break
        if found.group(1) in names:
            calls.append(found.group(1))
        text = text[: found.start()] + (" " if found.start() and found.end() < len(text) else "") + text[found.end() :]
    if final:
        return text, "", calls
    start = text.rfind(MARKER)
    if start != -1 and ")" not in text[start:]:
        return text[:start], text[start:], calls
    for k in range(min(len(MARKER), len(text)), 0, -1):
        if text.endswith(MARKER[:k]):
            return text[:-k], text[-k:], calls
    return text, "", calls


class Tutor(Agent):
    def __init__(self, brief: dict, learner: str, room: rtc.Room) -> None:
        tools = browser_tools(brief.get("tools") or [], learner, room)
        super().__init__(instructions=brief["instructions"] + (TOOL_RULE if tools else ""), tools=tools)
        self.base = brief["instructions"] + (TOOL_RULE if tools else "")
        self.ears: Ears | None = None

    async def llm_node(self, chat_ctx, tools, model_settings):
        """The model's stream, with a tool it wrote as words taken out of the speech and made the call it meant."""
        names = {getattr(getattr(t, "info", None), "name", None) for t in tools} - {None}
        held = ""
        async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
            content = getattr(getattr(chunk, "delta", None), "content", None) if isinstance(chunk, llm.ChatChunk) else None
            if content is None:
                yield chunk
                continue
            say, held, calls = split_text_calls(held + content, names, final=False)
            if say:
                yield llm.ChatChunk(id=chunk.id, delta=llm.ChoiceDelta(role="assistant", content=say))
            for name in calls:
                log.info("tool %s written as words; calling it", name)
                yield llm.ChatChunk(
                    id=chunk.id,
                    delta=llm.ChoiceDelta(
                        role="assistant",
                        tool_calls=[llm.FunctionToolCall(name=name, arguments="{}", call_id=utils.shortuuid("call_"))],
                    ),
                )
        say, _rest, calls = split_text_calls(held, names, final=True)
        if say:
            yield llm.ChatChunk(id=utils.shortuuid("chunk_"), delta=llm.ChoiceDelta(role="assistant", content=say))
        for name in calls:
            log.info("tool %s written as words; calling it", name)
            yield llm.ChatChunk(
                id=utils.shortuuid("chunk_"),
                delta=llm.ChoiceDelta(
                    role="assistant",
                    tool_calls=[llm.FunctionToolCall(name=name, arguments="{}", call_id=utils.shortuuid("call_"))],
                ),
            )

    async def read_page(self, page: str) -> None:
        """The page the learner is on, folded under the brief, as the OpenAI line did with session.update; the ears take its terms as hints."""
        await self.update_instructions(self.base + page)
        ears = self.ears
        if ears is not None:
            ears.listen_for(page)


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
    ears = Ears()
    agent.ears = ears
    session = AgentSession(
        stt=ears,
        llm=openai.LLM(model=os.environ.get("TUTOR_LLM_MODEL", "gpt-4.1-mini")),
        tts=Voice(brief.get("voice") or "am_puck", float(brief.get("speed") or 1.0)),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(turn_detection="manual" if manual else EnglishModel()),
    )
    moves = Moves(session, agent)
    register_moves(ctx.room, moves)

    # What was said, by whom, and anything that went wrong, in the log.
    @session.on("conversation_item_added")
    def on_item(event) -> None:
        item = event.item
        kind = getattr(item, "type", "?")
        if kind == "message":
            log.info("%s: %s", getattr(item, "role", "?"), (getattr(item, "text_content", None) or "")[:160])
        else:
            log.info("%s %s %s", kind, getattr(item, "name", ""), str(getattr(item, "arguments", getattr(item, "output", "")))[:120])

    @session.on("function_tools_executed")
    def on_tools(event) -> None:
        log.info("tools executed: %s", [c.name for c in getattr(event, "function_calls", [])])

    @session.on("error")
    def on_error(event) -> None:
        log.error("session error: %s", getattr(event, "error", event))

    @session.on("agent_state_changed")
    def on_state(event) -> None:
        log.info("state %s -> %s", event.old_state, event.new_state)

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
