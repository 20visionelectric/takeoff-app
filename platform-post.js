/* 20 Vision Material Take Off — platform layer loaded AFTER the app.
   Adds: AI key settings, Google Play subscription gate, pinch-to-zoom. */
(function () {
  "use strict";
  var PRODUCT = "takeoff_monthly";          // Subscription product id to create in Play Console
  var ENT_KEY = "tv-entitled";              // cached entitlement for offline use
  var GRACE_MS = 7 * 24 * 3600 * 1000;      // keep working offline for 7 days after last check
  var CODE_KEY = "tv-access-code";          // reviewer / complimentary access code
  var CODES = { "20VISION-REVIEW-2026": true };
  function codeOk() { try { return !!CODES[(localStorage.getItem(CODE_KEY) || "").trim().toUpperCase()]; } catch (e) { return false; } }
  var T = window.TVPlatform;

  /* ---------------- AI settings ---------------- */
  function aiSettingsHtml() {
    var c = T.getAiCfg();
    return '<div class="pane" style="gap:12px"><b class="eyebrow">AI features (optional)</b>' +
      '<p class="muted" style="margin:0;line-height:1.5">Counting, measuring, markups and exports work without AI. To also name symbols, read legends, check possible matches and ask questions, connect your own AI account. Usage is billed by your AI provider, not by this app.</p>' +
      '<label class="field"><span>AI provider</span><select class="inp" id="aiProv"><option value="anthropic">Claude (Anthropic API)</option><option value="openai">ChatGPT (OpenAI API)</option></select></label>' +
      '<label class="field"><span>API key</span><input class="inp" id="aiKey" type="password" autocomplete="off" placeholder="Paste your API key"></label>' +
      '<p class="muted" style="margin:0;font-size:12.5px;line-height:1.5">Get a key at console.anthropic.com or platform.openai.com. A Claude or ChatGPT chat subscription is not an API key. Your key stays on this device.</p>' +
      '<label class="row" style="gap:6px"><input type="checkbox" id="aiWeb"> Let the AI search the web (Claude only, extra cost on your account)</label>' +
      '<label class="field"><span>Model (leave blank for the default)</span><input class="inp" id="aiModel" placeholder="default"></label>' +
      '<div class="row"><button class="btn primary" id="aiSave">Save and turn on AI</button>' + (c.key ? '<button class="btn danger" id="aiOff">Remove key</button>' : "") + '</div><div id="aiMsg" class="muted" style="font-size:12.5px"></div></div>';
  }
  function wireAiSettings() {
    var c = T.getAiCfg();
    var p = document.getElementById("aiProv"); if (!p) return;
    p.value = c.provider || "anthropic"; document.getElementById("aiWeb").checked = !!c.web; document.getElementById("aiModel").value = c.model || "";
    document.getElementById("aiSave").onclick = async function () {
      var key = document.getElementById("aiKey").value.trim() || c.key;
      if (!key) { document.getElementById("aiMsg").textContent = "Paste an API key first."; return; }
      var cfg = { provider: p.value, key: key, web: document.getElementById("aiWeb").checked, model: document.getElementById("aiModel").value.trim() };
      var test = T.makeSample(cfg); document.getElementById("aiMsg").textContent = "Checking the key…";
      try { await test("Reply with the single word OK.", { modelTier: "quick" }); }
      catch (e) { document.getElementById("aiMsg").textContent = (e && e.message) || "That key didn't work."; return; }
      T.setAiCfg(cfg); S.ai = test; S.aiImages = true; renderAIPane(); toast("AI is on.");
    };
    var off = document.getElementById("aiOff");
    if (off) off.onclick = function () { T.setAiCfg({}); S.ai = null; renderAIPane(); toast("AI key removed from this device."); };
  }
  var baseRenderAI = window.renderAIPane;
  window.renderAIPane = function () {
    var el = document.getElementById("pane-ai"); if (!el) return;
    if (!S.ai) { el.innerHTML = aiSettingsHtml(); wireAiSettings(); return; }
    baseRenderAI();
    var ask = el.querySelector(".ask");
    if (ask && !document.getElementById("aiCfgBtn")) { var b = document.createElement("button"); b.className = "btn ghost sm"; b.id = "aiCfgBtn"; b.textContent = "AI settings"; b.onclick = function () { el.innerHTML = aiSettingsHtml(); wireAiSettings(); }; ask.appendChild(b); }
  };
  window.aiErr = function (e) {
    var m = { cancelled: "Stopped.", bad_key: "Your AI key was rejected. Open AI settings in the Ask AI tab.", no_credit: "Your AI account is out of credit. Add credit with your AI provider.", rate_limited: "Your AI account hit its limit. Try again in a minute.", offline: "No internet connection. AI needs internet; everything else works offline.", invalid_json: "The AI reply wasn't readable. Try again." };
    return m[e && e.code] || (e && e.message) || "AI couldn't answer right now. Try again.";
  };
  // the app hides the AI-name button when no AI; nothing else to patch.

  /* ---------------- Subscription (Google Play Billing) ---------------- */
  var entitled = false, storeReady = false;
  function cachedEntitled() { try { var v = JSON.parse(localStorage.getItem(ENT_KEY) || "null"); return !!(v && v.ok && Date.now() - v.at < GRACE_MS); } catch (e) { return false; } }
  function setEntitled(ok) { entitled = ok; try { localStorage.setItem(ENT_KEY, JSON.stringify({ ok: ok, at: Date.now() })); } catch (e) { } renderPlan(); }
  function needsPlan() { return T.isNative() && !entitled && !cachedEntitled() && !codeOk(); }
  function store() { return window.CdvPurchase && window.CdvPurchase.store; }
  function refreshOwned() { var s = store(); if (!s) return; var p = s.get(PRODUCT, window.CdvPurchase.Platform.GOOGLE_PLAY); setEntitled(!!(p && p.owned)); }
  function initBilling() {
    if (!T.isNative()) { entitled = true; return; }
    entitled = cachedEntitled();
    var C = window.CdvPurchase; if (!C) return;
    var s = C.store;
    s.register([{ id: PRODUCT, type: C.ProductType.PAID_SUBSCRIPTION, platform: C.Platform.GOOGLE_PLAY }]);
    s.when().approved(function (t) { t.verify(); }).verified(function (r) { r.finish(); }).finished(refreshOwned).productUpdated(refreshOwned).receiptUpdated(refreshOwned);
    s.error(function (err) { console.warn("billing", err && err.message); });
    s.initialize([C.Platform.GOOGLE_PLAY]).then(function () { storeReady = true; refreshOwned(); renderPlan(); });
  }
  function priceText() {
    var s = store(); var p = s && s.get(PRODUCT, window.CdvPurchase.Platform.GOOGLE_PLAY);
    var o = p && p.getOffer && p.getOffer(); var ph = o && o.pricingPhases;
    if (!ph || !ph.length) return "";
    var paid = ph.filter(function (x) { return x.priceMicros > 0; })[0]; var trial = ph.filter(function (x) { return x.priceMicros === 0; })[0];
    return (trial ? "Free trial, then " : "") + (paid ? paid.price + " / month" : "");
  }
  function showPaywall(reason) {
    openDialog('<div class="dlg-h"><h3>Start your free trial</h3></div><div class="dlg-b">' +
      '<p style="margin:0;line-height:1.55">' + (reason || "Your own jobs need a subscription.") + ' The tutorial and practice drawing stay free.</p>' +
      '<ul style="margin:0;padding-left:18px;line-height:1.7"><li>Count symbols on every sheet, read legends, trace conduit runs</li><li>Markups, revision compare and adds/omits</li><li>Quote and itemized takeoff to Word, PDF and Excel</li><li>Cancel any time in Google Play</li></ul>' +
      '<p class="muted num" id="pwPrice" style="margin:0">' + (priceText() || (storeReady ? "" : "Connecting to Google Play…")) + '</p><p class="muted" id="pwMsg" style="margin:0;font-size:12.5px"></p></div>' +
      '<details style="margin-top:4px"><summary class="muted" style="cursor:pointer">Have an access code?</summary><div class="row" style="margin-top:8px"><input class="inp" id="pwCode" placeholder="Access code" style="flex:1" autocapitalize="characters"><button class="btn" id="pwCodeGo">Apply</button></div></details>' +
      '<div class="dlg-f"><button class="btn" id="pwRestore">Restore purchase</button><span class="spacer"></span><button class="btn" data-close>Not now</button><button class="btn primary" id="pwBuy">Start free trial</button></div>');
    document.getElementById("pwBuy").onclick = async function () {
      var s = store(); var msg = document.getElementById("pwMsg");
      if (!s) { msg.textContent = "Google Play billing isn't available on this device."; return; }
      var p = s.get(PRODUCT, window.CdvPurchase.Platform.GOOGLE_PLAY); var o = p && p.getOffer();
      if (!o) { msg.textContent = "The subscription isn't available yet. Check your connection and try again."; return; }
      var err = await o.order(); if (err && err.message) msg.textContent = err.message;
      setTimeout(function () { refreshOwned(); if (entitled) { closeDialog(); toast("Subscription active. Thank you!"); } }, 1500);
    };
    document.getElementById("pwCodeGo").onclick = function () { var v = document.getElementById("pwCode").value.trim().toUpperCase(); if (CODES[v]) { try { localStorage.setItem(CODE_KEY, v); } catch (e) { } closeDialog(); renderPlan(); toast("Access code accepted. All features unlocked."); } else document.getElementById("pwMsg").textContent = "That code isn't valid."; };
    document.getElementById("pwRestore").onclick = async function () { var s = store(); if (!s) return; await s.restorePurchases(); refreshOwned(); document.getElementById("pwMsg").textContent = entitled ? "Subscription restored." : "No active subscription found for this Google account."; if (entitled) closeDialog(); };
  }
  function renderPlan() { var el = document.getElementById("planChip"); if (!el) return; el.textContent = !T.isNative() ? "" : (entitled || cachedEntitled() ? "Subscribed" : codeOk() ? "Access code active" : "Free trial available"); el.hidden = !T.isNative(); }
  // gate: own jobs need a subscription; the sample job is always free
  var baseAddFiles = window.addFiles;
  window.addFiles = function (files) { if (needsPlan()) return showPaywall("Adding your own drawings needs a subscription."); return baseAddFiles(files); };
  var baseBlank = window.startBlankJob;
  window.startBlankJob = function () { if (needsPlan()) return showPaywall("Starting your own jobs needs a subscription."); return baseBlank(); };
  var baseOpenById = window.openProjectById;
  window.openProjectById = function (id) { if (needsPlan()) return showPaywall("Opening your jobs needs a subscription."); return baseOpenById(id); };

  /* ---------------- Home additions ---------------- */
  function homeExtras() {
    var row = document.querySelector("#home .brand"); if (!row || document.getElementById("planChip")) return;
    var chip = document.createElement("span"); chip.className = "chip blue"; chip.id = "planChip"; chip.style.marginLeft = "8px"; row.appendChild(chip);
    var btns = document.getElementById("btnSettings").parentElement;
    var ai = document.createElement("button"); ai.className = "btn"; ai.textContent = "AI settings";
    ai.onclick = function () { openDialog('<div class="dlg-h"><h3>AI settings</h3></div><div class="dlg-b" id="aiDlg" style="padding:0"></div><div class="dlg-f"><button class="btn" data-close>Close</button></div>'); document.getElementById("aiDlg").innerHTML = aiSettingsHtml(); wireAiSettings(); };
    btns.insertBefore(ai, btns.firstChild);
    if (T.isNative()) { var sub = document.createElement("button"); sub.className = "btn"; sub.textContent = "Subscription"; sub.onclick = function () { entitled ? toast("Your subscription is active. Manage it in Google Play.") : showPaywall(); }; btns.insertBefore(sub, btns.firstChild); }
    renderPlan();
  }

  /* ---------------- Pinch to zoom (touch screens) ---------------- */
  function pinch() {
    var c = document.getElementById("cv"); var pts = new Map(); var last = null;
    c.addEventListener("pointerdown", function (e) { if (e.pointerType !== "touch") return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { e.stopImmediatePropagation(); ptr = null; S.draft = null; last = null; } }, true);
    c.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "touch" || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size !== 2) return; e.stopImmediatePropagation();
      var a = Array.from(pts.values()), r = c.getBoundingClientRect();
      var mx = (a[0][0] + a[1][0]) / 2 - r.left, my = (a[0][1] + a[1][1]) / 2 - r.top, d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (last) { var f = d / last.d; var pt = toPt(last.mx, last.my); S.zoom = clamp(S.zoom * f, 0.02, 12); S.panX = mx - pt[0] * S.zoom; S.panY = my - pt[1] * S.zoom; updZoom(); draw(); }
      last = { d: d, mx: mx, my: my };
    }, true);
    function up(e) { if (!pts.has(e.pointerId)) return; var was = pts.size; pts.delete(e.pointerId); if (was === 2) { e.stopImmediatePropagation(); ptr = null; last = null; } }
    c.addEventListener("pointerup", up, true); c.addEventListener("pointercancel", up, true);
  }

  function boot() { homeExtras(); pinch(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  document.addEventListener("deviceready", initBilling, false);
  if (!T.isNative()) entitled = true;
  // Android back button: close dialogs, then go to the jobs list
  document.addEventListener("backbutton", function () { var d = document.getElementById("dlg"); if (d && d.open) return closeDialog(); if (!document.getElementById("app").hidden) return showHome(); }, false);
})();
