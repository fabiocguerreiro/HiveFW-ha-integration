"""Tests for the standalone HiveFW config flow."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hivefw_integration import config_flow
from custom_components.hivefw_integration.engine.config_flow import validate_common

DOMAIN = "hivefw_integration"


@pytest.fixture
def user_flow() -> config_flow.HiveFWConfigFlow:
    """A fresh HiveFW user flow."""
    flow = config_flow.HiveFWConfigFlow()
    flow.context = {"source": SOURCE_USER}
    return flow


def test_fresh_install_config_version_is_one() -> None:
    """HiveFW starts a new config-entry lineage; no meshcore-ha migration history."""
    assert config_flow.HiveFWConfigFlow.VERSION == 1


async def test_user_flow_starts_with_connection_type(
    hass: HomeAssistant, user_flow: config_flow.HiveFWConfigFlow
) -> None:
    """A clean install immediately asks which transport HiveFW should own."""
    user_flow.hass = hass
    result = await user_flow.async_step_user()

    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "user"


async def test_validate_common_returns_hivefw_title(hass: HomeAssistant) -> None:
    """Successful radio validation exposes a HiveFW-native entry title."""
    response = SimpleNamespace(
        type=object(),
        payload={"name": "SE.PLM PALMELA R4", "public_key": "0123456789abcdef"},
    )
    api = MagicMock()
    api.connect = AsyncMock(return_value=True)
    api.disconnect = AsyncMock()
    api._mesh_core = MagicMock()
    api._mesh_core.commands.send_appstart = AsyncMock(return_value=response)

    info = await validate_common(api)

    assert info["title"] == "HiveFW SE.PLM PALMELA R4"
    assert info["name"] == "SE.PLM PALMELA R4"
    assert info["pubkey"] == "0123456789abcdef"
    api.disconnect.assert_awaited_once()


def test_async_get_options_flow_returns_hivefw_options_flow(
    hass: HomeAssistant,
) -> None:
    """The HiveFW config flow owns its options flow directly."""
    entry = MockConfigEntry(domain=DOMAIN, title="HiveFW", data={}, options={})
    entry.add_to_hass(hass)

    options_flow = config_flow.HiveFWConfigFlow.async_get_options_flow(entry)

    assert isinstance(options_flow, config_flow.OptionsFlowHandler)
