/**
 * Login interno Racket Central — mismo modelo que sales-dashboard/auth.js.
 * Se carga desde index.html y viewer.html (catálogos RC).
 */
(function () {
  if (window.__rcAuthBooted) return;
  window.__rcAuthBooted = true;

  var USERS_KEY = "rc_users_v1";
  var SESSION_KEY = "rc_session_v1";
  var ALLOWED_DOMAINS = ["racketcentral.com", "racquet360.com"];
  var GOOGLE_CLIENT_ID = "933445557726-hg3lv30bt0a5i2nlvi1n81tbtc9h5ttn.apps.googleusercontent.com";
  var flipbookStarted = false;

  async function sha256(str) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function saveSession(uid) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: uid, t: Date.now() }));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function shouldGate() {
    return !!(window.FLIPBOOK_CONFIG && window.FLIPBOOK_CONFIG.requireAuth === true);
  }

  function showGate() {
    var gate = document.getElementById("rc-auth-gate");
    var app = document.getElementById("rc-flipbook-app");
    if (gate) gate.classList.remove("hidden");
    if (app) app.style.display = "none";
  }

  function hideGate() {
    var gate = document.getElementById("rc-auth-gate");
    var app = document.getElementById("rc-flipbook-app");
    if (gate) gate.classList.add("hidden");
    if (app) app.style.display = "";
  }

  function setAuthError(msg) {
    var el = document.getElementById("auth-error");
    if (el) el.textContent = msg || "";
  }

  function updateUserBar(user) {
    var bar = document.getElementById("rcToolbarUser");
    var name = document.getElementById("rcUserName");
    if (name) name.textContent = user.name || user.email || user.username;
    if (bar) bar.hidden = false;
  }

  function startFlipbookOnce() {
    if (flipbookStarted) return;
    if (typeof window.startFlipbookApp === "function") {
      flipbookStarted = true;
      window.startFlipbookApp();
      return;
    }
    setTimeout(startFlipbookOnce, 50);
  }

  function activateSession(user) {
    hideGate();
    updateUserBar(user);
    startFlipbookOnce();
  }

  function parseJwt(token) {
    try {
      var b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(
        decodeURIComponent(
          atob(b64)
            .split("")
            .map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join("")
        )
      );
    } catch (e) {
      return null;
    }
  }

  window.handleGoogleLogin = function (response) {
    var payload = parseJwt(response.credential);
    if (!payload) {
      setAuthError("Invalid Google token — please try again.");
      return;
    }
    var email = (payload.email || "").toLowerCase();
    var name = payload.name || email;
    var domain = email.split("@")[1] || "";
    if (!ALLOWED_DOMAINS.includes(domain)) {
      setAuthError("Access is limited to @racketcentral.com and @racquet360.com accounts.");
      return;
    }

    var users = getUsers();
    var user = users.find(function (u) {
      return (u.email || "").toLowerCase() === email;
    });
    if (!user) {
      var base = name
        .toLowerCase()
        .replace(/\s+/g, ".")
        .replace(/[^a-z0-9.]/g, "");
      var uname = base;
      var i = 2;
      while (users.find(function (x) {
        return x.username === uname;
      })) {
        uname = base + i;
        i += 1;
      }
      user = {
        id: "u" + Date.now(),
        name: name,
        username: uname,
        email: email,
        role: "member",
        pwHash: null,
        initials: name
          .split(" ")
          .map(function (w) {
            return w[0];
          })
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        createdAt: new Date().toISOString(),
        lastLogin: null,
      };
      users.push(user);
    }
    if (email === "matias@racquet360.com") user.role = "admin";
    user.lastLogin = new Date().toISOString();
    user.name = name;
    user.initials = name
      .split(" ")
      .map(function (w) {
        return w[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
    saveUsers(users);
    saveSession(user.id);
    setAuthError("");
    activateSession(user);
  };

  window.togglePasswordLogin = function () {
    var fb = document.getElementById("pw-fallback");
    if (fb) fb.style.display = fb.style.display === "none" ? "" : "none";
  };

  window.rcLogin = async function () {
    var u = (document.getElementById("auth-username").value || "").trim().toLowerCase();
    var p = document.getElementById("auth-password").value || "";
    setAuthError("");
    if (!u || !p) {
      setAuthError("Enter username and password.");
      return;
    }
    var users = getUsers();
    var user = users.find(function (x) {
      return x.username.toLowerCase() === u;
    });
    if (!user) {
      setAuthError("User not found.");
      return;
    }
    var h = await sha256(p);
    if (h !== user.pwHash) {
      setAuthError("Incorrect password.");
      document.getElementById("auth-password").value = "";
      return;
    }
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
    saveSession(user.id);
    activateSession(user);
  };

  window.logoutUser = function () {
    clearSession();
    flipbookStarted = false;
    var bar = document.getElementById("rcToolbarUser");
    if (bar) bar.hidden = true;
    document.getElementById("auth-username").value = "";
    document.getElementById("auth-password").value = "";
    setAuthError("");
    showGate();
  };

  window.initGoogleSignIn = function () {
    if (!window.google || !google.accounts || !google.accounts.id) return false;
    var container = document.getElementById("google-btn-container");
    if (!container) return false;
    var gate = document.getElementById("rc-auth-gate");
    if (gate && gate.classList.contains("hidden")) return false;

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: function (response) {
        if (window.handleGoogleLogin) window.handleGoogleLogin(response);
      },
      ux_mode: "popup",
      auto_select: false,
    });

    if (!container.dataset.rendered || container.childElementCount < 1) {
      container.innerHTML = "";
      google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "filled_blue",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 300,
      });
      container.dataset.rendered = "1";
    }

    return container.childElementCount > 0;
  };

  window.refreshGoogleSignIn = function () {
    var container = document.getElementById("google-btn-container");
    if (container) {
      container.innerHTML = "";
      delete container.dataset.rendered;
    }
    pollGoogleSignIn();
  };

  async function initAuth() {
    if (!shouldGate()) {
      hideGate();
      var app = document.getElementById("rc-flipbook-app");
      if (app) app.style.display = "";
      startFlipbookOnce();
      return;
    }

    var users = getUsers();
    if (!users.length) {
      users = [
        {
          id: "u_admin",
          name: "Matias Kerlakian",
          username: "admin",
          email: "matias@racquet360.com",
          role: "admin",
          initials: "MK",
          pwHash: await sha256("admin123"),
          createdAt: new Date().toISOString(),
          lastLogin: null,
        },
      ];
      saveUsers(users);
    } else {
      var changed = false;
      users.forEach(function (x) {
        if ((x.email === "matias@racquet360.com" || x.id === "u_admin") && x.role !== "admin") {
          x.role = "admin";
          changed = true;
        }
      });
      if (changed) saveUsers(users);
    }

    var sess = getSession();
    if (sess) {
      var u = getUsers().find(function (x) {
        return x.id === sess.userId;
      });
      if (u) {
        activateSession(u);
        return;
      }
    }
    showGate();
  }

  function bindAuthUi() {
    var pwEl = document.getElementById("auth-password");
    var unEl = document.getElementById("auth-username");
    if (unEl) {
      unEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && pwEl) pwEl.focus();
      });
    }
    if (pwEl) {
      pwEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") window.rcLogin();
      });
    }
    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", window.logoutUser);
  }

  function pollGoogleSignIn() {
    if (window.initGoogleSignIn && window.initGoogleSignIn()) return;
    setTimeout(pollGoogleSignIn, 80);
  }

  window.rcAuthReinit = function () {
    initAuth();
    if (shouldGate()) pollGoogleSignIn();
  };

  function bootAuth() {
    if (document.querySelector('script[src*="viewer-entry"]') && !window.__flipbookConfigReady) {
      setTimeout(bootAuth, 30);
      return;
    }
    bindAuthUi();
    initAuth();
    pollGoogleSignIn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAuth);
  } else {
    bootAuth();
  }
})();
