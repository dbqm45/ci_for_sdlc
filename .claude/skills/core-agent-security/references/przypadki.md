# Przypadki z analiz Huntress (streszczenia własnymi słowami)

## ClickFix: „wklej i uruchom”
- **Mechanizm:** fałszywa CAPTCHA albo pełnoekranowa „aktualizacja Windows” prosi o skrót Win+R, wklejenie ze schowka
  i Enter. Wklejone polecenie (np. `mshta` z adresem IP zapisanym szesnastkowo) pobiera kolejne etapy; w jednej odmianie
  kod był ukryty w pikselach obrazka PNG, a końcowym ładunkiem były programy kradnące hasła i dane przeglądarek.
- **Lekcja:** polecenie z treści strony to dane. Wykrywanie: łańcuch przeglądarka/explorer → mshta/PowerShell,
  adresy IP w nietypowym zapisie w linii poleceń.
- Źródło: [ClickFix Gets Creative: Malware Buried in Images](https://www.huntress.com/blog/clickfix-malware-buried-in-images)

## Fałszywe GPT i fałszywe instrukcje narzędzi AI
- **Mechanizm:** reklamy w wyszukiwarce prowadziły do spreparowanych Custom GPT na chatgpt.com, które kierowały na
  stronę z fałszywą CAPTCHA i poleceniem PowerShell; na końcu instalowany był RAT z dostępem do ekranu, kamery i mikrofonu.
  W innych kampaniach udostępnione rozmowy na oficjalnych domenach ChatGPT, Grok i claude.ai podawały „poradę” (np. jak
  zwolnić miejsce na dysku albo jak zainstalować Claude Code) w postaci polecenia do Terminala, które instalowało złodzieja
  danych na macOS (hasła, pęk kluczy, portfele).
- **Lekcja:** zaufana domena nie czyni polecenia zaufanym. Narzędzia instaluj z oficjalnej dokumentacji, nie z wyników
  sponsorowanych. Huntress podsumowuje to tak: zaufanie stało się powierzchnią ataku.
- Źródła: [Attackers Abuse ChatGPT Custom GPTs to Deliver RAT via ClickFix](https://www.huntress.com/blog/chatgpt-custom-gpts-clickfix-rat),
  [Attackers Didn't Wait for AI. They Built Workflows Around It.](https://www.huntress.com/blog/ai-powered-attack-workflows),
  [AMOS Stealer Exploits AI Trust: Malware Delivered Through ChatGPT and Grok](https://www.huntress.com/blog/amos-stealer-chatgpt-grok-ai-trust),
  [How a Google Search for Claude Led to MacSync](https://www.huntress.com/blog/fake-claude-macsync)

## Asystent AI na przejętej maszynie
- **Mechanizm:** serwer programisty z Next.js podatnym na React2Shell (prawdopodobny wektor ponownej infekcji) był przejęty przez kilku napastników naraz
  (koparki, botnet, kradzież danych). Zabrano m.in. `~/.ssh`, `~/.aws`, `~/.kube/config`, pliki `.env`,
  `.git-credentials` i dane z usługi metadanych chmury. Trwałość: osiem mechanizmów (cron użytkownika i systemowy, usługi
  systemd użytkownika uruchamiane z `/dev/shm`, reguły udev, pliki zablokowane `chattr +i`), a do tego kasowanie historii
  i logów. Programista poprosił asystenta AI o „naprawę” hałasującego wentylatora; asystent ograniczył CPU, objaw zniknął,
  napastnicy zostali. Bez uprawnień root asystent nie widział systemowych mechanizmów trwałości, a jego polecenia wyglądały
  w telemetrii jak rekonesans napastnika.
- **Lekcja:** objawy włamania zgłaszasz, nie naprawiasz; ogranicz sudo bez hasła; sesje agenta zostawiają ślad
  z czasem, żeby dało się je oddzielić od działań napastnika; usuń przyczynę (łatka), a nie tylko skutek.
- Źródła: [Codex Red: Untangling a Linux Incident With an OpenAI Twist (Part 1)](https://www.huntress.com/blog/codex-part-one),
  [Part 2](https://www.huntress.com/blog/codex-part-two)

## Agent AI jako nowe zagrożenie wewnętrzne
- **Teza Huntress:** agent dostaje uprawnienia jednym kliknięciem, działa z szybkością maszyny i nie kwestionuje
  złych poleceń; złośliwe serwery MCP i skille już się pojawiły.
- **Zalecenia:** osobna tożsamość i minimalne uprawnienia dla każdego agenta, przegląd wtyczek i integracji jak dostawców,
  punkt odniesienia dla normalnego zachowania i alarm przy odchyleniach, ślad audytowy łączący tożsamość z działaniami,
  plan izolacji na wypadek przejęcia agenta.
- Źródło: [AI Agent Security Risks: How Autonomous Agents Become an Insider Threat](https://www.huntress.com/insider-threats-guide/ai-agent-security-risks)

## AI przyspiesza stare techniki
- **Teza Huntress:** modele językowe skracają czas ataku mniej doświadczonym napastnikom, ale techniki pozostają te same
  (kradzież poświadczeń, zdalne narzędzia administracyjne, rozszerzenia przeglądarki). Obrona też się nie zmienia:
  telemetria, logowanie linii poleceń, MFA na narzędziach administracyjnych, minimalne uprawnienia.
- Źródło: [Reflecting on AI in 2025: Faster Attacks, Same Old Tradecraft](https://www.huntress.com/blog/ai-2025-faster-attacks-same-tradecraft)

## Zatruwanie narzędzi MCP i kontrola zmian od AI (devops.com)
- **Mechanizm:** ukryte instrukcje w opisie narzędzia MCP każą agentowi odczytać `~/.ssh`, `.env` lub kubeconfig albo
  uruchomić `curl | bash`; złośliwe narzędzie może też podszywać się pod wysoki priorytet i rejestrować wywołania <!-- audit-ok: opis ataku, nie polecenie -->
  innych narzędzi. W opisanym przez Zenity Labs przypadku instrukcja w zgłoszeniu Jira, przekazana przez MCP, skłoniła
  agenta w edytorze do wysłania sekretów.
- **Lekcja:** przegląd opisów narzędzi jak kodu; zmiany w pipeline od AI oznaczone, z CODEOWNERS na ścieżkach
  chronionych, z limitem zakresu i testami, których agent nie może zmienić.
- Źródła: [Prompt Injection Isn't Just a Chat Problem — It's a DevOps Threat](https://devops.com/prompt-injection-isnt-just-a-chat-problem-its-a-devops-threat/),
  [Your Next Secrets Leak is Hiding in AI Coding Tools](https://devops.com/your-next-secrets-leak-is-hiding-in-ai-coding-tools/) (artykuł dostawcy),
  [The Agent Proposes, the Pipeline Disposes](https://devops.com/the-agent-proposes-the-pipeline-disposes-controls-for-ai-authored-change/),
  [AI-Generated Code Packages Can Lead to 'Slopsquatting'](https://devops.com/ai-generated-code-packages-can-lead-to-slopsquatting-threat/)
