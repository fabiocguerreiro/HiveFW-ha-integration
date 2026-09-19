"""Repair issue handlers for HiveFW.

The ``radio_engine_unavailable`` issue is created when HiveFW cannot
establish its configured TCP/Wi-Fi, BLE or USB radio coordinator.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult


class RadioEngineUnavailableRepairFlow(RepairsFlow):
    """Repair flow for an unavailable HiveFW radio engine."""

    def __init__(self, data: dict[str, Any] | None) -> None:
        """Initialize the flow with optional issue data."""
        self._data = data or {}

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Entry point — delegate to the confirm step."""
        return await self.async_step_confirm(user_input)

    async def async_step_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Let the user acknowledge the radio connection issue."""
        if user_input is not None:
            return self.async_create_entry(title="", data={})
        return self.async_show_form(
            step_id="confirm", data_schema=vol.Schema({})
        )


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict[str, str | int | float | None] | None,
) -> RepairsFlow:
    """Create a repair fix flow for the given issue id."""
    if issue_id == "radio_engine_unavailable":
        return RadioEngineUnavailableRepairFlow(data)
    raise NotImplementedError(f"Unknown repair issue: {issue_id}")
