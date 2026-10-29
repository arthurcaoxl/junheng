#!/usr/bin/env python3
"""Validate this repository's documented JSON Schema subset and state machines.

Uses only the Python standard library. Supported schema keywords are deliberately
limited to those used under docs/contracts/schemas; unsupported keywords fail
closed instead of being silently ignored. This is not a general JSON Schema
meta-validator.
"""

from __future__ import annotations

import json
import re
import sys
from collections import deque
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "docs/contracts/schemas"
STATE_FILE = ROOT / "docs/contracts/state-machines.json"
SUPPORTED = {
    "$schema", "$id", "title", "type", "required", "properties",
    "additionalProperties", "items", "enum", "const", "pattern",
    "minLength", "minimum", "maximum", "examples",
}
TYPES = {"object", "array", "string", "integer", "boolean"}


class ContractError(Exception):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"{path.relative_to(ROOT)}: {exc}") from exc


def check_schema_shape(schema: dict[str, Any], location: str) -> None:
    unknown = set(schema) - SUPPORTED
    if unknown:
        raise ContractError(f"{location}: unsupported keywords {sorted(unknown)}")
    schema_type = schema.get("type")
    if schema_type not in TYPES:
        raise ContractError(f"{location}: missing or unsupported type {schema_type!r}")
    if "properties" in schema:
        if schema_type != "object" or not isinstance(schema["properties"], dict):
            raise ContractError(f"{location}: properties must be an object schema map")
        for name, child in schema["properties"].items():
            if not isinstance(child, dict):
                raise ContractError(f"{location}.{name}: schema must be an object")
            check_schema_shape(child, f"{location}.{name}")
    if "required" in schema:
        required = schema["required"]
        if not isinstance(required, list) or not all(isinstance(item, str) for item in required):
            raise ContractError(f"{location}: required must be a string array")
        if len(required) != len(set(required)):
            raise ContractError(f"{location}: duplicate required fields")
        missing = set(required) - set(schema.get("properties", {}))
        if missing:
            raise ContractError(f"{location}: required fields lack schemas {sorted(missing)}")
    if "additionalProperties" in schema and not isinstance(schema["additionalProperties"], bool):
        raise ContractError(f"{location}: additionalProperties must be boolean")
    if "items" in schema:
        if schema_type != "array" or not isinstance(schema["items"], dict):
            raise ContractError(f"{location}: items must be an array item schema")
        check_schema_shape(schema["items"], f"{location}[]")
    if "enum" in schema:
        if not isinstance(schema["enum"], list) or not schema["enum"]:
            raise ContractError(f"{location}: enum must be a non-empty array")
    if "pattern" in schema:
        try:
            re.compile(schema["pattern"])
        except (TypeError, re.error) as exc:
            raise ContractError(f"{location}: invalid pattern: {exc}") from exc
    for keyword in ("minLength", "minimum", "maximum"):
        if keyword in schema and (type(schema[keyword]) is not int or schema[keyword] < 0):
            raise ContractError(f"{location}: {keyword} must be a non-negative integer")


def validate_instance(instance: Any, schema: dict[str, Any], location: str, errors: list[str]) -> None:
    schema_type = schema["type"]
    type_ok = {
        "object": lambda value: isinstance(value, dict),
        "array": lambda value: isinstance(value, list),
        "string": lambda value: isinstance(value, str),
        "integer": lambda value: type(value) is int,
        "boolean": lambda value: type(value) is bool,
    }[schema_type](instance)
    if not type_ok:
        errors.append(f"{location}: expected {schema_type}")
        return
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{location}: {instance!r} not in enum")
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{location}: expected const {schema['const']!r}")
    if isinstance(instance, str):
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            errors.append(f"{location}: string does not match pattern")
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{location}: string shorter than minLength")
    if type(instance) is int:
        if instance < schema.get("minimum", instance):
            errors.append(f"{location}: below minimum")
        if instance > schema.get("maximum", instance):
            errors.append(f"{location}: above maximum")
    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        for name in schema.get("required", []):
            if name not in instance:
                errors.append(f"{location}: missing required field {name}")
        if schema.get("additionalProperties") is False:
            for name in sorted(set(instance) - set(properties)):
                errors.append(f"{location}: unknown field {name}")
        for name, value in instance.items():
            if name in properties:
                validate_instance(value, properties[name], f"{location}.{name}", errors)
    if isinstance(instance, list) and "items" in schema:
        for index, value in enumerate(instance):
            validate_instance(value, schema["items"], f"{location}[{index}]", errors)


def validate_schemas() -> tuple[int, int, dict[str, list[str]]]:
    paths = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if not paths:
        raise ContractError("No schema files found")
    ids: set[str] = set()
    states: dict[str, list[str]] = {}
    example_count = 0
    for path in paths:
        schema = load_json(path)
        if not isinstance(schema, dict):
            raise ContractError(f"{path.name}: top level must be an object")
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            raise ContractError(f"{path.name}: unexpected $schema")
        if not isinstance(schema.get("$id"), str) or schema["$id"] in ids:
            raise ContractError(f"{path.name}: missing or duplicate $id")
        ids.add(schema["$id"])
        check_schema_shape(schema, path.name)
        examples = schema.get("examples")
        if not isinstance(examples, list) or not examples:
            raise ContractError(f"{path.name}: at least one example is required")
        for index, example in enumerate(examples):
            errors: list[str] = []
            validate_instance(example, schema, f"{path.name}.examples[{index}]", errors)
            if errors:
                raise ContractError("\n".join(errors))
            example_count += 1
        if "state" in schema.get("properties", {}):
            states[path.name] = schema["properties"]["state"]["enum"]
        print(f"PASS schema {path.name}: {len(examples)} example(s)")
    return len(paths), example_count, states


