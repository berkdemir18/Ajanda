import { api } from "../core/api";
import { rfc3339, saat, tarihUzun, ymd } from "../core/date";
import { hizliCoz } from "../core/quickadd";
import { evStart, rruleMetni } from "../core/recur";
import { state, takvimRengi, tariheGit, yukle } from "../core/store";
import type { CalEvent } from "../core/types";
import { h } from "./dom";
import { ikon, renkDiski } from "./icons";
import { olayDuzenleyici } from "./editor";
import { tost } from "./toast";

/**
 * Tek kutu, iki iş: yazdığını etkinliğe çevirir (Enter) ve aynı anda
 * mevcut etkinliklerde arar (ok tuşlarıyla gezilir).
 */
export function palet(): void {
  const perde = h("div", { sinif: "palet" });
  const girdi = h("input", {
    attr: {
      placeholder: "yarın 15:00 diş hekimi 1 saat  ·  ya da ara…",
      spellcheck: "false",
    },
  }) as HTMLInputElement;

  const onizleme = h("div", { sinif: "palet-onizleme" });
  const sonuclar = h("div", { sinif: "palet-sonuc" });
  let bulunan: CalEvent[] = [];
  let secim = -1; // -1 = "yeni ekle" satırı

  const kapat = () => {
    perde.remove();
    document.removeEventListener("keydown", tus, true);
  };

  const cizOnizleme = () => {
    const ham = girdi.value.trim();
    if (!ham) {
      onizleme.replaceChildren(
        h("div", {
          sinif: "ipucu",
          metin:
            "Örnek: “çarşamba 14:00 vize sınavı 2 saat”, “her salı 18:00 antrenman”, “12 eylül doğum günü”",
        }),
      );
      return;
    }
    const r = hizliCoz(ham);
    const zaman = r.allDay ? "Tüm gün" : `${saat(r.start)} – ${saat(r.end)}`;
    onizleme.replaceChildren(
      h(
        "div",
        { sinif: "ozet" },
        h("b", { metin: r.title }),
        h("span", { sinif: "parca", metin: tarihUzun(r.start) }),
        h("span", { sinif: "parca", metin: zaman }),
        r.rrule
          ? h("span", { sinif: "parca", metin: rruleMetni(r.rrule) })
          : null,
      ),
      h(
        "div",
        { sinif: "ipucu" },
        h("kbd", { metin: "Enter" }),
        " ile ekle",
        bulunan.length ? h("span", { metin: "  ·  " }) : null,
        bulunan.length ? h("kbd", { metin: "↓" }) : null,
        bulunan.length ? " ile aramada gez" : null,
      ),
    );
  };

  const cizSonuclar = () => {
    const q = girdi.value.trim().toLocaleLowerCase("tr");
    if (q.length < 2) {
      bulunan = [];
      sonuclar.replaceChildren();
      return;
    }
    bulunan = state.rawEvents
      .filter(
        (e) =>
          e.title.toLocaleLowerCase("tr").includes(q) ||
          (e.location ?? "").toLocaleLowerCase("tr").includes(q) ||
          (e.description ?? "").toLocaleLowerCase("tr").includes(q),
      )
      .sort((a, b) => {
        const simdi = Date.now();
        const fa = Math.abs(evStart(a).getTime() - simdi);
        const fb = Math.abs(evStart(b).getTime() - simdi);
        return fa - fb;
      })
      .slice(0, 12);

    sonuclar.replaceChildren(
      ...bulunan.map((e, i) => {
        const d = evStart(e);
        return h(
          "div",
          {
            sinif: `palet-satir ${i === secim ? "secili" : ""}`,
            stil: { "--renk": takvimRengi(e) },
            tikla: () => ac(e),
          },
          renkDiski(takvimRengi(e), 8),
          h("span", {
            sinif: "zaman",
            metin: e.allDay ? ymd(d) : `${ymd(d)} · ${saat(d)}`,
          }),
          h(
            "span",
            { sinif: "ad" },
            e.rrule ? ikon("tekrar", 11) : null,
            e.title,
          ),
        );
      }),
    );
  };

  const ac = (e: CalEvent) => {
    kapat();
    tariheGit(evStart(e));
    olayDuzenleyici({ event: e });
  };

  const ekle = async () => {
    const ham = girdi.value.trim();
    if (!ham) return;
    const r = hizliCoz(ham);
    const yazilabilir = state.calendars.filter(
      (c) => c.isLocal || c.accessRole === "owner" || c.accessRole === "writer",
    );
    const son = localStorage.getItem("sonTakvim");
    const takvim =
      (son && yazilabilir.some((c) => c.id === son) ? son : null) ??
      (yazilabilir.find((c) => c.isPrimary) ?? yazilabilir[0])?.id ??
      "local";
    try {
      await api.saveEvent({
        calendarId: takvim,
        title: r.title,
        startAt: r.allDay ? ymd(r.start) : rfc3339(r.start),
        endAt: r.allDay ? ymd(r.end) : rfc3339(r.end),
        allDay: r.allDay,
        rrule: r.rrule,
        reminderMin: r.allDay ? null : 15,
      });
      kapat();
      tariheGit(r.start);
      await yukle();
      tost(`“${r.title}” eklendi — ${tarihUzun(r.start)}`, "iyi");
    } catch (err) {
      tost(`Eklenemedi: ${err}`, "hata");
    }
  };

  const tus = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      kapat();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      secim = Math.min(bulunan.length - 1, secim + 1);
      cizSonuclar();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      secim = Math.max(-1, secim - 1);
      cizSonuclar();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (secim >= 0 && bulunan[secim]) ac(bulunan[secim]);
      else void ekle();
    }
  };

  girdi.addEventListener("input", () => {
    secim = -1;
    cizOnizleme();
    cizSonuclar();
  });

  perde.addEventListener("click", (e) => {
    if (e.target === perde) kapat();
  });
  perde.append(
    h(
      "div",
      { sinif: "palet-kutu" },
      h("div", { sinif: "palet-girdi" }, ikon("ara", 17), girdi),
      onizleme,
      sonuclar,
    ),
  );
  document.body.append(perde);
  document.addEventListener("keydown", tus, true);
  cizOnizleme();
  girdi.focus();
}
