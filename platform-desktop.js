/* 20 Vision Material Take Off — desktop (installable web app) layer, loaded last.
   Adds: subscription gate (Lemon Squeezy licence keys + access codes), "Install app" button, offline support. */
(function () {
  "use strict";
  var CODE_KEY = "tv-access-code", LIC_KEY = "tv-licence";
  var CODES = { "20VISION-REVIEW-2026": true };
  // Lemon Squeezy checkout for the $7.99/month desktop subscription
  var BUY_URL = "https://20vision.lemonsqueezy.com/checkout/buy/13cb22b3-7246-417d-bd9b-9849f1a581a3";
  var MANAGE_URL = "https://app.lemonsqueezy.com/my-orders";
  var LS = "https://api.lemonsqueezy.com/v1/licenses/";
  var RECHECK_MS = 24 * 3600 * 1000, GRACE_MS = 14 * 24 * 3600 * 1000;
  var SUPPORT = "info@20visionelectric.com";

  function code() { try { return (localStorage.getItem(CODE_KEY) || "").trim().toUpperCase(); } catch (e) { return ""; } }
  function lic() { try { return JSON.parse(localStorage.getItem(LIC_KEY) || "null"); } catch (e) { return null; } }
  function setLic(v) { try { v ? localStorage.setItem(LIC_KEY, JSON.stringify(v)) : localStorage.removeItem(LIC_KEY); } catch (e) { } }
  function licOk() { var l = lic(); return !!(l && l.ok && Date.now() - (l.at || 0) < GRACE_MS); }
  function unlocked() { return !!CODES[code()] || licOk(); }

  async function lsCall(path, params) {
    var r = await fetch(LS + path, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    var j = await r.json().catch(function () { return {}; }); return j;
  }
  function deviceName() { var ua = navigator.userAgent; var os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Computer"; return os + " · " + new Date().toLocaleDateString("en-CA"); }
  function activeStatus(s) { return s === "active" || s === "inactive"; }

  async function activateKey(key) {
    var j = await lsCall("activate", { license_key: key, instance_name: deviceName() });
    if (j && j.activated && j.instance) {
      var st = j.license_key && j.license_key.status;
      if (!activeStatus(st) && st !== "active") return { ok: false, msg: "This licence is " + st + ". Renew your subscription to keep using the app." };
      setLic({ key: key, instance: j.instance.id, ok: true, at: Date.now(), status: st }); return { ok: true };
    }
    var e = (j && j.error) || "";
    if (/limit/i.test(e)) return { ok: false, msg: "This licence is already used on 2 computers. Remove one in your Lemon Squeezy order page, or contact " + SUPPORT + "." };
    if (/not found/i.test(e)) return { ok: false, msg: "That licence key wasn't found. Copy it exactly from your receipt email." };
    return { ok: false, msg: e || "Couldn't check the licence. Check the internet connection and try again." };
  }
  async function recheck() {
    var l = lic(); if (!l || !l.key) return;
    if (Date.now() - (l.at || 0) < RECHECK_MS) return;
    try {
      var j = await lsCall("validate", { license_key: l.key, instance_id: l.instance || "" });
      if (j && j.valid && activeStatus(j.license_key && j.license_key.status)) { l.ok = true; l.at = Date.now(); l.status = j.license_key.status; setLic(l); }
      else if (j && (j.valid === false || j.license_key)) { l.ok = false; l.status = (j.license_key && j.license_key.status) || "invalid"; setLic(l); renderChip(); toast("Your subscription has ended on this computer. Renew to keep working on your own jobs."); }
    } catch (e) { /* offline: keep working inside the grace period */ }
    renderChip();
  }
  async function deactivate() {
    var l = lic(); if (!l) return;
    try { if (l.key && l.instance) await lsCall("deactivate", { license_key: l.key, instance_id: l.instance }); } catch (e) { }
    setLic(null); renderChip(); toast("Licence removed from this computer.");
  }

  function showGate(reason) {
    openDialog('<div class="dlg-h"><h3>Subscribe to use your own jobs</h3></div><div class="dlg-b">' +
      '<p style="margin:0;line-height:1.55">' + (reason || "Your own jobs need a subscription.") + ' The tutorial and practice drawing stay free.</p>' +
      '<ul style="margin:0;padding-left:18px;line-height:1.7"><li>Count symbols on every sheet, read legends, trace conduit runs</li><li>Markups, revision compare and adds/omits</li><li>Quote and itemized takeoff to Word, PDF and Excel</li><li>CA$9.99 a month, or CA$99 a year (save 17%). Cancel any time. Use it on 2 computers.</li></ul>' +
      '<p class="muted" style="margin:0;font-size:13px">Already subscribed? Paste the licence key from your receipt email.</p>' +
      '<div class="row"><input class="inp" id="dkCode" placeholder="Licence key" style="flex:1" autocomplete="off" spellcheck="false"><button class="btn" id="dkCodeGo">Unlock</button></div>' +
      '<p class="muted" id="dkMsg" style="margin:0;font-size:12.5px"></p></div>' +
      '<div class="dlg-f"><span class="muted" style="font-size:12.5px">Help: ' + SUPPORT + '</span><span class="spacer"></span><button class="btn" data-close>Not now</button>' +
      '<a class="btn primary" style="text-decoration:none" href="' + BUY_URL + '" target="_blank" rel="noopener">Subscribe</a></div>');
    var go = document.getElementById("dkCodeGo");
    go.onclick = async function () {
      var raw = document.getElementById("dkCode").value.trim(), msg = document.getElementById("dkMsg");
      if (!raw) { msg.textContent = "Paste your licence key first."; return; }
      if (CODES[raw.toUpperCase()]) { try { localStorage.setItem(CODE_KEY, raw.toUpperCase()); } catch (e) { } closeDialog(); renderChip(); toast("Code accepted. All features unlocked."); return; }
      go.disabled = true; msg.textContent = "Checking your licence…";
      var r; try { r = await activateKey(raw); } catch (e) { r = { ok: false, msg: "No internet connection. Connect once to unlock, then the app works offline." }; }
      go.disabled = false;
      if (r.ok) { closeDialog(); renderChip(); toast("Licence activated. All features unlocked."); } else msg.textContent = r.msg;
    };
    document.getElementById("dkCode").onkeydown = function (e) { if (e.key === "Enter") go.click(); };
  }
  function manageDialog() {
    var l = lic();
    openDialog('<div class="dlg-h"><h3>Your subscription</h3></div><div class="dlg-b">' +
      '<p style="margin:0;line-height:1.55">' + (CODES[code()] ? "This computer is unlocked with an access code." : "Your licence is active on this computer.") + '</p>' +
      '<p class="muted" style="margin:0;font-size:13px">Change your card, download receipts or cancel on your Lemon Squeezy order page.</p></div>' +
      '<div class="dlg-f">' + (l ? '<button class="btn danger" id="dkDeact">Remove from this computer</button>' : "") + '<span class="spacer"></span><button class="btn" data-close>Close</button>' +
      '<a class="btn primary" style="text-decoration:none" href="' + MANAGE_URL + '" target="_blank" rel="noopener">Manage subscription</a></div>');
    var d = document.getElementById("dkDeact"); if (d) d.onclick = function () { closeDialog(); deactivate(); };
  }
  function gate(fnName, reason) {
    var base = window[fnName]; if (typeof base !== "function") return;
    window[fnName] = function () { if (!unlocked()) return showGate(reason); return base.apply(this, arguments); };
  }
  gate("addFiles", "Adding your own drawings needs a subscription.");
  gate("startBlankJob", "Starting your own jobs needs a subscription.");
  gate("openProjectById", "Opening your jobs needs a subscription.");
  gate("newFromTemplate", "Starting your own jobs needs a subscription.");

  function renderChip() { var el = document.getElementById("planChip"); if (!el) return; el.hidden = false; el.textContent = unlocked() ? "Subscribed" : "Not subscribed"; }

  /* ---- Install button (Chrome / Edge) ---- */
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; var b = document.getElementById("btnInstall"); if (b) b.hidden = false; });
  window.addEventListener("appinstalled", function () { var b = document.getElementById("btnInstall"); if (b) b.hidden = true; toast("Installed. Open it any time from your desktop or Start menu."); });

  function homeExtras() {
    var btns = document.getElementById("btnSettings"); if (!btns || document.getElementById("btnInstall")) return; btns = btns.parentElement;
    var sub = document.createElement("button"); sub.className = "btn"; sub.textContent = "Subscription";
    sub.onclick = function () { unlocked() ? manageDialog() : showGate(); };
    btns.insertBefore(sub, btns.firstChild);
    var inst = document.createElement("button"); inst.className = "btn primary"; inst.id = "btnInstall"; inst.textContent = "Install app"; inst.hidden = !deferred;
    inst.onclick = async function () { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; inst.hidden = true; };
    btns.insertBefore(inst, btns.firstChild);
    renderChip(); recheck();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", homeExtras); else homeExtras();

  /* ---- Offline support ---- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("sw", e); }); });
  }
})();
