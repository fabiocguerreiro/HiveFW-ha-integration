"""Tests for HiveFW Repairs flows."""
from __future__ import annotations

from custom_components.hivefw_integration.repairs import (
    RadioEngineUnavailableRepairFlow,
    async_create_fix_flow,
)


async def test_radio_engine_unavailable_uses_hivefw_fix_flow(hass) -> None:
    flow = await async_create_fix_flow(hass, "radio_engine_unavailable", None)
    assert isinstance(flow, RadioEngineUnavailableRepairFlow)
