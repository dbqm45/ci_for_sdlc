# Tokeny, sesje i OAuth — jak się je dziś kradnie i jak projektować obronę

Streszczenia analiz Huntress własnymi słowami; źródła na końcu każdej sekcji. Wnioski projektowe dla zespołu, który
buduje aplikacje i API, są oznaczone jako **Projektuj**.

## 1. Kradzież i odtwarzanie sesji
- **Co się dzieje:** złośliwe oprogramowanie kradnące dane (infostealer) zabiera ciasteczka sesji i tokeny z przeglądarki.
  Trafiają na rynek po kilka–kilkaset dolarów, a kupujący odtwarza je automatycznie. Nie ma zdarzenia logowania ani
  pytania o MFA.
- **Sygnały:** zmiana kraju lub sieci w trakcie sesji, niezgodny odcisk urządzenia, wiele sesji równolegle z różnych miejsc.
- **Projektuj:** krótkie tokeny i sesje z limitem bezwzględnym; server-side session store; wiązanie z urządzeniem
  (DBSC, DPoP); step-up przed operacjami wrażliwymi; „wyloguj wszędzie” jednym wywołaniem.
- Źródło: [From Cookies to Keys](https://www.huntress.com/blog/why-hackers-don't-need-passwords-anymore)

## 2. Phishing przez device code
- **Co się dzieje:** napastnik sam rozpoczyna przepływ device authorization i namawia ofiarę, żeby wpisała kod na
  prawdziwej stronie dostawcy tożsamości. Ofiara przechodzi MFA, a tokeny trafiają do napastnika. W kampanii opisanej
  w marcu 2026 refresh tokeny działały do 90 dni i były odtwarzane z adresów platformy PaaS Railway, której dobra
  reputacja nie wzbudzała alarmów w ocenie ryzyka.
- **Sygnały:** nowe rejestracje urządzeń z domyślnymi nazwami; token aplikacji biurowej użyty wobec innego zasobu
  (np. API zarządzania chmurą); odświeżanie tokenów o stałych godzinach (automat); user agent wewnętrznie sprzeczny
  (np. wersja przeglądarki, która nie istnieje dla deklarowanego systemu); logowania z zakresów adresów centrów danych.
- **Projektuj:** device code tylko dla klientów, które go potrzebują; krótki czas ważności kodu; na stronie zatwierdzenia
  pokaż nazwę aplikacji, lokalizację i zakresy; zapisuj ASN i dostawcę hostingu przy wydaniu i odświeżeniu tokenu
  i alarmuj, gdy token użytkownika jest odświeżany z centrum danych; sprawdzaj spójność user agenta.
- Źródła: [We Need to Talk About Device Code Phishing](https://www.huntress.com/blog/tradecraft-tuesday-device-code-phishing-explained),
  [Riding the Rails: Threat Actors Abuse Railway.com PaaS as Microsoft 365 Token Attack Infrastructure](https://www.huntress.com/blog/railway-paas-m365-token-replay-campaign)

## 3. Kradzież kodu autoryzacji przez „prawdziwe” logowanie
- **Co się dzieje:** napastnik uruchamia na komputerze ofiary (z włączonym trybem dewelopera lub dopuszczonym sideloadingiem) pakiet aplikacji, który otwiera prawdziwe okno logowania
  Microsoft z identyfikatorem klienta aplikacji Office. Ofiara loguje się z MFA, a kod autoryzacji trafia do napastnika,
  który wymienia go na tokeny z szerokimi zakresami. Refresh token działa, dopóki nie zostanie cofnięty (przez administratora, zdarzenie unieważnienia lub CAE).
- **Projektuj:** identyfikator klienta publicznego nie jest dowodem, kto pyta; PKCE obowiązkowe; redirect URI dokładne;
  zmiana hasła lub MFA unieważnia refresh tokeny; polityki dostępu wymagające zarządzanego urządzenia tam, gdzie to możliwe.
- Źródło: [OAuth Token Theft Through Microsoft's Front Door](https://www.huntress.com/blog/stealing-oauth-tokens-through-microsofts-front-door)

## 4. Złośliwe aplikacje OAuth i nadużyte zgody
- **Co się dzieje:** Huntress znalazł w ciągu pół roku ponad 500 aplikacji zainstalowanych przez zgodę użytkownika
  (bez administratora) i około 1500 przypadków legalnych aplikacji użytych do ataku. Typowe cechy: nazwa podszywająca się pod użytkownika
  lub domenę, nazwy w rodzaju „Test App”, adresy zwrotne loopback, aplikacja rzadka globalnie, ale z dostępem do jednej
  skrzynki, uprawnienia dużo szersze niż deklarowany cel.
- **Projektuj (serwer autoryzacji):** lista dozwolonych zakresów per klient, zgoda administratora dla zakresów wysokiego
  ryzyka, widok „aplikacje z dostępem do mojego konta” z możliwością cofnięcia, log każdej zgody (kto, klient, zakresy,
  redirect URI). **Projektuj (klient):** proś o najmniejsze zakresy i rozszerzaj je stopniowo.
- Źródło: [Six Months of Researching OAuth Application Attacks](https://www.huntress.com/blog/never-just-one-termite-6-months-of-researching-oauth-application-attacks)

## 5. Higiena uprawnień
- **Co się dzieje:** nadmiar lokalnych administratorów, konta administracyjne używane do poczty i przeglądania,
  „przypadkowi” administratorzy z testowych wersji SaaS.
- **Projektuj:** osobne konta administracyjne bez skrzynki pocztowej; uprawnienia na czas; przegląd dostępu co pół roku;
  prośba o uprawnienie łatwa, żeby nikt nie obchodził procesu.
- Źródło: [What Good Privilege Hygiene Looks Like](https://www.huntress.com/blog/privilege-hygiene-least-privilege-best-practices)

## 6. Wystawiona aplikacja i deserializacja
- **Co się dzieje:** SolarWinds Web Help Desk przed wersją 12.8.7 HF1 deserializował niezaufane dane Java, co dawało
  wykonanie kodu bez logowania; interfejs administracyjny był dostępny z internetu. Po włamaniu proces aplikacji
  uruchamiał powłokę, instalował narzędzia zdalnego dostępu i tunel, wyłączał ochronę systemu.
- **Projektuj:** bez deserializacji do obiektów natywnych; panel admina poza internetem; aplikacja jako użytkownik
  bez uprawnień, w kontenerze tylko do odczytu, z ograniczonym ruchem wychodzącym; alarm, gdy proces aplikacji
  uruchamia proces potomny (ops-observability); SLA na łatki komponentów wystawionych do internetu.
- Źródło: [Active Exploitation of SolarWinds Web Help Desk (CVE-2025-26399)](https://www.huntress.com/blog/active-exploitation-solarwinds-web-help-desk-cve-2025-26399)
