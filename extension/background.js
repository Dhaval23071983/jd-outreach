// Talks to the JD Outreach app on this computer. Content scripts can't call localhost from a
// job site's page, so they send messages here.
const BASE = "http://localhost:3040";

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "api") {
        const res = await fetch(BASE + msg.path, {
          method: msg.method || "GET",
          headers: msg.body ? { "Content-Type": "application/json" } : {},
          body: msg.body ? JSON.stringify(msg.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `JD Outreach returned ${res.status}`);
        reply({ ok: true, data });
      } else if (msg.type === "file") {
        const res = await fetch(`${BASE}/api/cv/${encodeURIComponent(msg.name)}`);
        if (!res.ok) throw new Error(`Couldn't load ${msg.name} from JD Outreach.`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        reply({ ok: true, data: { name: msg.name, b64: btoa(bin) } });
      } else {
        reply({ ok: false, error: "Unknown request." });
      }
    } catch (e) {
      const m = String(e.message || e);
      reply({ ok: false, error: /Failed to fetch|NetworkError/.test(m) ? "JD Outreach isn't running. Start it on localhost:3040 and try again." : m });
    }
  })();
  return true; // keeps the reply channel open for the async work
});
