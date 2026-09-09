import { api } from "../core/api";
import { saat, tarihUzun } from "../core/date";
import { takvimRengi, yukle } from "../core/store";
import type { Occurrence } from "../core/types";
import { h } from "../ui/dom";
import { ikon, renkDiski } from "../ui/icons";
import { olayDuzenleyici } from "../ui/editor";

/** Bir günün tüm etkinliklerini gösteren küçük pencere. */
export function gunPaneli(gun: Date, liste: Occurrence[]): void {
  const perde = h("div", { sinif: "perde" });
  const kapat = () => {
    perde.remove();
    document.removeEventListener("keydown", tus);
  };
  const tus = (e: KeyboardEvent) => {
    if (e.key === "Escape") kapat();
  };

  const govde = h("div", { sinif: "kutu-govde", stil: { gap: "5px" } });

  if (!liste.length) {
    govde.append(
      h("div", { sinif: "ipucu", metin: "Bu gün boş." }),
    );
  }

  for (const o of liste) {
    const isaret = h(
      "div",
      {
        sinif: `isaret ${o.event.done ? "acik" : ""}`,
        attr: { title: "Yapıldı olarak işaretle" },
        tikla: async (e: MouseEvent) => {
          e.stopPropagation();
          await api.toggleDone(o.event.id, !o.event.done);
          await yukle();
          kapat();
        },
      },
      ikon("onay", 12),
    );
    govde.append(
      h(
        "div",
        {
          sinif: `program-olay ${o.event.done ? "bitti" : ""}`,
          stil: { "--renk": takvimRengi(o.event) },
          tikla: () => {
            kapat();
            olayDuzenleyici({ event: o.event });
          },
        },
        isaret,
        renkDiski(takvimRengi(o.event), 8),
        renkDiski(takvimRengi(o.event), 8),
        h("span", {
          sinif: "saat",
          metin: o.event.allDay ? "Tüm gün" : `${saat(o.start)} – ${saat(o.end)}`,
        }),
        h(
          "span",
          { sinif: "ad" },
          o.repeated ? ikon("tekrar", 11) : null,
          o.event.title,
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

  const kutu = h(
    "div",
    { sinif: "kutu", onclick: (e: Event) => e.stopPropagation() },
    h(
      "div",
      { sinif: "kutu-ust" },
      h("h3", { metin: tarihUzun(gun) }),
      h("button", { sinif: "dg ikonlu", attr: { title: "Kapat" }, tikla: kapat }, ikon("kapat")),
    ),
    govde,
    h(
      "div",
      { sinif: "kutu-alt" },
      h("div", { sinif: "bosluk" }),
      h("button", {
        sinif: "dg birincil",
        metin: "Etkinlik ekle",
        tikla: () => {
          kapat();
          const b = new Date(gun);
          b.setHours(9, 0, 0, 0);
          olayDuzenleyici({ start: b, end: new Date(b.getTime() + 3600000) });
        },
      }),
    ),
  );

  perde.addEventListener("click", kapat);
  perde.append(kutu);
  document.body.append(perde);
  document.addEventListener("keydown", tus);
}
