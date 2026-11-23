/* 20 Vision Electrical Take Off — platform layer loaded BEFORE the app.
   Supplies the services the app asks for through claude.use():
   - "sample": AI, using the customer's own Claude (Anthropic) or OpenAI API key
   - "downloads": saving/sharing exported files on the device
   Everything else (accounts, cloud storage) is not used: jobs live on the device. */
(function () {
  "use strict";
  var AI_KEY = "tv-ai-settings";
  function isNative() { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function plugins() { return (window.Capacitor && window.Capacitor.Plugins) || {}; }
  function getAiCfg() { try { return JSON.parse(localStorage.getItem(AI_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setAiCfg(c) { try { localStorage.setItem(AI_KEY, JSON.stringify(c || {})); } catch (e) { } }

  function blobToB64(b) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(b); });
  }
  function parseJson(t) {
    t = String(t || "").trim();
    try { return JSON.parse(t); } catch (e) { }
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) { try { return JSON.parse(fence[1]); } catch (e) { } }
    var a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { } }
    throw { code: "invalid_json", message: "The AI reply wasn't readable.", text: t };
  }
  function errOf(status, msg) {
    if (status === 401 || status === 403) return { code: "bad_key", message: "Your AI key was rejected. Check it in AI settings." };
    if (status === 429) return { code: "rate_limited", message: "Your AI account hit its rate or spending limit." };
    if (status === 400 && /credit|billing|balance/i.test(msg || "")) return { code: "no_credit", message: "Your AI account is out of credit. Add credit with your AI provider." };
    return { code: "upstream_error", message: msg || ("AI error " + status) };
  }
  function mergeTurns(turns) {
    var out = [];
    turns.forEach(function (t) { var last = out[out.length - 1]; if (last && last.role === t.role) last.content += "\n\n" + t.content; else out.push({ role: t.role, content: String(t.content) }); });
    return out;
  }

  function makeSample(cfg) {
    if (!cfg || !cfg.key) return null;
    var provider = cfg.provider || "anthropic";
    async function call(input, opts) {
      opts = opts || {};
      var turns = mergeTurns(typeof input === "string" ? [{ role: "user", content: input }] : input);
      var imgs = opts.images ? (Array.isArray(opts.images) ? opts.images : [opts.images]) : [];
      var quick = opts.modelTier === "quick";
      var text = "";
      try {
        if (provider === "anthropic") {
          var model = (quick ? cfg.quickModel : cfg.model) || (quick ? "claude-haiku-5-5" : "claude-sonnet-5-5");
          var last = turns[turns.length - 1], content = [];
          for (var i = 0; i < imgs.length; i++) content.push({ type: "image", source: { type: "base64", media_type: imgs[i].type || "image/png", data: await blobToB64(imgs[i]) } });
          content.push({ type: "text", text: last.content + (opts._json ? "\n\nReply with only the JSON value, no other text." : "") });
          var body = { model: model, max_tokens: 4096, messages: turns.slice(0, -1).concat([{ role: "user", content: content }]) };
          if (cfg.web && opts._chat) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
          var r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: opts.signal, headers: { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(body) });
          var j = await r.json().catch(function () { return {}; });
          if (!r.ok) throw errOf(r.status, j && j.error && j.error.message);
          var srcs = [];
          text = (j.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { (c.citations || []).forEach(function (ci) { if (ci.url && srcs.indexOf(ci.url) < 0) srcs.push(ci.url); }); return c.text; }).join("");
          if (srcs.length && !/Sources:/i.test(text)) text += "\n\nSources:\n" + srcs.slice(0, 8).join("\n");
        } else {
          var omodel = (quick ? cfg.quickModel : cfg.model) || (quick ? "gpt-4o-mini" : "gpt-4o");
          var om = turns.map(function (m) { return { role: m.role, content: m.content }; });
          var lastM = om[om.length - 1];
          if (opts._json) lastM.content += "\n\nReply with only the JSON value, no other text.";
          if (imgs.length) { var parts = [{ type: "text", text: lastM.content }]; for (var k = 0; k < imgs.length; k++) parts.push({ type: "image_url", image_url: { url: "data:" + (imgs[k].type || "image/png") + ";base64," + await blobToB64(imgs[k]) } }); lastM.content = parts; }
          var r2 = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", signal: opts.signal, headers: { "content-type": "application/json", "authorization": "Bearer " + cfg.key }, body: JSON.stringify({ model: omodel, messages: om }) });
          var j2 = await r2.json().catch(function () { return {}; });
          if (!r2.ok) throw errOf(r2.status, j2 && j2.error && j2.error.message);
          text = (j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content) || "";
        }
      } catch (e) {
        if (e && e.name === "AbortError") throw { code: "cancelled", message: "Stopped." };
        if (e && e.code) throw e;
        throw { code: "offline", message: "Couldn't reach the AI service. Check the internet connection." };
      }
      if (!String(text).trim()) throw { code: "empty_completion", message: "The AI returned nothing." };
      if (opts.onText) try { opts.onText({ text: text, delta: text }); } catch (e) { }
      return { text: text, truncated: false, modelTierApplied: quick ? "quick" : "default" };
    }
    var sample = function (input, opts) { opts = Object.assign({}, opts || {}); opts._chat = Array.isArray(input); return call(input, opts); };
    sample.json = async function (input, opts) { var r = await call(input, Object.assign({}, opts || {}, { _json: true })); return parseJson(r.text); };
    sample.limits = async function () { return { maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ["image/png", "image/jpeg"] } }; };
    return sample;
  }

  async function saveBlob(filename, data) {
    var blob = data instanceof Blob ? data : new Blob([data]);
    if (isNative()) {
      var P = plugins();
      var b64 = await blobToB64(blob);
      var w = await P.Filesystem.writeFile({ path: filename, data: b64, directory: "CACHE" });
      try { await P.Share.share({ title: filename, dialogTitle: "Save or send " + filename, files: [w.uri] }); }
      catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; throw { code: "declined", message: "cancelled" }; }
      return { status: "saved" };
    }
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return { status: "saved" };
  }


  /* ---------------- 30-day tester codes ----------------
     Each code unlocks the app for 30 days from the day it's first entered on that device.
     Only SHA-256 hashes are kept here, so the codes can't be read from the app. Codes can't be started after the last date. */
  var TRIAL_KEY = "tv-trial", TRIAL_DAYS = 30, TRIAL_LAST_START = Date.parse("2027-06-30T23:59:59");
  var TRIALS = {"321f440e290946d3fa9e96cbd4d8e5068497b24932f6cf74ba1d3f4d3b770df7": "Tester 1", "f91afd5a00f2ee83de7a693a701d8baa68508641118069298a454e0d58ddc608": "Tester 2", "cdd4489de0418b4a99365221e2d81ec150a8bdb6ab380b963709c9c1eb5a2ae0": "Tester 3", "6c8670d583137df338c4c2eb3093507fd6d95ad497022a2a3d199e6bbae97a1d": "Tester 4", "9c1bc88d94bdd4df79b3739983443877786de2bd853af933fc359a3186344acb": "Tester 5"};
  function readTrial() { try { return JSON.parse(localStorage.getItem(TRIAL_KEY) || "null"); } catch (e) { return null; } }
  function trialEnds() { var t = readTrial(); return t && TRIALS[t.h] ? t.start + TRIAL_DAYS * 864e5 : 0; }
  function trialOk() { return Date.now() < trialEnds(); }
  function trialDaysLeft() { return Math.max(0, Math.ceil((trialEnds() - Date.now()) / 864e5)); }
  function trialExpired() { var e = trialEnds(); return !!e && Date.now() >= e; }
  async function hashCode(s) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s).trim().toUpperCase())); return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  // Returns { ok, msg } for a typed code. Starting the same code again keeps its first start date.
  async function tryTrial(code) {
    if (!/^TEST-/i.test(String(code).trim())) return null;
    var h; try { h = await hashCode(code); } catch (e) { return { ok: false, msg: "This browser can't check codes. Try Chrome or Edge." }; }
    if (!TRIALS[h]) return { ok: false, msg: "That test code isn't valid." };
    var t = readTrial();
    if (t && t.h === h) { return trialOk() ? { ok: true, msg: "Test access: " + trialDaysLeft() + " days left." } : { ok: false, msg: "This test code has ended (30 days)." }; }
    if (Date.now() > TRIAL_LAST_START) return { ok: false, msg: "This test code can no longer be started." };
    try { localStorage.setItem(TRIAL_KEY, JSON.stringify({ h: h, start: Date.now() })); } catch (e) { return { ok: false, msg: "Couldn't save the code on this device." }; }
    return { ok: true, msg: "Test access started: 30 days." };
  }

  window.TVPlatform = { isNative: isNative, getAiCfg: getAiCfg, setAiCfg: setAiCfg, makeSample: makeSample, saveBlob: saveBlob, trialOk: trialOk, trialDaysLeft: trialDaysLeft, trialExpired: trialExpired, tryTrial: tryTrial };
  window.claude = {
    use: function (name) {
      if (name === "sample") return Promise.resolve(makeSample(getAiCfg()));
      if (name === "downloads") return Promise.resolve({ save: function (o) { return saveBlob(o.filename, o.data); } });
      return Promise.resolve(null);
    }
  };
})();
