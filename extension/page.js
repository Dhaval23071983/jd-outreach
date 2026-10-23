// Runs inside the job site's own page (Chrome's "MAIN" world), because React dropdowns
// (react-select, used by Greenhouse) ignore scripted clicks. content.js asks this script,
// through DOM events, to list a dropdown's options or pick one.
(() => {
  if (window.__jdoPage) return;
  window.__jdoPage = true;

  function selectInstance(el) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let f = key && el[key];
    for (let i = 0; f && i < 40; i++, f = f.return) {
      if (f.stateNode && typeof f.stateNode.selectOption === "function") return f.stateNode;
    }
    return null;
  }

  document.addEventListener("jdo:combo", (e) => {
    let req;
    try { req = JSON.parse(e.detail); } catch { return; }
    const el = document.querySelector(`[data-jdo-id="${req.id}"]`);
    const inst = el && selectInstance(el);
    const res = { reqId: req.reqId, ok: false, options: [] };
    if (inst) {
      const flat = (inst.props.options || []).flatMap((o) => (o && o.options ? o.options : [o]));
      const labels = flat.map((o) => String(inst.props.getOptionLabel ? inst.props.getOptionLabel(o) : o.label));
      res.options = labels;
      if (req.action === "select") {
        const i = labels.indexOf(req.label);
        if (i >= 0) { inst.selectOption(flat[i]); res.ok = true; }
      } else {
        res.ok = true;
      }
    }
    document.dispatchEvent(new CustomEvent("jdo:combo:reply", { detail: JSON.stringify(res) }));
  });
})();
