/*
 * HiveFW sidebar brand hook.
 *
 * Home Assistant's panel API accepts an MDI icon, not an image URL. This
 * module replaces the HiveFW fallback icon with brand/icon.png.
 *
 * Performance note: after one initial discovery pass, mutations are handled
 * incrementally. Only newly-added DOM/shadow-root subtrees are inspected;
 * the complete Home Assistant DOM is not rescanned on every mutation.
 */
(() => {
  if (window.__hivefwSidebarBrandLoaded) return;
  window.__hivefwSidebarBrandLoaded = true;

  const ICON_URL = "/hivefw_integration_panel/hivefw-icon.png";
  const observed = new WeakSet();

  const patchItem = (root) => {
    if (!root?.querySelector) return;
    const item = root.querySelector("#sidebar-panel-hivefw");
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

  const observeRoot = (root) => {
    if (!root?.querySelectorAll || observed.has(root)) return;
    patchItem(root);
    try {
      observer.observe(root, { childList: true, subtree: true });
      observed.add(root);
    } catch (_) {
      return;
    }
  };

  const discover = (root) => {
    if (!root) return;

    if (root.querySelectorAll) {
      observeRoot(root);
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) discover(el.shadowRoot);
      }
    } else if (root.nodeType === Node.ELEMENT_NODE && root.shadowRoot) {
      discover(root.shadowRoot);
    }
  };

  const discoverAdded = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const el = /** @type {Element} */ (node);

    if (el.id === "sidebar-panel-hivefw") {
      patchItem(el.parentNode?.getRootNode?.() || document);
    }
    if (el.shadowRoot) discover(el.shadowRoot);

    for (const child of el.querySelectorAll?.("*") || []) {
      if (child.shadowRoot) discover(child.shadowRoot);
    }

    const root = el.getRootNode?.();
    if (root?.querySelector) patchItem(root);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const root = mutation.target?.getRootNode?.();
      if (root?.querySelector) patchItem(root);
      for (const node of mutation.addedNodes) discoverAdded(node);
    }
  });

  const rediscover = () => requestAnimationFrame(() => discover(document));

  discover(document);
  window.addEventListener("location-changed", rediscover);
  window.addEventListener("popstate", rediscover);
})();
