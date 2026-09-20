/* Admin console — moderation queue and member management.
   Every view is built with DOM APIs, never innerHTML, so member-supplied text
   can never become markup. */

(function () {
  "use strict";

  var ideaPage = 1;
  var userPage = 1;
  var searchTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function notice(message, tone) {
    var box = $("admin-notice");
    box.textContent = message || "";
    box.setAttribute("data-tone", tone || "success");
    show(box, Boolean(message));
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

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d)
      ? "—"
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // Keeps the label in place and disables the control while a request is in
  // flight, so a double click cannot submit the same form twice.
  function busy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.classList.toggle("is-busy", isBusy);
    if (isBusy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function statusTag(status, label) {
    var tag = el("span", "tag", label || status);
    tag.setAttribute("data-status", status);
    return tag;
  }

  /* Sign-in --------------------------------------------------------------- */

  function wireLogin() {
    var form = $("login-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var box = $("login-notice");
      show(box, false);

      var button = $("login-submit");
      button.disabled = true;
      button.classList.add("is-busy");
      button.setAttribute("aria-busy", "true");

      api("/api/admin/login", {
        method: "POST",
        body: { email: $("login-email").value, password: $("login-password").value },
      })
        .then(function (result) {
          if (result.ok) {
            $("login-password").value = "";
            openConsole();
            return;
          }
          box.textContent = result.data.error || "Sign-in failed.";
          box.setAttribute("data-tone", "error");
          show(box, true);
          $("login-password").focus();
        })
        .catch(function () {
          box.textContent = "Could not reach the server.";
          box.setAttribute("data-tone", "error");
          show(box, true);
        })
        .finally(function () {
          button.disabled = false;
          button.classList.remove("is-busy");
          button.removeAttribute("aria-busy");
        });
    });

    $("admin-signout").addEventListener("click", function () {
      api("/api/admin/logout", { method: "POST", body: {} }).then(function () {
        show($("console"), false);
        show($("login-shell"), true);
        $("login-email").focus();
      });
    });
  }

  // A 401 anywhere means the session lapsed; drop back to the sign-in screen.
  function guard(result) {
    if (result.status === 401) {
      show($("console"), false);
      show($("login-shell"), true);
      return false;
    }
    return result.ok;
  }

  /* Team ------------------------------------------------------------------ */

  function resetTeamForm() {
    var form = $("team-form");
    form.reset();
    $("team-id").value = "";
    $("team-sort").value = "10";
    $("team-form-title").textContent = "Add a team member";
    $("team-submit").textContent = "Add member";
    show($("team-cancel"), false);
    show($("team-photo-current"), false);
    clearTeamErrors();
    notice("");
  }

  function clearTeamErrors() {
    var form = $("team-form");
    form.querySelectorAll(".field-error").forEach(function (p) {
      p.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
    show($("team-notice"), false);
  }

  function editTeamMember(member) {
    clearTeamErrors();
    $("team-id").value = member.id;
    $("team-name").value = member.name;
    $("team-role").value = member.role || "";
    $("team-bio").value = member.bio || "";
    $("team-linkedin").value = member.linkedinUrl || "";
    $("team-sort").value = String(member.sortOrder);
    $("team-status").value = member.status;
    $("team-photo").value = "";
    $("team-form-title").textContent = "Edit " + member.name;
    $("team-submit").textContent = "Save changes";
    show($("team-cancel"), true);

    var current = $("team-photo-current");
    current.textContent = member.photoUrl
      ? "A photo is already set. Choosing a file replaces it; leaving it empty keeps it."
      : "No photo yet.";
    show(current, true);

    $("team-form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("team-name").focus();
  }

  function removeTeamMember(id, name) {
    if (!window.confirm("Permanently delete " + name + " from the team? This cannot be undone.")) {
      return;
    }
    api("/api/admin/team/" + encodeURIComponent(id), { method: "DELETE" }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That team member could not be deleted.", "error");
        return;
      }
      notice(name + " removed.", "info");
      if ($("team-id").value === id) resetTeamForm();
      loadTeam();
    });
  }

  function renderTeam(payload) {
    var wrap = $("team-results");
    wrap.textContent = "";

    $("team-count").textContent = payload.team.length
      ? payload.team.length + (payload.team.length === 1 ? " member" : " members")
      : "";

    if (!payload.team.length) {
      var blank = el("div", "empty");
      blank.append(
        el("strong", null, "No team members yet"),
        el("p", null, "Add the first one with the form above.")
      );
      wrap.append(blank);
      return;
    }

    payload.team.forEach(function (member) {
      var card = el("div", "admin-idea team-row");

      if (member.photoUrl) {
        var img = document.createElement("img");
        img.className = "team-row-photo";
        img.src = member.photoUrl;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.loading = "lazy";
        card.append(img);
      }

      var main = el("div", "team-row-main");
      main.append(el("h3", null, member.name));

      var meta = el("div", "idea-meta flush");
      meta.append(
        statusTag(
          member.status === "published" ? "approved" : "pending",
          member.status === "published" ? "Published" : "Draft"
        ),
        el("span", "idea-author", member.role || "—"),
        el("span", null, "order " + member.sortOrder),
        el("span", null, member.photoUrl ? "photo set" : "no photo")
      );
      main.append(meta);
      main.append(el("p", "body", member.bio));

      var actions = el("div", "stack");
      var edit = el("button", "button primary small", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () {
        editTeamMember(member);
      });
      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeTeamMember(member.id, member.name);
      });
      actions.append(edit, del);
      main.append(actions);

      card.append(main);
      wrap.append(card);
    });
  }

  function loadTeam() {
    return api("/api/admin/team").then(function (result) {
      if (!guard(result)) return;
      renderTeam(result.data);
    });
  }

  // Multipart rather than JSON, so the portrait rides along with the fields in
  // one request and there is no half-saved profile if the photo fails.
  function submitTeam(event) {
    event.preventDefault();
    clearTeamErrors();

    var form = $("team-form");
    var id = $("team-id").value;
    var button = $("team-submit");
    var data = new FormData(form);
    data.delete("id");

    // An empty file input still serialises an entry; dropping it keeps the
    // server's "no file means keep the current photo" rule intact.
    var file = $("team-photo").files[0];
    if (!file) data.delete("photo");

    busy(button, true);
    fetch(id ? "/api/admin/team/" + encodeURIComponent(id) : "/api/admin/team", {
      method: "POST",
      body: data,
      credentials: "same-origin",
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            return { ok: response.ok, status: response.status, data: payload };
          });
      })
      .then(function (result) {
        if (!guard(result)) {
          if (result.data.fields) {
            Object.keys(result.data.fields).forEach(function (name) {
              var target = $("err-team-" + name);
              if (target) target.textContent = result.data.fields[name];
              var input = form.querySelector('[name="' + name + '"]');
              if (input) input.setAttribute("aria-invalid", "true");
            });
          }
          var el_ = $("team-notice");
          el_.textContent = result.data.error || "That did not save.";
          el_.setAttribute("data-tone", "error");
          show(el_, true);
          return;
        }
        // Reset first: it clears the notice bar, so setting the message
        // afterwards is what makes the confirmation actually survive.
        resetTeamForm();
        notice(
          id ? result.data.name + " updated." : result.data.name + " added to the team.",
          "success"
        );
        loadTeam();
      })
      .catch(function () {
        notice("Network error. Please try again.", "error");
      })
      .finally(function () {
        busy(button, false);
      });
  }

  /* Testimonials ---------------------------------------------------------- */

  var testimonialPage = 1;

  function decideTestimonial(id, status) {
    return api("/api/admin/testimonials/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status: status, notify: true },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That change did not save.", "error");
        return;
      }
      notice(
        status === "published"
          ? "Published." + (result.data.notified ? " The author has been emailed." : "")
          : status === "rejected"
          ? "Marked as not published." +
            (result.data.notified ? " The author has been emailed." : "")
          : "Moved back to the review queue.",
        "success"
      );
      loadTestimonials();
      loadStats();
    });
  }

  function removeTestimonial(id, name) {
    if (!window.confirm("Permanently delete the testimonial from " + name + "? This cannot be undone.")) {
      return;
    }
    api("/api/admin/testimonials/" + encodeURIComponent(id), { method: "DELETE" }).then(
      function (result) {
        if (!guard(result)) {
          notice(result.data.error || "That testimonial could not be deleted.", "error");
          return;
        }
        notice("Testimonial deleted.", "info");
        loadTestimonials();
        loadStats();
      }
    );
  }

  var TESTIMONIAL_LABELS = {
    unconfirmed: "Unconfirmed",
    pending: "Awaiting review",
    published: "Published",
    rejected: "Not published",
  };

  function renderTestimonials(payload) {
    var wrap = $("testimonial-results");
    wrap.textContent = "";

    $("testimonial-count").textContent = payload.total
      ? payload.total + (payload.total === 1 ? " testimonial" : " testimonials") + " found"
      : "";

    if (!payload.testimonials.length) {
      var blank = el("div", "empty");
      blank.append(
        el("strong", null, "Nothing to review"),
        el("p", null, "No testimonials match these filters.")
      );
      wrap.append(blank);
      show($("testimonial-pager"), false);
      return;
    }

    payload.testimonials.forEach(function (t) {
      var card = el("div", "admin-idea");
      card.append(el("h3", null, t.name));

      var meta = el("div", "idea-meta flush");
      meta.append(
        statusTag(
          t.status === "published" ? "approved" : t.status === "rejected" ? "rejected" : "pending",
          TESTIMONIAL_LABELS[t.status] || t.status
        ),
        el("span", "idea-author", t.role || "—"),
        el("span", null, t.organisation || "—"),
        el("span", null, t.email || "no email (seeded)"),
        el("span", null, formatDate(t.createdAt))
      );
      card.append(meta);

      if (t.relationship) card.append(el("p", "body muted", t.relationship));

      // Paragraphs are preserved, and each is set as text so a submitter's
      // words can never become markup in the console either.
      var bodyWrap = el("div", "body");
      String(t.body)
        .split(/\n{2,}/)
        .forEach(function (para) {
          if (para.trim()) bodyWrap.append(el("p", null, para.trim()));
        });
      card.append(bodyWrap);

      var actions = el("div", "stack");

      if (t.status === "unconfirmed") {
        actions.append(
          el("span", "hint", "Waiting on the author to confirm their email. Cannot be published yet.")
        );
      } else {
        if (t.status !== "published") {
          var publish = el("button", "button primary small", "Publish");
          publish.type = "button";
          publish.addEventListener("click", function () {
            decideTestimonial(t.id, "published");
          });
          actions.append(publish);
        }
        if (t.status !== "rejected") {
          var reject = el("button", "button quiet small", "Do not publish");
          reject.type = "button";
          reject.addEventListener("click", function () {
            decideTestimonial(t.id, "rejected");
          });
          actions.append(reject);
        }
        if (t.status !== "pending") {
          var reopen = el("button", "button quiet small", "Back to review");
          reopen.type = "button";
          reopen.addEventListener("click", function () {
            decideTestimonial(t.id, "pending");
          });
          actions.append(reopen);
        }
      }

      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeTestimonial(t.id, t.name);
      });
      actions.append(del);

      card.append(actions);
      wrap.append(card);
    });

    show($("testimonial-pager"), payload.hasMore || payload.page > 1);
    $("testimonial-prev").disabled = payload.page <= 1;
    $("testimonial-next").disabled = !payload.hasMore;
  }

  function loadTestimonials() {
    var query = new URLSearchParams({
      q: $("testimonial-search").value,
      status: $("testimonial-status").value,
      page: String(testimonialPage),
    });
    return api("/api/admin/testimonials?" + query).then(function (result) {
      if (!guard(result)) return;
      renderTestimonials(result.data);
    });
  }

  /* Stages ---------------------------------------------------------------- */

  // Labels and ordering come from lib/stages.js via the API, so adding a stage
  // there needs no change here.
  var stages = [];

  function stageLabel(key) {
    for (var i = 0; i < stages.length; i += 1) {
      if (stages[i].key === key) return stages[i].label;
    }
    return key || "—";
  }

  function loadStages() {
    return api("/api/stages")
      .then(function (result) {
        if (result.ok && result.data.stages) {
          stages = result.data.stages;
          var select = $("idea-stage");
          stages.forEach(function (stage) {
            var option = el("option", null, stage.label);
            option.value = stage.key;
            select.append(option);
          });
        }
      })
      .catch(function () {
        /* Stage controls degrade to absent rather than breaking the console. */
      });
  }

  function renderPipeline(byStage) {
    var track = $("pipeline");
    track.textContent = "";
    if (!byStage || !byStage.length) return;

    byStage.forEach(function (stage) {
      var step = el("button", "pipeline-step");
      step.type = "button";
      step.setAttribute("data-stage", stage.key);
      if (!stage.pipeline) step.setAttribute("data-off", "true");
      if (stage.count > 0) step.setAttribute("data-filled", "true");
      step.append(
        el("strong", null, String(stage.count)),
        el("span", null, stage.label)
      );
      step.title = "Show published ideas at: " + stage.label;
      step.addEventListener("click", function () {
        $("idea-status").value = "approved";
        $("idea-stage").value = stage.key;
        ideaPage = 1;
        selectTab("ideas");
        loadIdeas();
      });
      track.append(step);
    });
  }

  /* Stats ----------------------------------------------------------------- */

  function loadStats() {
    return api("/api/admin/stats").then(function (result) {
      if (!guard(result)) return;
      var grid = $("stats");
      grid.textContent = "";

      // The accent stripe draws the eye to the queue that needs working.
      var t = result.data.testimonials || {};
      [
        ["Ideas awaiting review", result.data.ideas.pending, "attention"],
        ["Testimonials awaiting review", t.pending || 0, "attention"],
        ["Published ideas", result.data.ideas.approved, "good"],
        ["Published testimonials", t.published || 0, "good"],
        ["Active members", result.data.users.active, "good"],
        ["Unconfirmed members", result.data.users.pending, null],
        ["Suspended", result.data.users.suspended, "warn"],
      ].forEach(function (row) {
        var card = el("div", "stat");
        // Zero needs no accent: an empty queue is not something to flag.
        if (row[2] && row[1] > 0) card.setAttribute("data-accent", row[2]);
        card.append(el("strong", null, String(row[1])), el("span", null, row[0]));
        grid.append(card);
      });

      renderPipeline(result.data.stages);
    });
  }

  /* Ideas ----------------------------------------------------------------- */

  function decide(id, status, notify) {
    return api("/api/admin/ideas/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status: status, notify: notify },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That change did not save.", "error");
        return;
      }
      notice(
        status === "approved"
          ? "Published." + (result.data.notified ? " The author has been emailed." : "")
          : status === "rejected"
          ? "Marked as not published." + (result.data.notified ? " The author has been emailed." : "")
          : "Moved back to the review queue.",
        "success"
      );
      loadIdeas();
      loadStats();
    });
  }

  function moveStage(id, stage) {
    return api("/api/admin/ideas/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { stage: stage },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That stage change did not save.", "error");
        return;
      }
      notice(
        result.data.stageMoved
          ? "Moved to " + stageLabel(stage) + "."
          : "Already at " + stageLabel(stage) + ".",
        result.data.stageMoved ? "success" : "info"
      );
      loadIdeas();
      loadStats();
    });
  }

  function removeIdea(id, title) {
    if (!window.confirm('Permanently delete "' + title + '"? This cannot be undone.')) return;
    api("/api/admin/ideas/" + encodeURIComponent(id), { method: "DELETE" }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That idea could not be deleted.", "error");
        return;
      }
      notice("Idea deleted.", "info");
      loadIdeas();
      loadStats();
    });
  }

  function renderIdeas(payload) {
    var wrap = $("idea-results");
    wrap.textContent = "";

    $("idea-count").textContent = payload.total
      ? payload.total + (payload.total === 1 ? " idea" : " ideas") + " found"
      : "";

    if (!payload.ideas.length) {
      var blank = el("div", "empty");
      blank.append(
        el("strong", null, "Nothing to review"),
        el("p", null, "No ideas match these filters.")
      );
      wrap.append(blank);
      show($("idea-pager"), false);
      return;
    }

    payload.ideas.forEach(function (idea) {
      var card = el("div", "admin-idea");
      card.append(el("h3", null, idea.title));

      var meta = el("div", "idea-meta flush");
      meta.append(
        statusTag(
          idea.status,
          idea.status === "approved"
            ? "Published"
            : idea.status === "rejected"
            ? "Not published"
            : "Awaiting review"
        ),
        el("span", "idea-author", idea.author.name),
        el("span", null, idea.author.title),
        el("span", null, idea.author.email),
        el("span", null, formatDate(idea.createdAt))
      );
      card.append(meta);
      card.append(el("p", "body", idea.description));

      var stageRow = el("div", "stage-control");
      var stageId = "stage-" + idea.id;
      var stageLab = el("label", null, "Stage");
      stageLab.setAttribute("for", stageId);
      var stageSelect = el("select");
      stageSelect.id = stageId;
      stages.forEach(function (stage) {
        var option = el("option", null, stage.label);
        option.value = stage.key;
        if (stage.key === idea.stage) option.selected = true;
        stageSelect.append(option);
      });
      stageSelect.addEventListener("change", function () {
        moveStage(idea.id, stageSelect.value);
      });
      stageRow.append(stageLab, stageSelect);
      if (idea.stageChangedAt) {
        stageRow.append(el("span", "stage-moved", "moved " + formatDate(idea.stageChangedAt)));
      }
      if (stages.length) card.append(stageRow);

      var actions = el("div", "stack");

      if (idea.status !== "approved") {
        var approve = el("button", "button primary small", "Publish");
        approve.type = "button";
        approve.addEventListener("click", function () {
          decide(idea.id, "approved", true);
        });
        actions.append(approve);
      }

      if (idea.status !== "rejected") {
        var reject = el("button", "button quiet small", "Do not publish");
        reject.type = "button";
        reject.addEventListener("click", function () {
          decide(idea.id, "rejected", true);
        });
        actions.append(reject);
      }

      if (idea.status !== "pending") {
        var reopen = el("button", "button quiet small", "Back to review");
        reopen.type = "button";
        reopen.addEventListener("click", function () {
          decide(idea.id, "pending", false);
        });
        actions.append(reopen);
      }

      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeIdea(idea.id, idea.title);
      });
      actions.append(del);

      card.append(actions);
      wrap.append(card);
    });

    show($("idea-pager"), payload.hasMore || payload.page > 1);
    $("idea-prev").disabled = payload.page <= 1;
    $("idea-next").disabled = !payload.hasMore;
  }

  function loadIdeas() {
    var query = new URLSearchParams({
      q: $("idea-search").value,
      status: $("idea-status").value,
      stage: $("idea-stage").value,
      page: String(ideaPage),
    });
    return api("/api/admin/ideas?" + query).then(function (result) {
      if (!guard(result)) return;
      renderIdeas(result.data);
    });
  }

  /* Members --------------------------------------------------------------- */

  function setUserStatus(id, status, name) {
    if (
      status === "suspended" &&
      !window.confirm("Suspend " + name + "? They are signed out immediately and cannot post.")
    ) {
      return;
    }
    api("/api/admin/users/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status: status },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That change did not save.", "error");
        return;
      }
      notice(status === "suspended" ? name + " is suspended." : name + " is active.", "success");
      loadUsers();
      loadStats();
    });
  }

  function removeUser(id, name) {
    if (
      !window.confirm(
        "Permanently delete " + name + " and every idea they posted? This cannot be undone."
      )
    ) {
      return;
    }
    api("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That member could not be deleted.", "error");
        return;
      }
      notice(name + " has been deleted.", "info");
      loadUsers();
      loadStats();
      loadIdeas();
    });
  }

  function renderUsers(payload) {
    var body = $("user-rows");
    body.textContent = "";

    $("user-count").textContent = payload.total
      ? payload.total + (payload.total === 1 ? " member" : " members") + " found"
      : "";

    if (!payload.users.length) {
      var row = el("tr");
      var cell = el("td", "muted", "No members match these filters.");
      cell.colSpan = 6;
      row.append(cell);
      body.append(row);
      show($("user-pager"), false);
      return;
    }

    payload.users.forEach(function (user) {
      var name = user.firstName + " " + user.lastName;
      var row = el("tr");

      var who = el("td");
      who.append(el("strong", null, name), el("div", "muted", user.title));
      row.append(who);

      var contact = el("td");
      contact.append(el("div", null, user.email), el("div", "muted nowrap", user.phone));
      row.append(contact);

      var status = el("td");
      status.append(
        statusTag(
          user.status,
          user.status === "active"
            ? "Active"
            : user.status === "suspended"
            ? "Suspended"
            : "Unconfirmed"
        )
      );
      row.append(status);

      row.append(el("td", "nowrap", user.approvedCount + " of " + user.ideaCount + " live"));
      row.append(el("td", "nowrap", formatDate(user.createdAt)));

      var actions = el("td");
      var stack = el("div", "stack");

      if (user.status === "suspended") {
        var restore = el("button", "button quiet small", "Reactivate");
        restore.type = "button";
        restore.addEventListener("click", function () {
          setUserStatus(user.id, "active", name);
        });
        stack.append(restore);
      } else if (user.status === "active") {
        var suspend = el("button", "button quiet small", "Suspend");
        suspend.type = "button";
        suspend.addEventListener("click", function () {
          setUserStatus(user.id, "suspended", name);
        });
        stack.append(suspend);
      }

      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeUser(user.id, name);
      });
      stack.append(del);

      actions.append(stack);
      row.append(actions);
      body.append(row);
    });

    show($("user-pager"), payload.hasMore || payload.page > 1);
    $("user-prev").disabled = payload.page <= 1;
    $("user-next").disabled = !payload.hasMore;
  }

  function loadUsers() {
    var query = new URLSearchParams({
      q: $("user-search").value,
      status: $("user-status").value,
      sort: $("user-sort").value,
      page: String(userPage),
    });
    return api("/api/admin/users?" + query).then(function (result) {
      if (!guard(result)) return;
      renderUsers(result.data);
    });
  }

  /* Wiring ---------------------------------------------------------------- */

  function debounce(fn) {
    return function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(fn, 250);
    };
  }

  var TABS = ["ideas", "testimonials", "team", "users"];

  function selectTab(which) {
    TABS.forEach(function (name) {
      var active = name === which;
      $("tab-" + name).setAttribute("aria-selected", String(active));
      show($("panel-" + name), active);
    });
    notice("");
    if (which === "ideas") loadIdeas();
    else if (which === "testimonials") loadTestimonials();
    else if (which === "team") loadTeam();
    else loadUsers();
  }

  function wireConsole() {
    TABS.forEach(function (name) {
      $("tab-" + name).addEventListener("click", function () {
        selectTab(name);
      });
    });

    $("team-form").addEventListener("submit", submitTeam);
    $("team-cancel").addEventListener("click", resetTeamForm);

    $("testimonial-search").addEventListener(
      "input",
      debounce(function () {
        testimonialPage = 1;
        loadTestimonials();
      })
    );
    $("testimonial-status").addEventListener("change", function () {
      testimonialPage = 1;
      loadTestimonials();
    });
    $("testimonial-prev").addEventListener("click", function () {
      if (testimonialPage > 1) {
        testimonialPage -= 1;
        loadTestimonials();
      }
    });
    $("testimonial-next").addEventListener("click", function () {
      testimonialPage += 1;
      loadTestimonials();
    });

    $("idea-search").addEventListener(
      "input",
      debounce(function () {
        ideaPage = 1;
        loadIdeas();
      })
    );
    ["idea-status", "idea-stage"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        ideaPage = 1;
        loadIdeas();
      });
    });
    $("idea-prev").addEventListener("click", function () {
      if (ideaPage > 1) {
        ideaPage -= 1;
        loadIdeas();
      }
    });
    $("idea-next").addEventListener("click", function () {
      ideaPage += 1;
      loadIdeas();
    });

    $("user-search").addEventListener(
      "input",
      debounce(function () {
        userPage = 1;
        loadUsers();
      })
    );
    ["user-status", "user-sort"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        userPage = 1;
        loadUsers();
      });
    });
    $("user-prev").addEventListener("click", function () {
      if (userPage > 1) {
        userPage -= 1;
        loadUsers();
      }
    });
    $("user-next").addEventListener("click", function () {
      userPage += 1;
      loadUsers();
    });
  }

  function openConsole() {
    show($("login-shell"), false);
    show($("console"), true);
    loadStats();
    loadStages().then(function () {
      selectTab("ideas");
    });
  }

  // Ask the server whether the admin cookie is still good before showing
  // anything; the console never renders on client-side trust alone.
  api("/api/admin/session").then(function (result) {
    if (result.ok && result.data.admin) openConsole();
    else {
      show($("login-shell"), true);
      $("login-email").focus();
    }
  });

  wireLogin();
  wireConsole();
})();
