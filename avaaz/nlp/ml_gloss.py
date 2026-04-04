from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Any, Dict, List

try:
    # transformers is optional; we handle absence gracefully.
    from transformers import pipeline  # type: ignore[import]
except Exception:  # pragma: no cover - we only care that pipeline is missing
    pipeline = None  # type: ignore[assignment]


@dataclass
class AslGlossResult:
    """
    Minimal result object expected by nlp_gloss.english_to_isl_gloss_ml.

    Attributes
    ----------
    gloss:
        The gloss sequence as a single space-separated string (e.g. "HELLO HOW YOU").
    raw_text:
        The raw text returned by the underlying model (before any extra processing).
    score:
        Optional model confidence / score if available.
    model_name:
        The underlying HuggingFace model id, if known.
    """

    gloss: str
    raw_text: str
    score: Optional[float] = None
    model_name: Optional[str] = None


_GLOSS_PIPELINE: Any = None


def _get_gloss_pipeline() -> Any:
    """
    Lazy-initialize a text2text-generation pipeline for English→gloss.

    By default we load a generic T5 model ('t5-small'). In a real deployment
    you would replace this with a model that has been fine-tuned specifically
    for English→ASL/ISL gloss (and set its id via AVAAZ_GLOSS_MODEL).
    """
    global _GLOSS_PIPELINE

    if _GLOSS_PIPELINE is not None:
        return _GLOSS_PIPELINE

    if pipeline is None:
        raise RuntimeError(
            "Transformers is not installed. Install it with 'pip install transformers' "
            "or disable the ML gloss path."
        )

    model_name = os.getenv("AVAAZ_GLOSS_MODEL", "t5-small")
    _GLOSS_PIPELINE = pipeline("text2text-generation", model=model_name)
    return _GLOSS_PIPELINE


def english_to_asl_gloss_ml(text: str) -> AslGlossResult:
    """
    ML-based English→ASL gloss engine.

    This function wraps a HuggingFace text2text-generation model. It sends
    a prompt asking the model to output ASL-style gloss words in UPPERCASE
    and space-separated. The exact quality depends on the underlying model.

    For production you should fine-tune a seq2seq model on English→gloss
    data and point AVAAZ_GLOSS_MODEL to that model id.
    """
    if not text.strip():
        return AslGlossResult(gloss="", raw_text="")

    generator = _get_gloss_pipeline()

    prompt = (
        "Translate this English sentence into ASL-style gloss words. "
        "Use only UPPERCASE tokens separated by single spaces, no punctuation.\n"
        f"English: {text.strip()}\n"
        "Gloss:"
    )

    outputs: List[Dict[str, Any]] = generator(
        prompt,
        max_length=64,
        num_beams=4,
        do_sample=False,
    )
    first = outputs[0] if outputs else {}

    # Different transformers versions may use different keys; try a few.
    gloss_text = (
        first.get("generated_text")
        or first.get("translation_text")
        or first.get("summary_text")
        or ""
    )
    gloss_text = str(gloss_text).strip()

    score = first.get("score") if isinstance(first, dict) else None
    model_name = getattr(getattr(generator, "model", None), "name_or_path", None)

    return AslGlossResult(
        gloss=gloss_text,
        raw_text=gloss_text,
        score=score if isinstance(score, (int, float)) else None,
        model_name=str(model_name) if model_name is not None else None,
    )

