from __future__ import annotations

"""
Rule-based + ML-assisted glossing module.

This file is intentionally small and readable:
- `normalize(...)` cleans raw English text
- rule functions (prefixed `_rule_...`) handle frequent sentence patterns
- `english_to_isl_gloss(...)` applies rules first, then a lexical fallback
- `english_to_isl_gloss_hybrid(...)` optionally upgrades low-confidence output using ML
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Tuple


@dataclass
class GlossResult:
    gloss_tokens: List[str]
    rules_applied: List[str]
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "gloss_tokens": self.gloss_tokens,
            "meta": {
                "rules_applied": self.rules_applied,
                "confidence": self.confidence,
            },
        }


LEXICON: Dict[str, str] = {
    # Pronouns / self
    "i": "ME",
    "me": "ME",
    "my": "MY",
    "myself": "SELF",
    "you": "YOU",
    "your": "YOUR",
    "yourself": "YOURSELF",
    "we": "WE",
    "our": "OUR",
    "us": "US",
    # Name / intro
    "name": "NAME",
    "hello": "HELLO",
    "hi": "HELLO",
    # Feelings / states
    "happy": "HAPPY",
    "sad": "SAD",
    "busy": "BUSY",
    # Location / origin
    "live": "LIVE",
    "from": "FROM",
    "here": "HERE",
    "home": "HOME",
    "world": "WORLD",
    # Actions
    "work": "WORK",
    "study": "STUDY",
    "see": "SEE",
    "come": "COME",
    "go": "GO",
    # Age
    "age": "AGE",
    "old": "OLD",
    # Question words
    "what": "WHAT",
    "where": "WHERE",
    "who": "WHO",
    "when": "WHEN",
    "why": "WHY",
    "which": "WHICH",
    "how": "HOW",
    # Function words we sometimes keep
    "and": "AND",
    "but": "BUT",
    "not": "NOT",
    "can": "CAN",
    "will": "WILL",
    "thank": "THANK",
    "thanks": "THANK_YOU",
    "bye": "BYE",
    "welcome": "WELCOME",
}

# Very small, hand-written \"lemmatizer\" for our intro/small-talk domain.
# This lets rules match forms like \"lives\", \"studying\" or \"working\"
# without needing a full NLP library.
LEMMA_MAP: Dict[str, str] = {
    # verbs
    "lives": "live",
    "living": "live",
    "studies": "study",
    "studying": "study",
    "worked": "work",
    "working": "work",
    "comes": "come",
    "coming": "come",
    "goes": "go",
    "going": "go",
    # nouns / others
    "years": "year",
}


def _map_to_gloss(tokens: List[str]) -> List[str]:
    """Map English tokens to ISL gloss tokens using the lexicon."""
    gloss: List[str] = []
    for t in tokens:
        g = LEXICON.get(t, t.upper())
        gloss.append(g)
    return gloss


def _rule_name_question(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # what (is) your name -> YOUR NAME WHAT
    if "what" in tokens and "your" in tokens and "name" in tokens:
        ordered = ["your", "name", "what"]
        return _map_to_gloss(ordered), 0.9
    return None, 0.0


def _rule_name_statement(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # my name is X / i am X -> ME NAME X
    if len(tokens) >= 3 and tokens[0] in {"my", "i"} and tokens[1] == "name":
        # everything after "name" treated as the name
        name_tokens = tokens[2:]
        if not name_tokens:
            return None, 0.0
        gloss = ["ME", "NAME"] + [t.upper() for t in name_tokens]
        return gloss, 0.85
    # pattern: "i am rahul"
    if len(tokens) >= 3 and tokens[0] in {"i"} and tokens[1] == "am":
        name_tokens = tokens[2:]
        gloss = ["ME", "NAME"] + [t.upper() for t in name_tokens]
        return gloss, 0.8
    return None, 0.0


def _rule_where_live_question(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # where do you live / where you live -> YOU LIVE WHERE
    if "where" in tokens and "live" in tokens and "you" in tokens:
        gloss = ["YOU", "LIVE", "WHERE"]
        return gloss, 0.9
    # where are you from -> YOU FROM WHERE
    if "where" in tokens and "from" in tokens and "you" in tokens:
        gloss = ["YOU", "FROM", "WHERE"]
        return gloss, 0.85
    return None, 0.0


def _rule_where_live_statement(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # i live in kochi -> ME LIVE KOCHI
    if len(tokens) >= 3 and tokens[0] in {"i", "me"} and "live" in tokens:
        try:
            live_idx = tokens.index("live")
        except ValueError:
            return None, 0.0
        place_tokens = tokens[live_idx + 1 :]
        # drop prepositions like "in" / "at" at start of place
        while place_tokens and place_tokens[0] in {"in", "at"}:
            place_tokens = place_tokens[1:]
        if not place_tokens:
            return None, 0.0
        gloss = ["ME", "LIVE"] + [t.upper() for t in place_tokens]
        return gloss, 0.85
    return None, 0.0


def _rule_age(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # i am 25 years old -> ME AGE 25
    if len(tokens) >= 3 and tokens[0] in {"i", "me"} and "old" in tokens:
        # find first digit-like token
        num = None
        for t in tokens:
            if any(ch.isdigit() for ch in t):
                num = "".join(ch for ch in t if ch.isdigit())
                break
        if num is None:
            return None, 0.0
        gloss = ["ME", "AGE", num]
        return gloss, 0.9
    return None, 0.0


def _rule_greeting(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # hello / hi -> HELLO
    if len(tokens) == 1 and tokens[0] in {"hello", "hi"}:
        return ["HELLO"], 0.95
    return None, 0.0


def _rule_greeting_how_are_you(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # hello how are you / hi how are you -> HELLO HOW YOU
    if "how" in tokens and "you" in tokens and any(t in {"hello", "hi"} for t in tokens):
        return ["HELLO", "HOW", "YOU"], 0.95
    return None, 0.0


def _rule_how_are_you(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # how are you -> HOW YOU
    if "how" in tokens and "you" in tokens and len(tokens) <= 3:
        return ["HOW", "YOU"], 0.9
    return None, 0.0


def _rule_thank_you(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # thank you / thanks -> THANK_YOU
    if "thank" in tokens and "you" in tokens:
        return ["THANK_YOU"], 0.95
    if "thanks" in tokens:
        return ["THANK_YOU"], 0.9
    return None, 0.0


def _rule_bye(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # bye / good bye -> BYE
    if "bye" in tokens:
        return ["BYE"], 0.9
    return None, 0.0


def _rule_feeling_statement(tokens: List[str]) -> Tuple[List[str] | None, float]:
    # i am happy / i am sad / i am busy -> ME HAPPY/SAD/BUSY
    if len(tokens) >= 2 and tokens[0] in {"i", "me"}:
        if "happy" in tokens:
            return ["ME", "HAPPY"], 0.9
        if "sad" in tokens:
            return ["ME", "SAD"], 0.9
        if "busy" in tokens:
            return ["ME", "BUSY"], 0.9
    return None, 0.0


RULE_PIPELINE: List[Tuple[str, Any]] = [
    ("RuleGreetingHowAreYou", _rule_greeting_how_are_you),
    ("RuleHowAreYou", _rule_how_are_you),
    ("RuleThankYou", _rule_thank_you),
    ("RuleBye", _rule_bye),
    ("RuleGreeting", _rule_greeting),
    ("RuleFeelingStatement", _rule_feeling_statement),
    ("RuleNameQuestion", _rule_name_question),
    ("RuleNameStatement", _rule_name_statement),
    ("RuleWhereLiveQuestion", _rule_where_live_question),
    ("RuleWhereLiveStatement", _rule_where_live_statement),
    ("RuleAge", _rule_age),
]


def english_to_isl_gloss(text: str) -> GlossResult:
    """
    Main entrypoint: convert English text into ISL-style gloss tokens
    using a small, intros-focused rule set plus a linear fallback.
    """
    tokens = normalize(text)
    if not tokens:
        return GlossResult(gloss_tokens=[], rules_applied=["RuleEmpty"], confidence=0.0)

    rules_applied: List[str] = []

    # Ordered rule application
    for rule_id, fn in RULE_PIPELINE:
        gloss, conf = fn(tokens)
        if gloss is not None:
            rules_applied.append(rule_id)
            return GlossResult(gloss_tokens=gloss, rules_applied=rules_applied, confidence=conf)

    # Fallback: lexicon-based linear mapping
    gloss_tokens = _map_to_gloss(tokens)
    rules_applied.append("RuleFallbackLinear")
    return GlossResult(gloss_tokens=gloss_tokens, rules_applied=rules_applied, confidence=0.3)


def english_to_isl_gloss_ml(text: str) -> GlossResult:
    """
    ML-based gloss engine using a T5 English→ASL gloss model.
    We adapt its output into our GlossResult format.
    """
    # Lazy import so rule-based gloss works without ML deps installed.
    from nlp.ml_gloss import english_to_asl_gloss_ml  # type: ignore[import]

    ml_result = english_to_asl_gloss_ml(text)
    tokens = [t.strip().upper() for t in ml_result.gloss.split() if t.strip()]
    return GlossResult(
        gloss_tokens=tokens,
        rules_applied=["ML_T5_ENGLISH_TO_ASL_GLOSS"],
        confidence=0.8,
    )


def _split_sentences(text: str) -> List[str]:
    """
    Split text into sentences on . ? ! so we can gloss each part.
    Prevents one matched phrase from discarding the rest of the input.
    """
    if not text or not text.strip():
        return []
    s = text.strip()
    for sep in ".!?":
        s = s.replace(sep, sep + "\n")
    parts = [p.strip() for p in s.splitlines() if p.strip()]
    return parts if parts else [text.strip()]


def _english_to_isl_gloss_hybrid_single(
    text: str, rule_conf_threshold: float = 0.5
) -> GlossResult:
    """
    Single-segment hybrid (no sentence splitting). Used internally by
    english_to_isl_gloss_hybrid when processing each segment.
    """
    rb = english_to_isl_gloss(text)
    if rb.gloss_tokens and rb.rules_applied:
        primary_rule = rb.rules_applied[0]
        if primary_rule != "RuleFallbackLinear" and rb.confidence >= rule_conf_threshold:
            return rb
    try:
        ml = english_to_isl_gloss_ml(text)
    except Exception:
        return rb
    return GlossResult(
        gloss_tokens=ml.gloss_tokens,
        rules_applied=["Hybrid_UseML"] + ml.rules_applied + rb.rules_applied,
        confidence=ml.confidence,
    )


def english_to_isl_gloss_hybrid(text: str, rule_conf_threshold: float = 0.5) -> GlossResult:
    """
    Hybrid gloss engine. Splits on sentence boundaries (. ? !) and glosses
    each part, so e.g. "Hello, how are you? My name is Ashik." yields
    HELLO HOW YOU + ME NAME ASHIK instead of only the first phrase.
    """
    parts = _split_sentences(text)
    if len(parts) <= 1:
        return _english_to_isl_gloss_hybrid_single(text, rule_conf_threshold)

    all_tokens: List[str] = []
    all_rules: List[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        result = _english_to_isl_gloss_hybrid_single(part, rule_conf_threshold)
        all_tokens.extend(result.gloss_tokens)
        all_rules.extend(result.rules_applied)
    return GlossResult(
        gloss_tokens=all_tokens,
        rules_applied=all_rules,
        confidence=0.85 if all_tokens else 0.0,
    )

def normalize(text: str) -> List[str]:
    """
    Lowercase, strip punctuation, split on whitespace,
    and drop very common filler words.
    """
    if not text:
        return []

    s = text.strip().lower()

    # Expand a few common contractions so rules see canonical forms.
    # This is intentionally tiny and focused on our domain.
    contractions = {
        "what's": "what is",
        "whats": "what is",
        "i'm": "i am",
        "you're": "you are",
        "they're": "they are",
        "it's": "it is",
        "don't": "do not",
        "doesn't": "does not",
        "didn't": "did not",
        "can't": "cannot",
        "won't": "will not",
    }
    for src, tgt in contractions.items():
        s = s.replace(src, tgt)
    for ch in "?!.;,:":
        s = s.replace(ch, " ")

    raw_tokens = s.split()

    stopwords = {
        "is",
        "am",
        "are",
        "the",
        "a",
        "an",
        "do",
        "does",
        "did",
        "to",
        "of",
        "and",
        "for",
        "in",
        "on",
        "at",
        "myself",
        "yourself",
    }

    tokens: List[str] = []
    last: str | None = None
    for t in raw_tokens:
        # Lightweight lemmatization for a few common variants
        t = LEMMA_MAP.get(t, t)
        if t in stopwords:
            continue
        # Remove obvious duplicates from ASR like "name name"
        if last is not None and t == last:
            continue
        tokens.append(t)
        last = t

    return tokens




