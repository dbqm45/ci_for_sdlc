---
name: core-grounding
description: Użyj przy każdym twierdzeniu o faktach — sprawdzenie (plik, polecenie, źródło z datą), „nie wiem”, samosprawdzenie.
metadata:
  katalog: "Użyj przy każdej odpowiedzi, raporcie i artefakcie, które zawierają fakty o kodzie, wersjach, API, poleceniach, liczbach lub źródłach — klasy twierdzeń i sposób ich sprawdzenia, miejsca, w których modele najczęściej zmyślają, higiena kontekstu, samosprawdzenie i skrypt sprawdzający odwołania. Nie do procedury badania źródeł zewnętrznych (core-source-research) ani testów kodu (qa-spec-first-testing)."
  slowa: "halucynacje, zmyślanie, nie zgaduj, czy to prawda, kolega twierdzi, podobno istnieje, czy taka opcja istnieje, sprawdź fakty, źródło, pewność, wymyślona flaga, nieistniejące API, za długi kontekst, model się myli, weryfikacja odpowiedzi"
---

# Ugruntowanie odpowiedzi — jak nie zmyślać

Model zmyśla najczęściej wtedy, gdy:
- odpowiada z pamięci zamiast ze sprawdzenia;
- czuje presję, żeby odpowiedzieć zawsze;
- pracuje w długim kontekście pełnym nieudanych prób.

Ten skill usuwa te trzy przyczyny. Dwie części działają mechanicznie i nie zależą od modelu:
- hook `context_guard` ostrzega przed zbyt długim kontekstem;
- skrypt `scripts/grounding_check.py` sprawdza, czy odwołania w dokumentach istnieją.

## 1. Każde twierdzenie ma klasę i dowód
| Klasa | Przykład | Dowód przed napisaniem |
|---|---|---|
| **o tym repozytorium** | „funkcja X waliduje Y”, „plik Z istnieje”, „test przechodzi” | przeczytany plik (`plik:linia`), wynik polecenia w tej sesji |
| **aktualny fakt zewnętrzny** | wersja, zgodność wersji, flaga CLI, opcja konfiguracji, nazwa pakietu, cena, termin prawny, CVE | źródło pierwotne z datą (core-source-research), `--help`, `npm view <pakiet> version`, dokumentacja wersji projektu |
| **wiedza stała** | jak działa B-drzewo, czym jest idempotencja | wystarczy wiedza — ale bez konkretnych liczb i nazw, których nie sprawdziłeś |
| **wniosek lub ocena** | „to pewnie przez cache”, „wariant B będzie tańszy” | oznacz: **[założenie]** albo **[ocena]**, z tym, jak to sprawdzić |

Twierdzenia bez dowodu nie podajesz jako faktu. Do wyboru:
- sprawdź je;
- oznacz jako założenie;
- pomiń.

## 2. „Nie wiem” jest poprawną odpowiedzią
- Gdy nie da się sprawdzić (brak dostępu, brak źródła, brak czasu), mówisz to wprost: czego nie wiesz i jak to
  ustalić. Wymyślona, ale wiarygodnie brzmiąca odpowiedź jest gorsza niż „nie wiem”.
- Nie zgadujesz nazw: metod, endpointów, flag, kluczy konfiguracji, pakietów, plików, zmiennych środowiska.
  Nieistniejąca nazwa pakietu to też ryzyko bezpieczeństwa (podszywające się paczki — ops-supply-chain-security).
- Pytanie zawiera fałszywe założenie (np. pyta o flagę, która nie istnieje)? Mówisz, że tego nie znalazłeś. Pokazujesz, gdzie szukałeś, i nie dopasowujesz odpowiedzi do pytania.

## 3. Miejsca, w których modele zmyślają najczęściej — sprawdzaj zawsze
Wersje i zgodność wersji · nazwy API, metod i opcji · flagi CLI · nazwy pakietów · ścieżki i nazwy plików
w repozytorium · numery (porty, limity, kody błędów, CVE, RFC, artykuły ustaw) · daty i terminy · cytaty
i przypisanie źródeł · wynik polecenia, którego nie uruchomiłeś · zachowanie kodu, którego nie przeczytałeś ·
liczby w szacunkach (pokaż rachunek). Szczegóły i polecenia sprawdzające: `references/sprawdzanie.md`.

