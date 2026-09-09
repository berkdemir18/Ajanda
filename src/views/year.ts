import {
  AYLAR,
  GUNLER_KISA,
  ayGridBasi,
  bugunMu,
  gunBasi,
  gunEkle,
} from "../core/date";
import { state, tariheGit } from "../core/store";
import { h } from "../ui/dom";

/** Yıl haritası: her gün, o günkü etkinlik yoğunluğuna göre renklenir. */
export function yilGorunumu(): HTMLElement {
  const yil = state.anchor.getFullYear();

  const yogunluk = new Map<string, number>();
  for (const o of state.occurrences) {
    const k = gunBasi(o.start).toDateString();
    yogunluk.set(k, (yogunluk.get(k) ?? 0) + 1);
  }

  const kok = h("div", { sinif: "yil-gorunum" });

  for (let ay = 0; ay < 12; ay++) {
    const odak = new Date(yil, ay, 1);
    const ilk = ayGridBasi(odak);
    const grid = h(
      "div",
      { sinif: "mini-grid" },
      ...GUNLER_KISA.map((g) => h("div", { sinif: "bas", metin: g[0] })),
    );

    for (let i = 0; i < 42; i++) {
      const g = gunEkle(ilk, i);
      const dis = g.getMonth() !== ay;
      const n = yogunluk.get(g.toDateString()) ?? 0;
      const yogun = Math.min(1, n / 4);
      grid.append(
        h("div", {
          sinif: `mini-gun ${dis ? "dis" : ""} ${bugunMu(g) ? "bugun" : ""}`,
          metin: String(g.getDate()),
          stil:
            n > 0 && !bugunMu(g)
              ? {
                  background: `color-mix(in srgb, var(--vurgu) ${
                    12 + yogun * 46
                  }%, transparent)`,
                  color: "var(--metin)",
                }
              : {},
          attr: { title: n ? `${n} etkinlik` : "" },
          tikla: () => {
            state.view = "gun";
            localStorage.setItem("view", "gun");
            tariheGit(g);
          },
        }),
      );
    }

    kok.append(
      h(
        "div",
        { sinif: "yil-ay" },
        h("h4", {
          metin: AYLAR[ay],
          tikla: () => {
            state.view = "ay";
            localStorage.setItem("view", "ay");
            tariheGit(new Date(yil, ay, 1));
          },
        }),
        grid,
      ),
    );
  }

  return kok;
}
