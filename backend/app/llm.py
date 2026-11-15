"""
Optional Claude integration (Anthropic API).

TerraNova's advice features are computed deterministically from the analysis results
(advisor.py, execution.py). When an Anthropic credential is configured (ANTHROPIC_API_KEY,
or another credential source the SDK resolves), Claude is additionally used to

  * write a narrative research brief from those computed diagnostics, and
  * answer free-text questions about an experiment in the location view.

Claude only receives TerraNova's own numbers as context and is instructed to rely on them.
Without a credential, or if the call fails, the API reports `available: false` and the UI
shows the deterministic results only.
"""
from __future__ import annotations

import json
import logging
import os

log = logging.getLogger("terranova.llm")

MODEL = os.environ.get("TERRANOVA_CLAUDE_MODEL", "claude-opus-5-5")

SYSTEM = (
    "You are the research advisor inside TerraNova, a tool that ranks Earth locations as field "
    "analogs for lunar and Martian test campaigns. You receive JSON produced by TerraNova's "
    "scoring engine: parameters, weights, similarity scores, Earth values, planetary target values, "
    "data-quality labels, constraint statistics and NASA verification results.\n"
    "Rules:\n"
    "- Base every statement on the numbers in the JSON. Quote values with their units.\n"
    "- Never invent measurements, sites, permits or facilities that are not in the JSON. If the data "
    "do not answer a question, say so and say what measurement would answer it.\n"
    "- Distinguish measured values, reanalysis, modelled estimates and proxy indices as labelled.\n"
    "- Vacuum/low pressure, reduced gravity and space radiation cannot be reproduced outdoors; say so "
    "when relevant.\n"
    "- Write for scientists and engineers: concise, concrete, no marketing language. Use short "
    "paragraphs or bullet lists. Answer in the language requested."
)

_client = None
_checked = False


def _get_client():
    """Return an Anthropic client, or None when the SDK or a credential is unavailable."""
    global _client, _checked
    if _checked:
        return _client
    _checked = True
    if os.environ.get("TERRANOVA_DISABLE_LLM", "").lower() in ("1", "true", "yes"):
        return None
    try:
        import anthropic
    except ImportError:
        log.info("anthropic SDK not installed - Claude features disabled")
        return None
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        log.info("No ANTHROPIC_API_KEY - Claude features disabled")
        return None
    try:
        _client = anthropic.Anthropic(timeout=120.0, max_retries=2)
    except Exception as e:  # noqa: BLE001
        log.warning("Could not create Anthropic client: %s", e)
        _client = None
    return _client


def status() -> dict:
    return {"available": _get_client() is not None, "model": MODEL}


LANG_NAMES = {"en": "English", "he": "Hebrew", "es": "Spanish", "fr": "French"}


def ask(task: str, context: dict, lang: str = "en", max_tokens: int = 6000) -> dict:
    """Single grounded request. Returns {available, text} or {available: False, error}."""
    client = _get_client()
    if client is None:
        return {"available": False, "error": "Claude is not configured (set ANTHROPIC_API_KEY on the backend)."}
    import anthropic

    user = (
        f"TerraNova data (JSON):\n```json\n{json.dumps(context, ensure_ascii=False, default=str)}\n```\n\n"
        f"Task: {task}\n\nRespond in {LANG_NAMES.get(lang, 'English')}."
    )
    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=SYSTEM,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.AuthenticationError:
        return {"available": False, "error": "Anthropic API key was rejected."}
    except anthropic.RateLimitError:
        return {"available": False, "error": "Anthropic API rate limit reached - try again shortly."}
    except anthropic.APIStatusError as e:
        return {"available": False, "error": f"Anthropic API error {e.status_code}: {e.message}"[:300]}
    except anthropic.APIConnectionError:
        return {"available": False, "error": "Could not reach the Anthropic API (network)."}
    if resp.stop_reason == "refusal":
        return {"available": False, "error": "The model declined this request."}
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return {"available": True, "text": text, "model": resp.model}
