/* Ideas board — registration, passwordless sign-in, and idea submission.
   No inline script anywhere, so the page keeps a strict script-src 'self' CSP. */

(function () {
  "use strict";

  var WORD_MIN = 25;
  var WORD_MAX = 100;
  var page = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function notice(message, tone) {
    var el = $("account-notice");
    el.textContent = message || "";
    el.setAttribute("data-tone", tone || "success");
    show(el, Boolean(message));
    if (message) el.scrollIntoView({ block: "nearest" });
  }

  function clearErrors(scope) {
    var node = typeof scope === "string" ? $(scope) : scope;
    if (!node) return;
    node.querySelectorAll(".field-error").forEach(function (p) {
      p.textContent = "";
    });
    node.querySelectorAll("[aria-invalid]").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
  }

  // Maps the server's { fields: { email: "…" } } onto the matching inputs.
  function applyFieldErrors(fields, prefix, form) {
    if (!fields) return;
    var first = null;
    Object.keys(fields).forEach(function (name) {
      var target = $(prefix + name);
      if (target) target.textContent = fields[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) {
        input.setAttribute("aria-invalid", "true");
        if (!first) first = input;
      }
    });
    if (first) first.focus();
  }

  function api(path, options) {
    var settings = options || {};
    return fetch(path, {
      method: settings.method || "GET",
      headers: settings.body ? { "Content-Type": "application/json" } : undefined,
      body: settings.body ? JSON.stringify(settings.body) : undefined,
      credentials: "same-origin",
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
    });
  }

  function busy(button, isBusy, restingLabel) {
    if (!button) return;
    button.disabled = isBusy;
    if (isBusy) {
      button.dataset.label = button.textContent;
      button.textContent = "Working…";
    } else {
      button.textContent = restingLabel || button.dataset.label || button.textContent;
    }
  }

  function formValues(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      out[key] = typeof value === "string" ? value : "";
    });
    return out;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function countWords(text) {
    var trimmed = String(text || "").trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  /* Public board ---------------------------------------------------------- */

  function renderBoard(payload) {
    var list = $("board-list");
    var state = $("board-state");
    list.textContent = "";

    if (!payload.ideas.length) {
      show(list, false);
      show($("board-pager"), false);
      state.textContent =
        page > 1 ? "No more ideas on this page." : "No ideas have been published yet. Yours could be the first.";
      show(state, true);
      return;
    }

    payload.ideas.forEach(function (idea) {
      var item = document.createElement("li");
      item.className = "idea-card";

      var heading = document.createElement("h3");
      heading.textContent = idea.title;

      var body = document.createElement("p");
      body.textContent = idea.description;

      var meta = document.createElement("div");
      meta.className = "idea-meta";

      var author = document.createElement("span");
      author.className = "idea-author";
      author.textContent = idea.author;

      var role = document.createElement("span");
      role.textContent = idea.authorTitle;

      var when = document.createElement("span");
      when.textContent = formatDate(idea.createdAt);

      meta.append(author, role, when);
      item.append(heading, body, meta);
      list.append(item);
    });

    show(state, false);
    show(list, true);
    show($("board-pager"), payload.hasMore || page > 1);
    $("board-prev").disabled = page <= 1;
    $("board-next").disabled = !payload.hasMore;
    $("board-count").textContent = "Page " + page;
  }

  function loadBoard() {
    return api("/api/ideas?page=" + page).then(function (result) {
      if (!result.ok) {
        $("board-state").textContent = "The ideas board could not be loaded. Please refresh.";
        show($("board-state"), true);
        return;
      }
      renderBoard(result.data);
    });
  }

  /* Account state --------------------------------------------------------- */

  function showSignedOut(mode) {
    show($("view-post"), false);
    show($("mine-panel"), false);
    show($("view-register"), mode !== "signin");
    show($("view-signin"), mode === "signin");
  }

  function showSignedIn(user) {
    show($("view-register"), false);
    show($("view-signin"), false);
    show($("view-post"), true);
    $("post-greeting").textContent =
      "Welcome back, " + user.firstName + ". Ideas are reviewed before they appear on the board.";
    $("post-email").textContent = user.email;
    loadMine();
  }

  function refreshAccount() {
    return api("/api/me").then(function (result) {
      if (result.ok && result.data.user) {
        showSignedIn(result.data.user);
        return result.data.user;
      }
      showSignedOut("register");
      return null;
    });
  }

  function loadMine() {
    return api("/api/ideas/mine").then(function (result) {
      if (!result.ok) return;
      var list = $("mine-list");
      list.textContent = "";

      if (!result.data.ideas.length) {
        show($("mine-panel"), false);
        return;
      }

      result.data.ideas.forEach(function (idea) {
        var item = document.createElement("li");
        item.className = "idea-card";

        var heading = document.createElement("h3");
        heading.textContent = idea.title;

        var meta = document.createElement("div");
        meta.className = "idea-meta";

        var tag = document.createElement("span");
        tag.className = "tag";
        tag.setAttribute("data-status", idea.status);
        tag.textContent =
          idea.status === "approved"
            ? "Published"
            : idea.status === "rejected"
            ? "Not published"
            : "In review";

        var when = document.createElement("span");
        when.textContent = "Submitted " + formatDate(idea.createdAt);

        meta.append(tag, when);
        item.append(heading, meta);
        list.append(item);
      });

      show($("mine-panel"), true);
    });
  }

  /* Wiring ---------------------------------------------------------------- */

  function wireRegister() {
    var form = $("register-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-register");
      notice("");
      busy($("register-submit"), true);

      api("/api/register", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            notice(result.data.message, "success");
            return;
          }
          applyFieldErrors(result.data.fields, "err-", form);
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("register-submit"), false, "Send my confirmation link");
        });
    });
  }

  function wireSignIn() {
    var form = $("signin-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-signin");
      notice("");
      busy($("signin-submit"), true);

      api("/api/login", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            notice(result.data.message, "success");
            return;
          }
          if (result.data.fields && result.data.fields.email) {
            $("err-signin-email").textContent = result.data.fields.email;
            $("signin-email").setAttribute("aria-invalid", "true");
          }
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("signin-submit"), false, "Email me a sign-in link");
        });
    });
  }

  function wireIdeaForm() {
    var form = $("idea-form");
    var description = $("idea-description");
    var counter = $("idea-count");

    description.addEventListener("input", function () {
      var words = countWords(description.value);
      counter.textContent = String(words);
      counter.setAttribute(
        "data-state",
        words < WORD_MIN ? "under" : words > WORD_MAX ? "over" : "ok"
      );
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-post");
      notice("");
      busy($("idea-submit"), true);

      api("/api/ideas", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            counter.textContent = "0";
            counter.setAttribute("data-state", "under");
            notice(result.data.message, "success");
            loadMine();
            return;
          }
          if (result.status === 401) {
            notice(result.data.error, "error");
            refreshAccount();
            return;
          }
          applyFieldErrors(result.data.fields, "err-idea-", form);
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("idea-submit"), false, "Submit for review");
        });
    });
  }

  function wireNav() {
    $("to-signin").addEventListener("click", function () {
      notice("");
      clearErrors("view-signin");
      showSignedOut("signin");
      $("signin-email").focus();
    });

    $("to-register").addEventListener("click", function () {
      notice("");
      clearErrors("view-register");
      showSignedOut("register");
      $("reg-first").focus();
    });

    $("sign-out").addEventListener("click", function () {
      api("/api/logout", { method: "POST", body: {} }).then(function () {
        showSignedOut("register");
        notice("You are signed out.", "info");
      });
    });

    $("board-prev").addEventListener("click", function () {
      if (page > 1) {
        page -= 1;
        loadBoard();
      }
    });

    $("board-next").addEventListener("click", function () {
      page += 1;
      loadBoard();
    });
  }

  // Messages carried back from the emailed links, via /api/verify and /api/auth.
  function handleAuthRedirect() {
    var params = new URLSearchParams(window.location.search);
    var state = params.get("auth");
    if (!state) return;

    if (state === "verified") {
      notice("Your email is confirmed and you are signed in. Share your first idea below.", "success");
    } else if (state === "signed-in") {
      notice("You are signed in.", "success");
    } else if (state === "invalid") {
      notice(
        "That link has expired or has already been used. Request a new one below.",
        "error"
      );
    } else if (state === "suspended") {
      notice("That account cannot be used at the moment. Please get in touch.", "error");
    }

    // Drop the parameter so a refresh does not repeat the message.
    window.history.replaceState({}, "", window.location.pathname);
  }

  wireRegister();
  wireSignIn();
  wireIdeaForm();
  wireNav();
  handleAuthRedirect();
  refreshAccount();
  loadBoard();
})();
