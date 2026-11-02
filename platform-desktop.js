/* 20 Vision Electrical Take Off — desktop (installable web app) layer, loaded last.
   Adds: subscription gate with access/licence codes, "Install app" button, offline support. */
(function () {
  "use strict";
  var CODE_KEY = "tv-access-code";
  var CODES = { "20VISION-REVIEW-2026": true };
  var BUY_URL = "https://20visionelectric.com/takeoff";   // subscription page on the company website
  var SUPPORT = "info@20visionelectric.com";

  function code() { try { return (localStorage.getItem(CODE_KEY) || "").trim().toUpperCase(); } catch (e) { return ""; } }
  function unlocked() { return !!CODES[code()]; }

  function showGate(reason) {
    openDialog('<div class="dlg-h"><h3>Subscribe to use your own jobs</h3></div><div class="dlg-b">' +
      '<p style="margin:0;line-height:1.55">' + (reason || "Your own jobs need a subscription.") + ' The tutorial and practice drawing stay free.</p>' +
      '<ul style="margin:0;padding-left:18px;line-height:1.7"><li>Count symbols on every sheet, read legends, trace conduit runs</li><li>Markups, revision compare and adds/omits</li><li>Quote and itemized takeoff to Word, PDF and Excel</li><li>$7.99 a month, cancel any time</li></ul>' +
      '<p class="muted" style="margin:0;font-size:13px">Already subscribed? Enter the code from your receipt email.</p>' +
      '<div class="row"><input class="inp" id="dkCode" placeholder="Licence or access code" style="flex:1" autocapitalize="characters"><button class="btn" id="dkCodeGo">Unlock</button></div>' +
      '<p class="muted" id="dkMsg" style="margin:0;font-size:12.5px"></p></div>' +
      '<div class="dlg-f"><span class="muted" style="font-size:12.5px">Help: ' + SUPPORT + '</span><span class="spacer"></span><button class="btn" data-close>Not now</button>' +
      '<a class="btn primary" style="text-decoration:none" href="' + BUY_URL + '" target="_blank" rel="noopener">Subscribe</a></div>');
    document.getElementById("dkCodeGo").onclick = function () {
      var v = document.getElementById("dkCode").value.trim().toUpperCase();
      if (CODES[v]) { try { localStorage.setItem(CODE_KEY, v); } catch (e) { } closeDialog(); renderChip(); toast("Code accepted. All features unlocked."); }
      else document.getElementById("dkMsg").textContent = "That code isn't valid. Check your receipt email, or contact " + SUPPORT + ".";
    };
  }
  function gate(fnName, reason) {
    var base = window[fnName]; if (typeof base !== "function") return;
    window[fnName] = function () { if (!unlocked()) return showGate(reason); return base.apply(this, arguments); };
  }
  gate("addFiles", "Adding your own drawings needs a subscription.");
  gate("startBlankJob", "Starting your own jobs needs a subscription.");
  gate("openProjectById", "Opening your jobs needs a subscription.");

  function renderChip() { var el = document.getElementById("planChip"); if (!el) return; el.hidden = false; el.textContent = unlocked() ? "Subscribed" : "Not subscribed"; }

  /* ---- Install button (Chrome / Edge) ---- */
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; var b = document.getElementById("btnInstall"); if (b) b.hidden = false; });
  window.addEventListener("appinstalled", function () { var b = document.getElementById("btnInstall"); if (b) b.hidden = true; toast("Installed. Open it any time from your desktop or Start menu."); });

  function homeExtras() {
    var btns = document.getElementById("btnSettings"); if (!btns || document.getElementById("btnInstall")) return; btns = btns.parentElement;
    var sub = document.createElement("button"); sub.className = "btn"; sub.textContent = "Subscription";
    sub.onclick = function () { unlocked() ? toast("Your subscription is active on this computer.") : showGate(); };
    btns.insertBefore(sub, btns.firstChild);
    var inst = document.createElement("button"); inst.className = "btn primary"; inst.id = "btnInstall"; inst.textContent = "Install app"; inst.hidden = !deferred;
    inst.onclick = async function () { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; inst.hidden = true; };
    btns.insertBefore(inst, btns.firstChild);
    renderChip();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", homeExtras); else homeExtras();

  /* ---- Offline support ---- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("sw", e); }); });
  }
})();
