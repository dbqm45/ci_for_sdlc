#!/usr/bin/env bash
# Kreator konfiguracji — szablon claude-team-factory (skill ops-setup-wizard).
# Uruchamia CZŁOWIEK na swoim komputerze. Agent pisze tylko etapy poniżej znacznika ETAPY.
# Biblioteka powyżej znacznika jest taka sama w każdym kreatorze — nie edytuj jej ręcznie.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
TOTAL_STAGES=0          # agent ustawia liczbę etapów
CURRENT_STAGE=0
START_TS=$(date +%s)
DONE=()
SKIPPED=()
MANUAL=()

if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[0m'; else B=""; D=""; G=""; Y=""; R=""; fi

say()  { printf '%s\n' "$*"; }
step() { printf '  %s→%s %s\n' "$B" "$R" "$*"; }
warn() { printf '%s! %s%s\n' "$Y" "$*" "$R"; }

stage() {
  CURRENT_STAGE=$((CURRENT_STAGE + 1))
  if [ -t 1 ]; then clear; fi
  local elapsed=$(( $(date +%s) - START_TS )) left=""
  if [ "$CURRENT_STAGE" -gt 1 ]; then
    local per=$(( elapsed / (CURRENT_STAGE - 1) ))
    left=" · zostało ok. $(( (per * (TOTAL_STAGES - CURRENT_STAGE + 1) + 59) / 60 )) min"
  fi
  printf '%sEtap %d/%d%s%s\n%s%s%s\n\n' "$D" "$CURRENT_STAGE" "$TOTAL_STAGES" "$left" "$R" "$B" "$1" "$R"
}

pause() { read -r -p "${D}Enter, aby kontynuować…${R} " _ </dev/tty; }

confirm() {  # confirm "Pytanie?" → 0 = tak
  local a; read -r -p "$1 [t/N] " a </dev/tty
  [[ "$a" =~ ^[tTyY] ]]
}

open_url() {
  say "  ${B}Otwórz:${R} $1"
  if command -v wslview >/dev/null 2>&1; then wslview "$1" >/dev/null 2>&1 || true
  elif grep -qi microsoft /proc/version 2>/dev/null && command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$1" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then open "$1" || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  fi
}

env_get() {  # wartość z ENV_FILE (bez cudzysłowów) albo pusty napis
  [ -f "$ENV_FILE" ] || return 0
  local line; line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  if [[ "$line" == \"*\" ]]; then
    line=${line:1:${#line}-2}; line=${line//\\\"/\"}; line=${line//\\\\/\\}
  fi
  printf '%s' "$line"
}

ask() {  # ask ZMIENNA "Pytanie" — domyślnie wartość z .env
  local def; def=$(env_get "$1"); local v
  read -r -p "  $2${def:+ [$def]}: " v </dev/tty
  printf -v "$1" '%s' "${v:-$def}"
}

ask_secret() {  # ask_secret ZMIENNA "Pytanie" — wpis bez echa; Enter zostawia obecną wartość
  local def; def=$(env_get "$1"); local v
  read -r -s -p "  $2${def:+ [Enter = bez zmian]}: " v </dev/tty; printf '\n'
  printf -v "$1" '%s' "${v:-$def}"
}

write_env() {  # write_env KLUCZ wartość — dopisuje albo podmienia (idempotentnie)
  local key=$1 val=$2 tmp
  if [[ ! "$val" =~ ^[A-Za-z0-9_./:@+-]*$ ]]; then val=${val//\\/\\\\}; val="\"${val//\"/\\\"}\""; fi
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE" 2>/dev/null || true
  tmp=$(mktemp)
  grep -vE "^$key=" "$ENV_FILE" >"$tmp" || true
  printf '%s=%s\n' "$key" "$val" >>"$tmp"
  cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
  step "zapisano $key w $ENV_FILE"
}

gh_ok() { command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; }

set_secret() {  # set_secret NAZWA wartość — sekret GitHub Actions (wartość przez stdin, nie w argumentach)
  if gh_ok; then printf '%s' "$2" | gh secret set "$1" >/dev/null && step "ustawiono sekret $1"
  else MANUAL+=("sekret GitHub $1 (brak zalogowanego gh)"); warn "gh niedostępny — ustaw sekret $1 ręcznie"; fi
}

set_var() {  # set_var NAZWA wartość — zmienna GitHub Actions (jawna)
  if gh_ok; then gh variable set "$1" --body "$2" >/dev/null && step "ustawiono zmienną $1"
  else MANUAL+=("zmienna GitHub $1"); warn "gh niedostępny — ustaw zmienną $1 ręcznie"; fi
}

done_stage() { DONE+=("$1"); }
skip_stage() { SKIPPED+=("$1"); }

summary() {
  if [ -t 1 ]; then clear; fi
  say "${B}Podsumowanie${R}"
  local x
  for x in "${DONE[@]+"${DONE[@]}"}"; do say "  ${G}✓${R} $x"; done
  for x in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do say "  ${Y}–${R} pominięto: $x"; done
  for x in "${MANUAL[@]+"${MANUAL[@]}"}"; do say "  ${Y}!${R} do zrobienia ręcznie: $x"; done
  say ""; say "Ponowne uruchomienie podstawi zapisane wartości jako domyślne."
}

trap 'printf "\nPrzerwano. Uruchom ponownie — zapisane wartości zostaną podstawione.\n"' INT

### ETAPY ### — poniżej agent pisze etapy (przykład do zastąpienia)
TOTAL_STAGES=1

stage "Przykład: klucz API usługi X"
step "Panel → Developers → API keys → Reveal test key → skopiuj"
open_url "https://example.com/dashboard/api-keys"
ask_secret X_API_KEY "Wklej klucz testowy"
write_env X_API_KEY "$X_API_KEY"
if confirm "Czy CI też potrzebuje tego klucza?"; then set_secret X_API_KEY "$X_API_KEY"; fi
done_stage "klucz API usługi X"

summary
