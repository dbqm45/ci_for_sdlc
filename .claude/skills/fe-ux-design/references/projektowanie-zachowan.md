# Projektowanie zmiany zachowań

Gdy funkcja ma sprawić, że ludzie **zaczną, będą kontynuować albo przestaną** coś robić (oszczędzanie, regularne
rozliczanie, nauka, zdrowie, bezpieczeństwo konta). Zaczynasz od bramki etycznej, nie od technik.

## 0. Bramka etyczna (przed projektem)
- Czy zachowanie służy **użytkownikowi** (sam chciałby je robić, gdyby było łatwiej), a nie tylko metryce firmy?
- Czy użyłbyś tego sam i polecił bliskim? Czy użytkownik zaakceptowałby technikę, gdyby wiedział, jak działa?
- Macierz N. Eyala: produkt, który poprawia życie i którego twórca sam używa — „ułatwiacz” (w porządku); poprawia,
  ale twórca nie używa — „sprzedawca”; nie poprawia, a twórca używa — „rozrywka”; ani jedno, ani drugie — „diler”
  (nie projektujesz).
- Bez technik uzależniających (nieskończone przewijanie z nagrodą losową dla dzieci, nagrody za samo otwieranie
  aplikacji), bez wzorców zwodniczych (`tresci-i-etyka.md`), bez straszenia stratą przy rezygnacji. Wynik bramki
  zapisz w specyfikacji; wątpliwość → decyzja człowieka.

## 1. Zdefiniuj cel (aktor, działanie, wynik)
- **Wynik docelowy**: zmiana w świecie, którą da się zmierzyć (np. „klienci mają poduszkę finansową na 3 miesiące”).
- **Aktor**: kto ma działać, w jakim kontekście i z jakimi ograniczeniami (z badań, nie demografia).
- **Działanie docelowe**: konkretne zachowanie, które prowadzi do wyniku („co miesiąc przelewa 10% pensji na konto
  oszczędnościowe”). Rodzaj według siatki Fogga — nowe / znane / wzmocnić / osłabić / przerwać × jednorazowo /
  przez okres / na stałe — mówi, jak trudne jest zadanie (jednorazowe znane zachowanie jest najłatwiejsze,
  trwałe przerwanie nawyku — najtrudniejsze).

## 2. Diagnoza: dlaczego dziś się nie dzieje
- **Model Fogga B = MAP**: zachowanie zachodzi, gdy w tej samej chwili jest **motywacja**, **zdolność** (łatwość)
  i **bodziec**. Brak bodźca → przypomnienie; niska motywacja → bodziec-iskra z powodem; niska zdolność → ułatw
  (to zwykle najskuteczniejsza dźwignia). Łatwość psują: czas, pieniądze, wysiłek fizyczny i umysłowy, odstępstwo
  od norm społecznych i od rutyny.
- **Lejek CREATE** (S. Wendel) — działanie przechodzi przez sześć etapów, porażka na którymkolwiek je zatrzymuje:
  **sygnał** (czy użytkownik zauważa okazję), **reakcja** (automatyczne „podoba mi się / nie”), **ocena** (świadomy
  bilans kosztu i korzyści), **zdolność** (czy może to zrobić teraz), **czas** (czy jest pilne teraz), **wykonanie**.
  Mierz odpływ na każdym etapie i popraw najsłabszy.
- **Dwa systemy myślenia**: szybki i automatyczny oraz wolny i analityczny. Większość codziennych działań jest
  automatyczna — dlatego działają wartości domyślne i nawyki, a długi tekst perswazyjny zwykle nie.

## 3. Strategia — od najskuteczniejszej
1. **„Oszukaj” problem — zrób to za użytkownika**: rozsądna wartość domyślna (z możliwością zmiany), automatyzacja
   powtarzalnych kroków, działanie przy okazji innego (zaokrąglanie płatności na oszczędności).
