"""Whitelist for vulture: pytest fixtures requested only for their side effect.

pytest injects a fixture into a test by matching the parameter's name, so a
fixture requested purely for what it sets up (``token_env`` puts a token in
the environment, ``frozen_today`` pins the date) is never mentioned again in
the test body. Vulture has no notion of pytest's injection and reports each
one as an unused variable. Referencing the two fixtures here, in a path
vulture also scans, is enough for vulture to count them as used. This file
is never imported by the test suite itself; pytest does not collect it,
since its name does not match ``test_*.py``.
"""

from __future__ import annotations

from tests.test_clonometer import frozen_today, token_env

_ = (token_env, frozen_today)
