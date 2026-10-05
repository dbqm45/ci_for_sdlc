# Typografia i skład dokumentu

Dotyczy dokumentów składanych (DOCX, PDF, druk, e-book). W Markdown działają tylko reguły znaków (sekcja 1) — resztą rządzi
renderer; nie symuluj układu spacjami ani pustymi wierszami.

## 1. Znaki (także Markdown)
| Znak | Użycie | Spacje |
|---|---|---|
| łącznik `-` | wyrazy złożone (biało-czerwony, e-mail) | bez |
| półpauza `–` | zakresy (1990–2000, s. 23–45) | bez |
| myślnik `–` / `—` | wtrącenie, pauza | z obu stron; jedna forma w dokumencie |
| cudzysłów `„…”`, zagnieżdżony `»…«` | cytaty, tytuły | przylega do tekstu |
| wielokropek `…` (U+2026) | przerwanie, pominięcie `[…]` | bez spacji przed |
Brak spacji przed `, . ; : ! ?`; spacja po. Spacja twarda (U+00A0) między liczbą a jednostką i po jednoliterowych spójnikach
na końcu wiersza (i, a, w, z, o, u) w składzie do druku.

## 2. Akapity i odstępy
Odstępy i wcięcia ustawiaj stylem akapitu, nie pustymi wierszami ani spacjami. Tekst główny: odstęp 6–12 pt po akapicie
albo wcięcie pierwszego wiersza 1–1,25 cm (jedno z dwóch). Nagłówek bliżej tekstu, który otwiera, niż poprzedniego.

## 3. Wdowy i bękarty
Samotny ostatni wiersz akapitu na nowej stronie (wdowa) i samotny pierwszy wiersz na dole strony (bękart) — błąd składu.
Włącz kontrolę wdów i bękartów w stylu; ewentualnie skróć/wydłuż sąsiedni akapit.

## 4. Kroje, stopnie, interlinia
Jeden krój tekstu + najwyżej jeden na nagłówki. Tekst 10,5–12 pt, interlinia ok. 1,15–1,5; przypisy i podpisy 9–10 pt;
hierarchia nagłówków widoczna rozmiarem i wagą. Wyrównanie do lewej jest bezpieczne; justowanie tylko z dzieleniem wyrazów
(inaczej „rzeki” odstępów).

## 5. Marginesy (druk)
2–2,5 cm; od strony oprawy więcej (ok. 3–3,5 cm). E-book (EPUB): marginesy ustala czytnik — nie wymuszaj.

## 6. Raport edytorski
Uwagi w formacie z txt-polish-correctness (`.claude/skills/txt-polish-correctness/references/raport-analizy.md`), kategoria `TYPOGRAFIA`, z podaniem zasady i zmiany
w stylu dokumentu (nie „ręcznie w każdym akapicie”).

## Checklista składu
- [ ] znaki: łącznik / półpauza / myślnik, polski cudzysłów, wielokropek, brak spacji przed interpunkcją
- [ ] odstępy i wcięcia ze stylów; bez pustych wierszy do układu
- [ ] brak wdów i bękartów; spójne kroje i hierarchia nagłówków