2. **Nawyk**: stały sygnał w istniejącej rutynie (pętla sygnał → rutyna → nagroda), natychmiastowa i znacząca
   nagroda (postęp, ukończenie widoczne od razu), mały pierwszy krok. Zmiana złego nawyku: zastąp rutynę przy tym
   samym sygnale, pomóż unikać sygnału, uświadom moment działania.
3. **Świadome działanie** (gdy dwie pierwsze nie pasują): jasna informacja, co i dlaczego, plan „kiedy, gdzie, jak”
   (intencje implementacyjne — konkretny plan zwiększa szansę wykonania), przypomnienie o wcześniejszym zobowiązaniu,
   przybliżenie skutków w czasie („tracisz 40 zł miesięcznie”, nie „480 zł rocznie”), postęp widoczny i liczony.

## 4. Techniki — i ich granice
| Technika | Użycie w porządku | Nadużycie |
|---|---|---|
| wartość domyślna | najczęściej wybierana, korzystna dla użytkownika opcja | zgody, dodatki płatne, udostępnianie danych domyślnie włączone |
| dowód społeczny, porównanie z innymi | prawdziwe dane („70% osób w Twojej firmie włączyło MFA”) | zmyślone liczby, porównania zawstydzające |
| autorytet | rzetelne źródło przy decyzji | fałszywe rekomendacje, odznaki bez pokrycia |
| niechęć do straty | uczciwa informacja o realnej stracie (wygasające środki) | zastraszanie przy rezygnacji, sztuczna pilność |
| ograniczenie wyboru | 3–5 opcji z polecaną, filtrowanie | ukrywanie tańszej opcji |
| grywalizacja, postęp | postęp w realnym celu, nagrody wspierające cel | punkty za czas spędzony w aplikacji, nagroda losowa jako przynęta |
| zobowiązanie wobec innych | dobrowolne, łatwe do wycofania | publikowanie porażek bez zgody |
| model haczyka (bodziec → działanie → zmienna nagroda → inwestycja) | analiza, dlaczego coś wciąga, i budowa nawyków, które użytkownik chce mieć | projektowanie przymusu korzystania |
- Wybór miejsca na **spektrum interwencji**: szturchnięcie (nudge) dla prostych, odwracalnych decyzji; zwolnienie
  i namysł (porównanie, potwierdzenie) dla decyzji ważnych i nieodwracalnych (kredyt, usunięcie danych).

## 5. Pomiar i pętla
- Metryka zachowania (czy działanie zachodzi) i wyniku (czy świat się zmienił) — wzrost działania bez wyniku
  oznacza złe działanie docelowe.
- Testy: A/B pojedynczej zmiany, wielowariantowe przy dużym ruchu (proc-product-discovery, `eksperymenty-i-wydanie.md`),
  obserwacja długoterminowa (nawyk po 30 i 90 dniach, nie tylko pierwszy tydzień).
- Lekcje zbierasz, ustalasz priorytety według wpływu i wysiłku, wprowadzasz — i wracasz do diagnozy.

## Źródła
- S. Wendel, *Designing for Behavior Change* (2. wyd. 2020) — CREATE, trzy strategie, etyka;
  B. J. Fogg, [Behavior Model](https://behaviormodel.org/), [Behavior Grid](https://behaviordesign.stanford.edu/resources/fogg-behavior-grid), *Tiny Habits* (2019)
- N. Eyal, *Hooked* (2014) — model haczyka i macierz manipulacji; C. Duhigg, *The Power of Habit* (2012);
  D. Kahneman, *Thinking, Fast and Slow* (2011); R. Thaler, C. Sunstein, *Nudge* (2008)
- [LogRocket — starter guide to behavioral design](https://blog.logrocket.com/ux-design/starter-guide-behavioral-design/);
  [roadmap.sh — UX Design](https://roadmap.sh/ux-design)
Opisane własnymi słowami.
