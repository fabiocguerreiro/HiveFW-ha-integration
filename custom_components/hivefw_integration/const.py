"""Constants for the HiveFW companion integration."""
from __future__ import annotations

from typing import Final

from .engine.const import (
    CONF_FLOOD_SCOPES as _ENGINE_CONF_FLOOD_SCOPES,
    CONF_NAME as _ENGINE_CONF_NAME,
    DOMAIN,
    ENTITY_PREFIX,
    PUBLIC_EVENT_PREFIX,
)

# Compatibility aliases for helper code lifted during the standalone migration.
# Values come from the embedded HiveFW engine so there is a single source of truth.
MESHCORE_DOMAIN: Final = DOMAIN
CONF_NAME_UPSTREAM: Final = _ENGINE_CONF_NAME
CONF_FLOOD_SCOPES_UPSTREAM: Final = _ENGINE_CONF_FLOOD_SCOPES

# Public HiveFW events fired on hass.bus and consumed by the panel/store.
EVENT_MESHCORE_MESSAGE: Final = f"{PUBLIC_EVENT_PREFIX}_message"
EVENT_MESHCORE_DELIVERY_UPDATE: Final = f"{PUBLIC_EVENT_PREFIX}_delivery_update"
EVENT_MESHCORE_CONNECTED: Final = f"{PUBLIC_EVENT_PREFIX}_connected"
EVENT_MESHCORE_DISCONNECTED: Final = f"{PUBLIC_EVENT_PREFIX}_disconnected"
EVENT_HEALTH_TRANSITION: Final = f"{PUBLIC_EVENT_PREFIX}_health_transition"

# ─── Storage keys ──────────────────────────────────────────────────────────
# Per-conversation file naming. Namespaced to HiveFW so conversation storage remains isolated per integration entry.
# Substitute the per-entry id and a sanitized entity_id (dots → underscores).
STORAGE_KEY_INDEX: Final = "hivefw_integration.{entry_id}.message_index"
STORAGE_KEY_CONVERSATION: Final = "hivefw_integration.{entry_id}.msgs.{safe_entity_id}"

STORAGE_VERSION: Final = 1

# ─── Message store tunables ────────────────────────────────────────────────
# Per-conversation cap (messages); excess is trimmed FIFO.
DEFAULT_MAX_MESSAGES_PER_CONVERSATION: Final = 500
# Retention window before cleanup_old_messages prunes by timestamp.
DEFAULT_MESSAGE_RETENTION_DAYS: Final = 90
# Debounce window for per-conversation/index disk writes.
MESSAGE_STORE_SAVE_DELAY_SECONDS: Final = 5.0
# Inactivity window before a loaded conversation is evicted from memory.
MESSAGE_STORE_IDLE_EVICTION_SECONDS: Final = 300  # 5 minutes

# Config-entry option keys (read from entry.options with the defaults above).
OPT_MAX_MESSAGES_PER_CONVERSATION: Final = "max_messages_per_conversation"
OPT_MESSAGE_RETENTION_DAYS: Final = "message_retention_days"

# ─── Constants used by the lifted ws_api.py / utils helpers ─────────────────
# HA entity-domain string used by helpers that build entity_ids for binary
# HiveFW binary sensors addressed by WebSocket helpers.
ENTITY_DOMAIN_BINARY_SENSOR: Final = "binary_sensor"

# Default age (days) at which a neighbor entry is considered stale and
# eligible for cleanup via hivefw_integration/cleanup_stale_neighbors. Shared with the embedded engine; retained here for WebSocket helper compatibility.
# companion's ws_api.py can self-import it without coupling to upstream's
# const module.
DEFAULT_STALE_NEIGHBOR_DAYS: Final = 30

# Channel-entity key prefix and message-suffix used by entity_id helpers
# in utils.py. Mirror the upstream values so the entity_ids the helpers
# produce match what the upstream integration registered.
CHANNEL_PREFIX: Final = "channel_"
MESSAGES_SUFFIX: Final = "messages"
