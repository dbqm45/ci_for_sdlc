---
name: ops-ai-inference
description: Użyj przy własnym hostowaniu modeli językowych — pamięć GPU i KV cache, vLLM, continuous batching, metryki, skalowanie.
metadata:
  katalog: "Użyj przy własnym hostowaniu modeli językowych i infrastrukturze AI — pamięć GPU i KV cache, prefill i decode, continuous batching (vLLM), routing świadomy cache (llm-d, Gateway API Inference Extension), rozdzielenie prefill/decode, metryki i skalowanie, API czy własny serwer. Nie do SLO funkcji AI (ops-sre-incidents) ani ogólnych operacji Kubernetes (ops-kubernetes)."
---

# Infrastruktura inferencji modeli językowych

Serwer modelu językowego to nie bezstanowa usługa HTTP, tylko kolejka przed bardzo drogim i wymagającym akceleratorem.
Narzędzia ze świata aplikacji webowych (round-robin, autoskalowanie po CPU) działają tu źle.

## 0. Czy w ogóle hostować samemu
Własny serwer ma sens przy stałym, dużym ruchu, wymaganiach co do danych (nie mogą opuścić infrastruktury) albo modelu
dostrajanym u siebie. Przy małym lub nierównym ruchu API dostawcy jest zwykle tańsze i prostsze — GPU kosztuje także
wtedy, gdy nic nie robi. Decyzję zapisz jako ADR z kosztem na 1000 żądań po obu stronach (ops-finops).

## 1. Co ogranicza GPU
- Wąskim gardłem jest zwykle **pamięć GPU (VRAM)**, nie moc obliczeniowa. Konkurują o nią trzy rzeczy:
  wagi modelu, aktywacje i **KV cache** (zapamiętany stan przetworzonych tokenów).
- Wagi: liczba parametrów × bajty na parametr — model 70 mld parametrów w 16 bitach to ok. 140 GB, więc potrzebuje
  kilku GPU (tensor parallelism, komunikacja między GPU przez NVLink lub InfiniBand przy każdym tokenie).
- KV cache rośnie z każdym tokenem rozmowy: kilka długich rozmów potrafi wyczerpać pamięć, choć sam model się mieści.
  Dlatego limit długości kontekstu i liczby równoczesnych sekwencji ustawiasz świadomie.

## 2. Dwie fazy generowania
| Faza | Co się dzieje | Ogranicza ją |
|---|---|---|
| prefill | cały prompt przetwarzany naraz, powstaje pierwszy token | moc obliczeniowa; rośnie z długością promptu |
| decode | kolejne tokeny po jednym | przepustowość pamięci |
Metryki odpowiadają fazom: czas do pierwszego tokenu (TTFT) to głównie prefill i kolejka, czas między tokenami — decode.

## 3. Serwer modelu
- **Continuous batching** (np. vLLM z PagedAttention): kroki decode wielu żądań przeplatane na jednym GPU, wolne
  miejsca od razu zajmowane przez nowe żądania. Według autora artykułu jedno GPU obsługuje wtedy dziesiątki rozmów
  zamiast jednej. Zanim zbudujesz klaster, uruchom sam serwer z równoległymi żądaniami i zmierz to.
- API zgodne z OpenAI (`/v1/chat/completions`) — klienci (SDK, LangChain) nie zależą od tego, kto serwuje model.

## 4. Routing: round-robin niszczy cache
- Zwykły Service Kubernetes lub load balancer wysyła kolejną wiadomość rozmowy do przypadkowego poda. Tam cache danej
  rozmowy nie istnieje, więc cały kontekst jest przeliczany od nowa — to właśnie „wolna” odpowiedź.
- **Routing świadomy cache** (prefix-cache routing): brama zna stan i obciążenie każdego poda i kieruje wiadomość tam,
  gdzie leży jej KV cache. Przykład: llm-d (projekt CNCF Sandbox, na bazie vLLM) z bramą Gateway API Inference Extension
  i komponentem wybierającym endpoint (Endpoint Picker).
- **Rozdzielenie prefill i decode** na osobne pule podów, skalowane niezależnie; cache przekazywany między nimi przez RDMA.
- Wynik z artykułu (8 podów, 16 GPU H100, ruch wielu klientów): ok. 2× większa przepustowość niż przy round-robin.

## 5. Operacje
- Metryki zdrowia: **odsetek trafień w cache**, **głębokość kolejki**, TTFT, czas między tokenami, zajętość KV cache,
  wykorzystanie GPU (Prometheus). Autoskalowanie po kolejce i opóźnieniu, nie po CPU.
- GPU w Kubernetes: zasób `nvidia.com/gpu` przez device plugin (lub GPU Operator), węzły GPU z taintami, żeby nie
  trafiały na nie zwykłe pody; requests i limity pamięci hosta dla procesu serwera (ops-kubernetes).
- Zmiana modelu = wydanie: wersja modelu i konfiguracji serwera w Git (np. nakładka Kustomize), wdrożenie stopniowe
  z porównaniem jakości i opóźnień (ops-release-engineering), SLO w trzech warstwach (ops-sre-incidents, sekcja 2).
- Modele i wagi z zaufanego źródła, z sumą kontrolną; model to też element łańcucha dostaw (ops-supply-chain-security).
- Ścieżka nauki: sam vLLM z równoległymi żądaniami → mały klaster (kind/minikube z GPU) z llm-d → sprzęt produkcyjny.

## Checklista
- [ ] decyzja API vs własny serwer z kosztem na żądanie
- [ ] budżet pamięci GPU: wagi + KV cache przy docelowej długości kontekstu i liczbie sekwencji
- [ ] serwer z continuous batching; routing świadomy cache zamiast round-robin
- [ ] metryki: trafienia w cache, kolejka, TTFT, czas między tokenami; autoskalowanie po kolejce
- [ ] model i konfiguracja wersjonowane, wdrażane stopniowo

## Źródło
[AI infrastructure — DevOps](https://medium.com/the-advanced-school-of-ai/ai-infrastructure-devops-0466baa552a3) — Gaurav Agnihotri,
The Advanced School of AI, wrzesień 2026 (streszczenie własnymi słowami; liczby z artykułu oznaczone w tekście).
Wyliczenie pamięci wag i zasady GPU w Kubernetes: własne.
