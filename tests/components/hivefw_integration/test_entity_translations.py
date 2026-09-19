"""Regression tests for HiveFW entity display names."""
from __future__ import annotations

import json
import re
from pathlib import Path


def test_all_static_sensor_descriptions_have_display_names() -> None:
    root = Path(__file__).parents[3]
    sensor_py = (
        root
        / "custom_components"
        / "hivefw_integration"
        / "engine"
        / "sensor.py"
    ).read_text(encoding="utf-8")
    strings = json.loads((
        root
        / "custom_components"
        / "hivefw_integration"
        / "strings.json"
    ).read_text(encoding="utf-8"))

    keys = set(
        re.findall(
            r'SensorEntityDescription\(\s*[\s\S]*?key="([^"]+)"',
            sensor_py,
        )
    )
    translated = set(strings["entity"]["sensor"])
    assert keys <= translated


def test_self_diagnostic_faults_have_display_names() -> None:
    root = Path(__file__).parents[3]
    strings = json.loads((
        root
        / "custom_components"
        / "hivefw_integration"
        / "strings.json"
    ).read_text(encoding="utf-8"))
    faults = strings["entity"]["binary_sensor"]
    assert {"err_pool_full", "err_cad_timeout", "err_rx_timeout"} <= set(faults)
