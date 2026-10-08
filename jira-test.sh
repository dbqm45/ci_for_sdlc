#!/usr/bin/env bash
set -euo pipefail

# Calls the same Jira search and remote-link endpoints as packages/core/src/connectors/atlassian.ts.
# Runtime settings are read from the running app; the API token is read from its container or
# from the current shell environment. Never source .env (it is executable shell code).

API_URL="${CI_API_URL:-http://127.0.0.1:${CI_PORT:-4317}}"
API_URL="${API_URL%/}"
MAX_ISSUES="${MAX_ISSUES:-2000}"

for command in curl jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

if ! [[ "$MAX_ISSUES" =~ ^[1-9][0-9]*$ ]]; then
  printf 'MAX_ISSUES must be a positive integer.\n' >&2
  exit 1
fi

settings_response=$(curl --silent --show-error --fail "$API_URL/api/settings") || {
  printf 'Cannot read app settings from %s/api/settings. Start the app or set CI_API_URL.\n' "$API_URL" >&2
  exit 1
}

if ! jq -e '.settings | type == "object"' >/dev/null <<<"$settings_response"; then
  printf 'Unexpected settings response from %s/api/settings.\n' "$API_URL" >&2
  exit 1
fi

if [[ $(jq -r '.settings.mode // ""' <<<"$settings_response") != live ]]; then
  printf 'The app is not in Live mode. Set Settings -> Workspace -> Mode to Live first.\n' >&2
  exit 1
fi
if [[ $(jq -r '.settings.integrations.jira.enabled // false' <<<"$settings_response") != true ]]; then
  printf 'Jira integration is disabled in the app settings.\n' >&2
  exit 1
fi

BASE_URL=$(jq -r '.settings.integrations.jira.baseUrl // "" | rtrimstr("/")' <<<"$settings_response")
EMAIL=$(jq -r '.settings.integrations.jira.email // ""' <<<"$settings_response")
PROJECT_KEY=$(jq -r '.settings.integrations.jira.projectKey // ""' <<<"$settings_response")
JQL_FILTER=$(jq -r '.settings.integrations.jira.jqlFilter // ""' <<<"$settings_response")
AC_FIELD=$(jq -r '.settings.integrations.jira.acceptanceCriteriaField // ""' <<<"$settings_response")
ISSUE_TYPE_MAP=$(jq -c '.settings.integrations.jira.issueTypeMap // {}' <<<"$settings_response")

if [[ -z "$BASE_URL" || -z "$EMAIL" || -z "$PROJECT_KEY" ]]; then
  printf 'Jira settings are incomplete: Site URL, Account e-mail, and Project key are required.\n' >&2
  exit 1
fi

# Prefer the token actually injected into the app container, then the caller's exported value.
TOKEN=""
if command -v docker >/dev/null 2>&1; then
  TOKEN=$(docker compose exec -T app printenv JIRA_API_TOKEN 2>/dev/null || true)
fi
TOKEN="${TOKEN:-${JIRA_API_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  printf 'JIRA_API_TOKEN is unavailable. Start the app with its token configured, or export JIRA_API_TOKEN.\n' >&2
  exit 1
fi

