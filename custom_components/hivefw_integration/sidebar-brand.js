/*
 * HiveFW sidebar brand hook.
 *
 * Home Assistant's built-in panel API accepts an MDI icon identifier but not
 * an image URL. This tiny global module replaces the fallback MDI icon on the
 * HiveFW sidebar entry with the integration's own brand/icon.png. It observes
 * the relevant shadow roots so the logo survives frontend re-renders without
 * polling.
 */
(() => {
  if (window.__hivefwSidebarBrandLoaded) return;
  window.__hivefwSidebarBrandLoaded = true;

  const ICON_URL = "/hivefw_integration_panel/hivefw-icon.png";
  const observed = new WeakSet();
  let scheduled = false;

  const patchItem = (item) => {
    if (!item || item.querySelector(".hivefw-sidebar-brand")) return;

    const current = item.querySelector(
      'ha-icon[slot="start"], ha-svg-icon[slot="start"]'
    );
    const img = document.createElement("img");
    img.className = "hivefw-sidebar-brand";
    img.slot = "start";
    img.src = ICON_URL;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    Object.assign(img.style, {
      width: "24px",
      height: "24px",
      objectFit: "contain",
      flexShrink: "0",
      display: "block",
    });

    if (current) current.replaceWith(img);
    else item.prepend(img);
  };

  const scan = (root) => {
    if (!root?.querySelectorAll) return;

    patchItem(root.querySelector("#sidebar-panel-hivefw"));

    if (!observed.has(root)) {
      try {
        observer.observe(root, { childList: true, subtree: true });
        observed.add(root);
      } catch (_) {
        // Some transient roots can disappear during a HA navigation update.
      }
    }

    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) scan(el.shadowRoot);
    }
  };

  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan(document);
    });
  };

  const observer = new MutationObserver(scheduleScan);
  scan(document);
  window.addEventListener("location-changed", scheduleScan);
  window.addEventListener("popstate", scheduleScan);
})();
