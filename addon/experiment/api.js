"use strict";

/* Experiment-API (privilegiert): injiziert Sieve-Zeilen in offene
 * Filter-Listen-Fenster (chrome://messenger/content/FilterEditor/FilterListDialog.xhtml)
 * und öffnet den read-only Viewer als Extension-Page.
 *
 * PoC-Umfang Phase 1: rein read-only, keine Änderung an nativen Filtern. */

const { Services } = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
);

const WINDOW_TYPE = "mailnews:filterlist";
const MODES = ["all", "local", "sieve"];

/* eslint-disable-next-line no-unused-vars */
var sieveView = class extends ExtensionAPI {
  getAPI(context) {
    return {
      sieveView: {
        async injectRows(rows, mode) {
          if (!Array.isArray(rows)) throw new Error("injectRows: rows must be an array");
          if (!MODES.includes(mode)) throw new Error(`injectRows: mode must be one of ${MODES}`);
          for (const win of Services.wm.getEnumerator(WINDOW_TYPE)) {
            try {
              this._injectIntoWindow(win, rows, mode);
            } catch (e) {
              Cu.reportError(`sieveView.injectRows: ${e}`);
            }
          }
        },

        async openViewer(ruleId) {
          const url = context.extension.baseURI.resolve(
            `ui/viewer.html?rule=${encodeURIComponent(ruleId)}`
          );
          const win = Services.wm.getMostRecentWindow(WINDOW_TYPE) ||
            Services.wm.getMostRecentWindow(null);
          if (win && win.openDialog) {
            win.openDialog(url, "sieve-viewer", "chrome,titlebar,centerscreen,resizable,width=680,height=560");
          } else {
            Services.ww.openWindow(null, url, "sieve-viewer", "chrome,titlebar,centerscreen,resizable,width=680,height=560", null);
          }
        },
      },
    };
  }

  _injectIntoWindow(win, rows, mode) {
    if (!win || win.closed) return;
    const doc = win.document;

    // Container nach der nativen Filterliste einfügen.
    let host = doc.getElementById("sieve-view-host");
    if (!host) {
      const nativeList = doc.getElementById("filterList");
      if (!nativeList) return; // Fenster noch nicht aufgebaut — nächster AufrufAgain.
      host = doc.createElement("vbox");
      host.id = "sieve-view-host";
      nativeList.parentNode.insertBefore(host, nativeList.nextSibling);
      this._buildControls(doc, host);
      this._buildRowList(doc, host);
    }

    host.dataset.sieveMode = mode;
    this._applyMode(doc, mode);
    this._renderRows(doc, host, rows);
  }

  _buildControls(doc, host) {
    const bar = doc.createElement("hbox");
    bar.id = "sieve-view-controls";
    bar.setAttribute("align", "center");

    const title = doc.createElement("label");
    title.id = "sieve-view-title";
    title.setAttribute("value", "Sieve-Regeln (Server)");
    bar.appendChild(title);

    for (const m of ["all", "local", "sieve"]) {
      const btn = doc.createElement("button");
      btn.id = `sieve-view-mode-${m}`;
      btn.dataset.mode = m;
      btn.setAttribute(
        "label",
        { all: "Alle", local: "Nur lokal", sieve: "Nur Sieve" }[m]
      );
      btn.addEventListener("command", () => {
        host.dataset.sieveMode = m;
        this._applyMode(doc, m);
        for (const b of bar.querySelectorAll("button[data-mode]")) {
          b.setAttribute("aria-pressed", String(b.dataset.mode === m));
        }
      });
      bar.appendChild(btn);
    }
    host.appendChild(bar);
  }

  _buildRowList(doc, host) {
    const list = doc.createElement("vbox");
    list.id = "sieve-view-list";
    host.appendChild(list);
  }

  _applyMode(doc, mode) {
    // "Nur lokal": native Liste zeigen, Sieve-Sektion ausblenden.
    // "Nur Sieve": native Liste ausblenden.
    // "Alle": beides.
    const nativeList = doc.getElementById("filterList");
    const host = doc.getElementById("sieve-view-host");
    if (nativeList) nativeList.hidden = mode === "sieve";
    if (host) {
      const list = host.querySelector("#sieve-view-list");
      if (list) list.hidden = mode === "local";
      const bar = host.querySelector("#sieve-view-controls");
      if (bar) bar.hidden = mode === "local";
    }
  }

  _renderRows(doc, host, rows) {
    const list = host.querySelector("#sieve-view-list");
    if (!list) return;
    while (list.firstChild) list.lastChild.remove();

    for (const row of rows) {
      const hbox = doc.createElement("hbox");
      hbox.classList.add("sieve-view-row");
      hbox.dataset.ruleId = row.id;
      hbox.setAttribute("align", "center");
      hbox.style.cursor = "pointer";

      const icon = doc.createElement("image");
      icon.classList.add("sieve-view-icon");
      icon.setAttribute(
        "src",
        // Sieve-Icon (Trichter), Serverregel — data-URI, damit kein chrome:// nötig ist.
        "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
          '<path fill="#0060df" d="M1 2h14L10 8v5l-4 2V8L1 2z"/></svg>'
        )
      );
      icon.style.width = "16px";
      icon.style.height = "16px";
      icon.classList.add(row.active ? "sieve-active" : "sieve-inactive");
      hbox.appendChild(icon);

      const label = doc.createElement("label");
      label.classList.add("sieve-view-name");
      label.setAttribute("value", row.name);
      hbox.appendChild(label);

      const summary = doc.createElement("label");
      summary.classList.add("sieve-view-summary");
      summary.setAttribute("value", row.summary || "");
      summary.style.opacity = "0.7";
      summary.style.marginInlineStart = "auto";
      hbox.appendChild(summary);

      hbox.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Details holt sich der Viewer via runtime-Messaging vom Background.
        this._openViewerFor(doc, row.id);
      });

      list.appendChild(hbox);
    }
  }

  _openViewerFor(doc, ruleId) {
    // Ruf die öffentliche API aus dem Experiment-Kontext heraus auf.
    Services.obs.notifyObservers(
      { wrappedJSObject: { ruleId } },
      "sieve-view-open-request"
    );
  }
};
