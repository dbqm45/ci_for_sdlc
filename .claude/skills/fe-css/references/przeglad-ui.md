# Przegląd UI przed oddaniem

Kolejność ważności przy konfliktach i przy przeglądzie (wyżej = ważniejsze):
1. dostępność · 2. dotyk i interakcja · 3. wydajność · 4. styl · 5. układ · 6. typografia i kolor · 7. animacja ·
8. formularze · 9. nawigacja · 10. wykresy.

## Liczby, które sprawdzasz
| Obszar | Próg |
|---|---|
| kontrast tekstu | ≥ 4,5:1 w motywie jasnym **i** ciemnym (3:1 tylko duży tekst i elementy nietekstowe) |
| cel dotyku | minimum WCAG 2.2 AA: 24×24 px lub odpowiedni odstęp; zalecane ≥ 44×44 px (WCAG AAA, Apple; Android 48 dp) i ≥ 8 px między celami |
| stabilność układu | CLS ≤ 0,1 — zarezerwuj miejsce na obrazy i treści ładowane później |
| tekst | baza 16 px, interlinia ok. 1,5, nic poniżej 12 px; linia 60–75 znaków |
| odstępy | rytm 4/8 px z tokenów; gęsto (dashboard) ok. 8–32 px, przestronnie ok. 24–96 px |

## Zasady
- **Kolory tylko z tokenów semantycznych** (fe-css), nigdy surowe wartości w komponentach. Tryb ciemny sprawdzasz
  osobno — nie wynika automatycznie z jasnego.
- **Ikony:** jedna rodzina; nie emoji jako ikony; dekoracyjne z `aria-hidden="true"`; przycisk z samą ikoną ma
  dostępną nazwę i ogłasza stan (`aria-pressed`, `aria-expanded`).
- **Formularze:** widoczna etykieta (placeholder nie jest etykietą), błąd przy polu; przy kilku błędach podsumowanie
  z linkami i fokus na nim; pola logowania pozwalają na wklejanie i menedżera haseł.
- **Ruch:** `prefers-reduced-motion`; nie animuj `width`/`height` (tylko `transform`, `opacity`); wyjście szybsze niż
  wejście; treść przewijająca się sama ma pauzę.
- **Fokus:** przypięte elementy (nagłówek, stopka) nie zasłaniają fokusu klawiatury; gest przeciągania ma alternatywę
  w postaci przycisku.
- Obrazy WebP/AVIF z wymiarami, leniwe ładowanie poniżej pierwszego ekranu.

## System projektowy w repozytorium
Jeden dokument główny (np. `design-system/MASTER.md`: kolory, typografia, odstępy, komponenty, zakazane wzorce) i
nadpisania per strona/obszar tylko tam, gdzie się różnią. Agent czyta najpierw nadpisanie strony, potem dokument
główny. Zmiany w dokumencie głównym tylko za zgodą człowieka. W Angularze tokeny jako custom properties w stylach
globalnych lub motywie Angular Material.

## Lista przed oddaniem
- [ ] kontrast w obu motywach, cele dotyku, fokus widoczny i niezasłonięty
- [ ] żadnych surowych kolorów; ikony z jednej rodziny, dostępne nazwy
- [ ] formularze z etykietami i błędami przy polach
- [ ] reduced motion, brak animacji wymiarów, CLS ≤ 0,1
- [ ] sprawdzone na 375 px, 768 px i szerokim ekranie; brak poziomego przewijania

## Źródło inspiracji
[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — kolejność ważności, progi dostępności
i lista przed oddaniem, wzorzec dokumentu głównego z nadpisaniami (opisane własnymi słowami; bez jego bazy stylów
i wyszukiwarki).
