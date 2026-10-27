---
artifact: design
change: CHG-12
phase: design
status: proposed
version: 1
---

# Projekt: zmiana taryfy na wielu ładowarkach naraz

Plik Figmy: https://www.figma.com/design/AbC123xyz/Taryfy — ramki zrobił projektant, agent je dopasował (tryb A).

## Ramki per wymaganie i stan

| Wymaganie | Ścieżka | Stan | Ramka | Uwagi |
|---|---|---|---|---|
| US-3 | wybór ładowarek | idle | https://www.figma.com/design/AbC123xyz/Taryfy?node-id=12-34 | |
| US-3 | wybór ładowarek | empty | https://www.figma.com/design/AbC123xyz/Taryfy?node-id=12-40 | brak ładowarek w lokacji |
| US-3/AC-2 | zastosowanie taryfy | processing | https://www.figma.com/design/AbC123xyz/Taryfy?node-id=13-2 | postęp N z M |
| US-3/AC-2 | zastosowanie taryfy | success | https://www.figma.com/design/AbC123xyz/Taryfy?node-id=13-9 | |
| US-3/AC-3 | zastosowanie taryfy | server_error | brak | ramka dla błędu częściowego (3 z 200 offline) — pytanie do projektanta |
| US-3/AC-3 | zastosowanie taryfy | session_expired | nie dotyczy | operacja trwa w tle, sesja nie jest potrzebna do końca |

## Otwarte pytania
- Czy błąd częściowy ma osobny ekran, czy listę błędów na ekranie sukcesu?
