"""
The lecture voice on Railway's CPUs: always warm, one page at a time, the
same request and answer as the Modal service. Learner uploads come here.

    TTS_TOKEN   the bearer token the worker sends; never printed
    TTS_VOICE   the default voice (am_puck)
    TTS_MODE    lecture (pages, mastered) or tutor (replies, streamed raw)
    TTS_THREADS cores for the model; the container's count when unset
    PORT        where to listen (8880); Railway sets it

Built and run by the Dockerfile beside this file; `docker build` on a
laptop gives the same service at http://localhost:8880 for a bench.
"""

import os
import time

from fastapi import FastAPI

import voice as lecture_voice

VOICE = os.environ.get("TTS_VOICE", "am_puck")
MODE = os.environ.get("TTS_MODE", "lecture")
PORT = int(os.environ.get("PORT", "8880"))

renderer = lecture_voice.Renderer(VOICE)
api = FastAPI()
lecture_voice.mount(api, renderer, os.environ["TTS_TOKEN"], "cpu", MODE)


@api.on_event("startup")
def load() -> None:
    took = renderer.load()
    import torch

    print(f"kokoro ready on {renderer.device} ({torch.get_num_threads()} threads) in {took:.1f}s, voice {VOICE}", flush=True)


def listening(port: int) -> list:
    """One socket per IP stack: Railway's private network speaks IPv6 only, its public edge and health probe IPv4."""
    import socket

    sockets = []
    for family, host in ((socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::")):
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if family == socket.AF_INET6:
            sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        try:
            sock.bind((host, port))
        except OSError as error:
            print(f"not listening on {host}: {error}", flush=True)
            sock.close()
            continue
        sock.listen(2048)
        sockets.append(sock)
    return sockets


if __name__ == "__main__":
    import asyncio

    import uvicorn

    server = uvicorn.Server(uvicorn.Config(api, log_level="warning"))
    asyncio.run(server.serve(sockets=listening(PORT)))
