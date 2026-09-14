"""
Text for a school's catalogue on our own open model, on a rented GPU billed by
the second. One container runs vLLM's OpenAI-compatible server for the model
named at deploy time; the worker talks to it through the same OpenAI client it
uses for everything else, with another base URL. Modal scales the container
to zero between runs.

    LLM_MODEL=Qwen/Qwen3-8B LLM_GPU=L4 modal deploy modal/llm_service.py
        # the spike: the plumbing, the schemas and the writer's checks on a small model
    LLM_MODEL=moonshotai/Kimi-K3 LLM_GPU=H200:8 modal deploy modal/llm_service.py
        # Kimi K3: 2.8T parameters, about 594 GB of MXFP4 weights, tensor parallel over eight cards
    node modal/llm-bench.mjs <service url> 8,16 <card $/hour>
        # tokens a second and the price per million tokens, the way the worker calls it

The secret `easiread-llm` holds LLM_TOKEN; vLLM takes it as its API key and
the worker sends it as a bearer token (MODAL_LLM_TOKEN). The model id goes
into MODAL_LLM_MODEL on the worker, the URL into MODAL_LLM_URL.
"""
import os
import subprocess
import time
import urllib.request

import modal

MODEL = os.environ.get("LLM_MODEL")
if not MODEL:
    raise SystemExit("LLM_MODEL names the checkpoint to serve, e.g. LLM_MODEL=Qwen/Qwen3-8B")
GPU = os.environ.get("LLM_GPU", "L4")
# How many cards the model is split over: everything after the colon.
TENSOR_PARALLEL = int(GPU.split(":")[1]) if ":" in GPU else 1
# The longest prompt plus answer the writer sends: a page and its plan.
MAX_MODEL_LEN = int(os.environ.get("LLM_MAX_MODEL_LEN", "16384"))
PORT = 8000
# Requests one container takes at once; the engine batches them itself.
INTAKE = int(os.environ.get("LLM_INTAKE", "16"))
# The writer wants the answer, not a think-aloud before it: a model with a
# reasoning switch in its chat template (Qwen3 has one) spends the whole
# context reasoning otherwise. Templates without the switch ignore it.
CHAT_TEMPLATE_KWARGS = os.environ.get("LLM_CHAT_TEMPLATE_KWARGS", '{"enable_thinking": false}')
# What Modal bills a card for, per hour, for the bench's arithmetic.
USD_PER_GPU_HOUR = {"L4": 0.80, "A10": 1.10, "L40S": 1.95, "A100": 2.10, "H100": 3.95, "H200": 4.54, "B200": 6.25}

app = modal.App(os.environ.get("LLM_APP_NAME", "easiread-llm"))

# Modal needs a Python of its own inside the image for its runtime; the
# engine keeps using the image's own, which is what `vllm serve` runs on.
# The image's own entrypoint is `vllm`, which would swallow Modal's runner
# command; cleared, the engine is started by hand below.
image = modal.Image.from_registry("vllm/vllm-openai:latest", add_python="3.12").entrypoint([]).env(
    {
        "LLM_MODEL": MODEL,
        "LLM_MAX_MODEL_LEN": str(MAX_MODEL_LEN),
        "LLM_CHAT_TEMPLATE_KWARGS": CHAT_TEMPLATE_KWARGS,
        "LLM_TENSOR_PARALLEL": str(TENSOR_PARALLEL),
        "HF_HOME": "/weights/hf",
        "VLLM_LOGGING_LEVEL": "INFO",
    }
)

# The weights on a volume, so a cold start reads them from disk rather than
# from Hugging Face every time the container wakes.
weights = modal.Volume.from_name("easiread-llm-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu=GPU,
    volumes={"/weights": weights},
    secrets=[modal.Secret.from_name("easiread-llm")],
    # The worker sends a chapter's pages one after another and chapters
    # alongside each other; one container batches them.
    max_containers=int(os.environ.get("LLM_MAX_CONTAINERS", "1")),
    scaledown_window=int(os.environ.get("LLM_SCALEDOWN_SECONDS", "300")),
    timeout=60 * 60,
)
@modal.concurrent(max_inputs=INTAKE)
class Text:
    @modal.web_server(PORT, startup_timeout=1800)
    def serve(self):
        """Starts the engine, waits until it answers, then takes traffic."""
        started = time.time()
        command = [
            "vllm", "serve", os.environ["LLM_MODEL"],
            "--host", "0.0.0.0",
            "--port", str(PORT),
            "--trust-remote-code",
            "--max-model-len", os.environ["LLM_MAX_MODEL_LEN"],
            "--tensor-parallel-size", os.environ["LLM_TENSOR_PARALLEL"],
            "--served-model-name", os.environ["LLM_MODEL"],
            "--default-chat-template-kwargs", os.environ["LLM_CHAT_TEMPLATE_KWARGS"],
            # A JSON answer is held to its schema by a grammar; without this
            # the grammar lets the model emit whitespace forever after "{".
            "--structured-outputs-config", '{"backend": "xgrammar", "disable_any_whitespace": true}',
        ]
        # The key goes in by environment, not on the command line: the
        # engine prints its non-default arguments to the log at start.
        subprocess.Popen(command, env={**os.environ, "VLLM_API_KEY": os.environ["LLM_TOKEN"]})
        self._wait_for_health(deadline=started + 1740)
        weights.commit()
        print(f"[llm] {os.environ['LLM_MODEL']} ready on {GPU} in {time.time() - started:.0f}s")

    @staticmethod
    def _wait_for_health(deadline: float) -> None:
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=5) as answer:
                    if answer.status == 200:
                        return
            except Exception:
                pass
            time.sleep(3)
        raise RuntimeError("vLLM did not come up in time")
