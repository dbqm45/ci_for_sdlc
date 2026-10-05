# Przykłady: Team Topologies

## 1. Zespół „Backend” zawalony prośbami
**Sytuacja:** Sklep internetowy ma zespoły „Frontend” (6 osób), „Backend” (8 osób) i „DevOps” (3 osoby). Każda
funkcja wymaga pracy wszystkich trzech; Backend ma 40 otwartych próśb od innych, a wydanie funkcji trwa
kilka tygodni czekania w kolejkach.

**Jak:**
1. Prawo Conwaya: zespoły podzielone warstwami → architektura i przepływ pracy też są podzielone warstwami.
2. Granice kontekstów z ddd-strategic-analysis: Katalog, Zamówienia, Płatności, Wycena (reguły rabatowe).
3. Odwrócony manewr Conwaya: zespoły strumieniowe wokół kontekstów, jeden kontekst → jeden właściciel.
4. Obciążenie poznawcze: Wycena wymaga specjalistycznej wiedzy → osobny zespół complicated-subsystem.
5. Infrastrukturę dostarcza platforma przez X-as-a-Service, a nie przez zgłoszenia.

**Wynik:**

| Przed | Po | Typ | Tryb współpracy |
|---|---|---|---|
| Frontend + Backend (14 osób) | Zespół Katalog (5) | stream-aligned | korzysta z platformy jako X-as-a-Service |
| | Zespół Zamówienia i Płatności (6) | stream-aligned | j.w.; z Wyceną przez API |
| | Zespół Wycena (3) | complicated-subsystem | X-as-a-Service (API wyceny) |
| DevOps (3) | Zespół Platforma (3) | platform | X-as-a-Service: szablon usługi, pipeline, monitoring |

Miara zmiany: liczba zależności między zespołami na funkcję (przed: 3 zespoły na każdą funkcję; cel: jeden
zespół strumieniowy + usługi platformy). Każda pozostała zależność to czekanie (proc-lean).

## 2. Długotrwała „współpraca” jako sygnał złej granicy
**Sytuacja:** Zespoły Zamówienia i Płatności od pół roku mają wspólne planowanie, wspólne daily i co tydzień
konflikty w tym samym kodzie. „Świetnie współpracujemy, tylko wszystko trwa”.

**Jak:**
1. Collaboration jest drogi i ma być krótki — na czas odkrywania.
2. Pół roku współpracy → szukasz złej granicy: obie strony zmieniają ten sam model (status płatności zamówienia).
3. Ustalasz właściciela kontekstu i interfejs między zespołami (mapa kontekstów — ddd-context-mapping).
4. Zmianę trybu ogłaszasz jako świadomą decyzję z datą.

**Wynik:**

| | Przed | Po |
|---|---|---|
| Właściciel statusu płatności | oba zespoły | zespół Płatności |
| Interfejs | wspólny kod, wspólne tabele | zdarzenie „płatność przyjęta/odrzucona” publikowane przez Płatności |
| Tryb współpracy | collaboration bez końca | collaboration jeszcze przez 2 sprinty na wydzielenie, potem X-as-a-Service |
| Spotkania | wspólne planowanie i daily | osobne; wspólny przegląd interfejsu raz na kwartał |

## 3. Wprowadzenie wewnętrznej platformy deweloperskiej
**Sytuacja:** Zespół Platforma chce, by od przyszłego miesiąca wszystkie 7 zespołów wdrażało tylko przez nowy
portal. Zespoły strumieniowe nie były pytane.

**Jak:**
1. Platforma jako produkt: użytkownicy to zespoły strumieniowe; ich opinia i adopcja to miara sukcesu.
2. Narzucenie z góry grozi „ShadowOps” — zespoły obchodzą platformę.
3. Start od jednego zespołu pilotażowego, potem dobrowolne przejście kolejnych.
4. Zamiast reguł w wiki — złota ścieżka z wbudowanym bezpieczeństwem, tagami kosztowymi i obserwowalnością.

**Wynik (plan wdrożenia):**

| Etap | Zakres | Kryterium przejścia dalej |
|---|---|---|
| Pilot | zespół Katalog, szablon usługi + pipeline | Katalog wdraża nową usługę samodzielnie, bez zgłoszeń do Platformy |
| Rozszerzenie | chętne zespoły (kolejne 2–3) | adopcja rośnie, opinie użytkowników zebrane i uwzględnione |
| Domyślna ścieżka | wszystkie zespoły; stare ścieżki wygaszane | brak obejść poza platformą |

Zespół enabling (2 osoby z Platformy) przez kilka tygodni uczy zespoły korzystania ze złotej ścieżki
(facilitating), a potem odchodzi.
