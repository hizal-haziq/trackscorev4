// Legacy shells stay hidden until the existing Bearer session is server-verified.
(() => {
  const expected = document.currentScript?.dataset.role;
  const destinations = {
    manager: "/dashboard.html",
    assessor: "/index.html",
    vendor: "/vendor-portal.html",
  };
  document.documentElement.style.visibility = "hidden";
  let controller,
    generation = 0,
    timer;
  const clear = () => {
    for (const key of [
      "trackscore_token",
      "trackscore_user_role",
      "trackscore_user",
    ])
      localStorage.removeItem(key);
    sessionStorage.removeItem("manager_authenticated");
  };
  const deny = () => {
    clear();
    location.replace("/login.html");
  };
  const verify = async () => {
    controller?.abort();
    clearTimeout(timer);
    controller = new AbortController();
    const signal = controller.signal,
      current = ++generation;
    let token;
    try {
      token = localStorage.getItem("trackscore_token");
    } catch {
      return deny();
    }
    if (!token) return deny();
    // Reject obviously expired/malformed sessions before legacy inline redirects run.
    // Signature and role authority still come exclusively from verify-session.
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return deny();
      const decoded = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (
        !destinations[decoded.role] ||
        !Number.isFinite(decoded.exp) ||
        decoded.exp * 1000 <= Date.now()
      )
        return deny();
    } catch {
      return deny();
    }

    try {
      const response = await fetch("/.netlify/functions/verify-session", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Session denied");
      const result = await response.json();
      if (signal.aborted || generation !== current) return;
      if (!result.success || !destinations[result.role]) return deny();
      localStorage.setItem("trackscore_user_role", result.role);
      if (result.mustChangePassword)
        return location.replace("/change-password.html");
      if (result.role !== expected)
        return location.replace(destinations[result.role]);
      document.documentElement.style.visibility = "";
      timer = setTimeout(
        deny,
        Math.min(2_147_483_647, Math.max(0, result.expiresAt - Date.now())),
      );
    } catch {
      if (!signal.aborted && generation === current) deny();
    }
  };
  window.addEventListener("storage", verify);
  window.addEventListener("pagehide", () => {
    controller?.abort();
    clearTimeout(timer);
    document.documentElement.style.visibility = "hidden";
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) verify();
  });
  verify();
})();
