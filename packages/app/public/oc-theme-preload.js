;(function () {
  var key = "opencode-theme-id"
  var themeId = localStorage.getItem(key)

  // oc-2 was the default before grass. Move installs that never chose a theme once; explicit choices stay.
  if (!localStorage.getItem("opencode-theme-default-migrated")) {
    if (themeId === "oc-2") {
      themeId = "grass"
      localStorage.setItem(key, themeId)
    }

    localStorage.setItem("opencode-theme-default-migrated", "1")
  }

  if (!themeId) themeId = "grass"

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"
  var background = isDark ? "#08090a" : "#e9ebe8"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.style.backgroundColor = background

  // Update theme-color meta tag to match app color scheme
  var metas = document.querySelectorAll("meta[name='theme-color']")
  if (metas.length > 0) metas[0].setAttribute("content", background)

  if (themeId === "grass") return

  var css = localStorage.getItem("opencode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