def validate_state_machines(schema_states: dict[str, list[str]]) -> int:
    document = load_json(STATE_FILE)
    if document.get("version") != 1 or not isinstance(document.get("machines"), dict):
        raise ContractError("state-machines.json: invalid header")
    schema_by_machine = {
        "campaign": "campaign-v1.schema.json",
        "enrollment": "enrollment-v1.schema.json",
        "review": "review-v1.schema.json",
        "payment": "payment-v1.schema.json",
        "flow": "flow-instance-v1.schema.json",
        "identity": "identity-v1.schema.json",
    }
    machines = document["machines"]
    if set(machines) != set(schema_by_machine):
        raise ContractError("state-machines.json: machine set does not match entity schemas")
    for name, machine in machines.items():
        states = machine.get("states")
        if not isinstance(states, list) or len(states) != len(set(states)):
            raise ContractError(f"{name}: states must be unique")
        state_set = set(states)
        initial = machine.get("initial")
        terminals = machine.get("terminals")
        if initial not in state_set or not isinstance(terminals, list) or not set(terminals) <= state_set:
            raise ContractError(f"{name}: invalid initial or terminals")
        if schema_states.get(schema_by_machine[name]) != states:
            raise ContractError(f"{name}: schema state enum differs from state machine")
        transitions = machine.get("transitions")
        if not isinstance(transitions, list) or not transitions:
            raise ContractError(f"{name}: transitions required")
        adjacency = {state: [] for state in states}
        reverse = {state: [] for state in states}
        seen: set[tuple[str, str]] = set()
        for transition in transitions:
            source, target = transition.get("from"), transition.get("to")
            command = transition.get("command")
            if source not in state_set or target not in state_set:
                raise ContractError(f"{name}: transition references unknown state")
            if not isinstance(command, str) or re.fullmatch(r"[A-Z][A-Za-z0-9]*", command) is None:
                raise ContractError(f"{name}: invalid command {command!r}")
            if (source, command) in seen:
                raise ContractError(f"{name}: duplicate transition {source}+{command}")
            seen.add((source, command))
            adjacency[source].append(target)
            reverse[target].append(source)
        for terminal in terminals:
            if adjacency[terminal]:
                raise ContractError(f"{name}: terminal {terminal} has outgoing transitions")
        reachable = {initial}
        queue = deque([initial])
        while queue:
            for target in adjacency[queue.popleft()]:
                if target not in reachable:
                    reachable.add(target)
                    queue.append(target)
        if reachable != state_set:
            raise ContractError(f"{name}: unreachable states {sorted(state_set - reachable)}")
        can_finish = set(terminals)
        queue = deque(terminals)
        while queue:
            for source in reverse[queue.popleft()]:
                if source not in can_finish:
                    can_finish.add(source)
                    queue.append(source)
        if can_finish != state_set:
            raise ContractError(f"{name}: states cannot reach a terminal {sorted(state_set - can_finish)}")
        print(f"PASS state machine {name}: {len(states)} states, {len(transitions)} transitions")
    return len(machines)


def validate_required_documents() -> int:
    documents = [
        "ARCHITECTURE.md",
        "docs/architecture/module-boundaries.md",
        "docs/architecture/camp-flow.md",
        "docs/contracts/shared/primitives.md",
        "docs/contracts/shared/events.md",
        "docs/contracts/shared/errors.md",
        "docs/contracts/campaign-v1.md",
        "docs/contracts/enrollment-v1.md",
        "docs/contracts/review-v1.md",
        "docs/contracts/payment-v1.md",
        "docs/contracts/identity-v1.md",
        "docs/contracts/storage-v3.md",
        "docs/decisions/0006-contract-first-modular-camp.md",
    ]
    for relative in documents:
        if not (ROOT / relative).is_file():
            raise ContractError(f"Missing document {relative}")
    architecture = (ROOT / "ARCHITECTURE.md").read_text(encoding="utf-8")
    flow = (ROOT / "docs/architecture/camp-flow.md").read_text(encoding="utf-8")
    for token in (
        "SubmitEnrollment", "EnrollmentSubmitted", "ApproveReview", "ReviewApproved",
        "RequestPayment", "PaymentRequested", "PaymentSucceeded", "ConfirmEnrollment",
        "EnrollmentConfirmed", "ProvisionCamper", "CamperProvisioned",
        "6e193dfd7ff220d67038987773d8743e44051cf3", "storage-v3",
    ):
        if token not in architecture:
            raise ContractError(f"ARCHITECTURE.md: missing required token {token}")
    for state in ("running", "waiting_review", "waiting_payment", "completed", "cancelled", "failed"):
        if state not in flow:
            raise ContractError(f"camp-flow.md: missing flow state {state}")
    print(f"PASS documentation: {len(documents)} required files and ownership tokens")
    return len(documents)


def main() -> int:
    try:
        schema_count, example_count, schema_states = validate_schemas()
        machine_count = validate_state_machines(schema_states)
        document_count = validate_required_documents()
    except ContractError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(
        f"PASS: {schema_count} schemas, {example_count} examples, "
        f"{machine_count} state machines, {document_count} required documents"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
