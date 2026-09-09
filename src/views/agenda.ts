import { api } from "../core/api";
import {
  AYLAR_KISA,
  GUNLER_KISA,
  bugunMu,
  goreliGun,
  gunBasi,
  gunEkle,
  gunSonu,
  haftaGunu,
  saat,
} from "../core/date";
import { state, takvimRengi, yukle } from "../core/store";
import type { Occurrence } from "../core/types";
import { h } from "../ui/dom";
import { ikon, renkDiski } from "../ui/icons";
import { olayDuzenleyici } from "../ui/editor";

const GUN_SAYISI = 60;

/** Tekrarlı olayların başındaki küçük döngü işareti. */
function tekrarIsareti(): SVGSVGElement {
  const i = ikon("tekrar", 11);
  i.classList.add("tekrar-isareti");
  return i;
}

/** Sırayla akan liste: boş günler atlanır, sadece dolu günler yazılır. */
export function programGorunumu(): HTMLElement {
  const kok = h("div", { sinif: "program" });
  const bas = gunBasi(state.anchor);
  let dolu = 0;

  for (let i = 0; i < GUN_SAYISI; i++) {
    const gun = gunEkle(bas, i);
    const liste = state.occurrences
      .filter(
        (o) =>
          o.end.getTime() >= gunBasi(gun).getTime() &&
          o.start.getTime() <= gunSonu(gun).getTime(),
      )
      .sort((a, b) => {
        if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
        return a.start.getTime() - b.start.getTime();
      });
    if (!liste.length) continue;
    dolu++;
    kok.append(gunSatiri(gun, liste));
  }

  if (!dolu) {
    kok.append(
      h(
        "div",
        { sinif: "bos-durum" },
        ikon("takvim", 34),
        h("div", { sinif: "ana-metin", metin: "Önümüzdeki 60 gün boş" }),
        h("div", {
          sinif: "yardim",
          metin:
            "Ctrl+K ile yazarak ekleyebilirsin — “yarın 15:00 diş hekimi 1 saat” gibi.",
        }),
      ),
    );
  }
  return kok;
}

function gunSatiri(gun: Date, liste: Occurrence[]): HTMLElement {
  const olaylar = h("div", { sinif: "program-liste" });

  for (const o of liste) {
    const isaret = h(
      "div",
      {
        sinif: `isaret ${o.event.done ? "acik" : ""}`,
        attr: { title: o.event.done ? "Yapıldı olarak işaretli" : "Yapıldı olarak işaretle" },
        tikla: async (e: MouseEvent) => {
          e.stopPropagation();
          await api.toggleDone(o.event.id, !o.event.done);
          await yukle();
        },
      },
      ikon("onay", 12),
    );

    olaylar.append(
      h(
        "div",
        {
          sinif: `program-olay ${o.event.done ? "bitti" : ""}`,
          stil: {
            "--renk": takvimRengi(o.event),
            opacity: o.end.getTime() < Date.now() ? "0.62" : "",
          },
          tikla: () => olayDuzenleyici({ event: o.event }),
        },
        isaret,
        renkDiski(takvimRengi(o.event), 8),
        h("span", {
          sinif: "saat",
          metin: o.event.allDay
            ? "Tüm gün"
            : `${saat(o.start)} – ${saat(o.end)}`,
        }),
        h(
          "span",
          { sinif: "ad" },
          o.repeated ? tekrarIsareti() : null,
          o.event.title || "(başlıksız)",
        ),
        h(
          "span",
          { sinif: "yer" },
          o.event.location ? ikon("yer", 13) : null,
          o.event.location ?? "",
        ),
      ),
    );
  }

  const goreli = goreliGun(gun);
  return h(
    "div",
    { sinif: `program-gun ${bugunMu(gun) ? "bugun" : ""}` },
    h(
      "div",
      { sinif: "program-tarih" },
      h("div", { sinif: "gun", metin: String(gun.getDate()) }),
      h("div", {
        sinif: "ay",
        metin: `${AYLAR_KISA[gun.getMonth()]} · ${GUNLER_KISA[haftaGunu(gun)]}`,
      }),
      goreli.endsWith("sonra") || ["Bugün", "Yarın", "Öbür gün"].includes(goreli)
        ? h("div", { sinif: "goreli", metin: goreli })
        : null,
    ),
    olaylar,
  );
}