## 4. Długie dokumenty: najpierw cytaty, potem wnioski
Przy analizie długiego materiału (specyfikacja, logi, transkrypcja, regulamin):
1. Wypisz dosłowne cytaty z miejscem (plik:linia, sekcja), które odpowiadają na pytanie.
2. Dopiero na ich podstawie wyciągaj wnioski.
3. Wniosek bez cytatu wycofaj albo oznacz jako założenie.

Ten sam wzorzec stosuje ddd-discovery-intake (bank cytatów z kontrolą `evidence`).

## 5. Higiena kontekstu
Jakość odpowiedzi spada, gdy kontekst się wypełnia, i gdy jest w nim dużo nieudanych prób.
- **Jedno zadanie — jeden kontekst.** Nowe, niezwiązane zadanie zaczynasz od czystej sesji (`/clear`). Wracasz
  od punktu kontrolnego (core-project-record), a nie od długiej historii.
- **Dwie nieudane poprawki tego samego** → zatrzymaj się. Zapisz w punkcie kontrolnym, co nie działa i dlaczego.
  Potem zacznij od nowa z lepszym poleceniem.
- **Eksploracja w subagencie** (`scout`, `Explore`): czytanie wielu plików zostaje w jego kontekście, do ciebie
  wraca wynik.
- **Wczytuj tylko potrzebne skille i sekcje** — TL;DR i Przekazanie zamiast całych artefaktów.
- **Kompaktowanie:** decyzje i ustalenia muszą być w plikach, zanim kontekst zostanie streszczony (CLAUDE.md
  mówi, co zachować).
- Hook `context_guard` ostrzega, gdy kontekst przekroczy próg (domyślnie 100 tys. i 150 tys. tokenów). Na
  ostrzeżenie odpowiadasz zapisem punktu kontrolnego i propozycją nowej sesji albo `/compact` z instrukcją.

## 6. Samosprawdzenie przed oddaniem
Przed odpowiedzią z faktami, raportem kroku albo artefaktem:
1. Wypisz w myślach twierdzenia faktograficzne. Każde musi mieć dowód z sekcji 1. Bez dowodu: sprawdź, oznacz
   albo usuń.
2. Twierdzenia o stanie („testy przechodzą”, „plik istnieje”, „wersja X obsługuje Y”) podaj z dowodem: polecenie
   i wynik, `plik:linia`, źródło z datą.
3. Dla dokumentów: `python3 .claude/skills/core-grounding/scripts/grounding_check.py <plik.md>`. Skrypt
   sprawdza, czy ścieżki, odwołania `plik:linia` i lokalne linki istnieją. Z `--jev` (opcjonalnie, klucz
   TYPESAFE_API_KEY) sprawdza też, czy wskazane linie **potwierdzają** zdanie, przy którym stoi odwołanie.
   - Sprzeczne i niepotwierdzające odwołania popraw.
   - Niepewne przejrzyj sam.
4. Przy ważnych decyzjach (architektura, bezpieczeństwo, prawo) niech wynik oceni ktoś bez twojego kontekstu:
   security-reviewer, `/code-review` albo drugi wykonawca. Autor nie ocenia własnej pracy.

## Checklista
- [ ] fakty o repo poparte przeczytanym plikiem lub poleceniem z tej sesji
- [ ] wersje, flagi, API, pakiety, liczby i daty sprawdzone u źródła albo oznaczone jako niezweryfikowane
- [ ] wnioski oznaczone **[założenie]** / **[ocena]**; „nie wiem” tam, gdzie nie da się sprawdzić
- [ ] długi materiał: cytaty przed wnioskami
- [ ] kontekst: zadanie w czystej sesji, eksploracja w subagencie, ostrzeżenie `context_guard` obsłużone
- [ ] `grounding_check.py` bez błędów dla oddawanych dokumentów

## Źródła
- Anthropic — „Reduce hallucinations” (prawo do „nie wiem”, cytaty jako podstawa, weryfikacja przez cytaty,
  weryfikacja wieloprzebiegowa, ograniczenie do podanych materiałów)
- Anthropic — „Best practices for Claude Code” (wypełniony kontekst obniża jakość, `/clear` między zadaniami,
  subagenci do eksploracji, weryfikacja zamiast deklaracji)
Opisane własnymi słowami.
