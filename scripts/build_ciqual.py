"""Convertit la table Ciqual (XML ANSES) en JSON compact pour l'app.

Usage : python3 scripts/build_ciqual.py <dossier_xml> public/ciqual.json
Fichiers attendus dans le dossier : alim.xml, alim_grp.xml, compo.xml
Source : ANSES, Table Ciqual 2025 (licence CC-BY 4.0)
https://zenodo.org/records/17550133
"""
import json
import sys
import xml.etree.ElementTree as ET

# code constituant Ciqual -> clé courte
CONST = {
    "328": "kcal",   # Energie, Règlement UE 1169/2011 (kcal/100 g)
    "333": "kcalJ",  # Energie, N x facteur Jones (repli si 328 absent)
    "25000": "p",    # Protéines, N x facteur de Jones
    "31000": "g",    # Glucides
    "40000": "l",    # Lipides
    "34100": "fib",  # Fibres
    "32000": "suc",  # Sucres
    "10004": "sel",  # Sel
}


def parse_val(raw):
    """'12,5' -> 12.5 ; '< 0,5' / 'traces' -> 0 ; '-' -> None (non mesuré)."""
    s = (raw or "").strip()
    if s in ("", "-"):
        return None
    if s.startswith("<") or s == "traces":
        return 0.0
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def main(src, dst):
    groups = {}
    for g in ET.parse(f"{src}/alim_grp.xml").getroot():
        code = (g.findtext("alim_ssgrp_code") or "").strip()
        nom = (g.findtext("alim_ssgrp_nom_fr") or "").strip()
        if code and nom and nom != "-":
            groups[code] = nom
        gcode = (g.findtext("alim_grp_code") or "").strip()
        gnom = (g.findtext("alim_grp_nom_fr") or "").strip()
        if gcode and gnom:
            groups.setdefault(gcode, gnom)

    foods = {}
    for a in ET.parse(f"{src}/alim.xml").getroot():
        code = a.findtext("alim_code").strip()
        ss = (a.findtext("alim_ssgrp_code") or "").strip()
        gr = (a.findtext("alim_grp_code") or "").strip()
        foods[code] = {
            "n": a.findtext("alim_nom_fr").strip(),
            "grp": ss if ss in groups else gr,
        }

    for _, el in ET.iterparse(f"{src}/compo.xml"):
        if el.tag != "COMPO":
            continue
        code = el.findtext("alim_code").strip()
        key = CONST.get(el.findtext("const_code").strip())
        if key and code in foods:
            foods[code][key] = parse_val(el.findtext("teneur"))
        el.clear()

    out, skipped = [], 0
    for code, f in foods.items():
        kcal = f.get("kcal")
        if kcal is None:
            kcal = f.get("kcalJ")
        if kcal is None:
            skipped += 1
            continue
        r = lambda v: None if v is None else round(v, 1)
        out.append([int(code), f["n"], f["grp"], round(kcal), r(f.get("p")), r(f.get("g")),
                    r(f.get("l")), r(f.get("fib")), r(f.get("suc")), r(f.get("sel"))])
    out.sort(key=lambda x: x[1])
    used = {f[2] for f in out}
    data = {
        "source": "ANSES Table Ciqual 2025 (CC-BY 4.0)",
        "fields": ["code", "nom", "groupe", "kcal", "p", "g", "l", "fibres", "sucres", "sel"],
        "groups": {k: v for k, v in groups.items() if k in used},
        "foods": out,
    }
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} aliments écrits, {skipped} sans énergie ignorés")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