# Escape values for curl's stdin config; the secret is never passed as a process argument.
EMAIL=${EMAIL//\\/\\\\}
EMAIL=${EMAIL//\"/\\\"}
TOKEN=${TOKEN//\\/\\\\}
TOKEN=${TOKEN//\"/\\\"}

request_jira() {
  local response
  response=$(printf 'user = "%s:%s"\nheader = "Accept: application/json"\n' "$EMAIL" "$TOKEN" |
    curl --config - --silent --show-error --write-out $'\n%{http_code}' "$@") || {
    printf 'Request to Jira failed before receiving an HTTP response.\n' >&2
    return 1
  }
  HTTP_STATUS=${response##*$'\n'}
  RESPONSE_BODY=${response%$'\n'*}
}

jql="project = \"$PROJECT_KEY\" ${JQL_FILTER} ORDER BY key ASC"
fields="summary,description,issuetype,parent,status,labels,components,issuelinks,updated"
if [[ -n "$AC_FIELD" ]]; then fields+=",${AC_FIELD}"; fi

umask 077
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/jira-test.XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT
ISSUES_FILE="$WORK_DIR/issues.json"
printf '[]\n' >"$ISSUES_FILE"

printf 'Jira site: %s\nProject:   %s\nJQL:       %s\n\n' "$BASE_URL" "$PROJECT_KEY" "$jql"

NEXT_PAGE=""
PAGE=0
while :; do
  PAGE=$((PAGE + 1))
  if [[ -n "$NEXT_PAGE" ]]; then
    request_jira --get \
      --data-urlencode "jql=$jql" \
      --data-urlencode "fields=$fields" \
      --data-urlencode "maxResults=100" \
      --data-urlencode "nextPageToken=$NEXT_PAGE" \
      "$BASE_URL/rest/api/3/search/jql"
  else
    request_jira --get \
      --data-urlencode "jql=$jql" \
      --data-urlencode "fields=$fields" \
      --data-urlencode "maxResults=100" \
      "$BASE_URL/rest/api/3/search/jql"
  fi

  if [[ ! "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
    printf 'Jira search returned HTTP %s:\n%s\n' "$HTTP_STATUS" "${RESPONSE_BODY:0:1000}" >&2
    exit 1
  fi
  if ! jq -e 'type == "object" and ((.issues // []) | type == "array")' >/dev/null <<<"$RESPONSE_BODY"; then
    printf 'Jira search returned an unexpected response:\n%s\n' "${RESPONSE_BODY:0:1000}" >&2
    exit 1
  fi

  PAGE_FILE="$WORK_DIR/page-$PAGE.json"
  printf '%s' "$RESPONSE_BODY" >"$PAGE_FILE"
  jq -s '.[0] + (.[1].issues // [])' "$ISSUES_FILE" "$PAGE_FILE" >"$WORK_DIR/next-issues.json"
  mv "$WORK_DIR/next-issues.json" "$ISSUES_FILE"

  ISSUE_COUNT=$(jq 'length' "$ISSUES_FILE")
  printf 'Page %d: received %d issues (total %d).\n' "$PAGE" "$(jq '.issues | length' "$PAGE_FILE")" "$ISSUE_COUNT"
  if (( ISSUE_COUNT >= MAX_ISSUES )); then break; fi

  NEXT_PAGE=$(jq -r 'if .isLast == false or ((.nextPageToken // "") | length > 0) then (.nextPageToken // "") else "" end' "$PAGE_FILE")
  if [[ -z "$NEXT_PAGE" ]]; then break; fi
done

ISSUE_COUNT=$(jq 'length' "$ISSUES_FILE")
if (( ISSUE_COUNT == 0 )); then
  printf '\nJira returned no issues. The completed search response:\n'
  jq '.' "$WORK_DIR/page-$PAGE.json"
  exit 0
fi

# Match the app's behavior: fetch remote links for non-task/non-subtask items, ignoring failures.
for ((i = 0; i < ISSUE_COUNT && i < MAX_ISSUES; i++)); do
  KEY=$(jq -r ".[$i].key // empty" "$ISSUES_FILE")
  TYPE_NAME=$(jq -r ".[$i].fields.issuetype.name // \"\"" "$ISSUES_FILE")
  IS_SUBTASK=$(jq -r ".[$i].fields.issuetype.subtask // false" "$ISSUES_FILE")
  MAPPED_TYPE=$(jq -r --arg type "$TYPE_NAME" --argjson map "$ISSUE_TYPE_MAP" \
    '$map[$type] // ({"Epic":"epic","Feature":"feature","Story":"story"}[$type] // "story")' <<<"null")
  if [[ -z "$KEY" || "$IS_SUBTASK" == true || "$MAPPED_TYPE" == task || "$MAPPED_TYPE" == subtask ]]; then continue; fi

  request_jira "$BASE_URL/rest/api/3/issue/$KEY/remotelink" || continue
  if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]] && jq -e 'type == "array"' >/dev/null <<<"$RESPONSE_BODY"; then
    jq --argjson index "$i" --argjson links "$RESPONSE_BODY" '.[$index].remoteLinks = $links' \
      "$ISSUES_FILE" >"$WORK_DIR/next-issues.json"
    mv "$WORK_DIR/next-issues.json" "$ISSUES_FILE"
  fi
done

printf '\nJira returned %d issue(s). Requested issue fields and remote links:\n' "$ISSUE_COUNT"
jq '.[0:'"$MAX_ISSUES"'] | .[] | {key, fields, remoteLinks: (.remoteLinks // [])}' "$ISSUES_FILE"
