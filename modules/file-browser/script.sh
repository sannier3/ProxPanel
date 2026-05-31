#!/usr/bin/env bash
# Liste un répertoire sur un nœud PVE (local ou distant via SSH cluster).
# Usage: script.sh list <node> <path>
set -euo pipefail

ACTION="${1:-}"
NODE="${2:-}"
TARGET="${3:-/}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

local_pve_node_name() {
  if [[ -L /etc/pve/local ]]; then
    basename "$(readlink -f /etc/pve/local 2>/dev/null)" 2>/dev/null || true
  fi
}

node_is_local() {
  local node="$1"
  [[ -z "$node" ]] && return 0

  local short full pve_name h
  short="$(hostname -s 2>/dev/null || true)"
  full="$(hostname -f 2>/dev/null || hostname 2>/dev/null || true)"
  h="$(hostname 2>/dev/null || true)"
  pve_name="$(local_pve_node_name)"

  [[ "$node" == "$short" || "$node" == "$full" || "$node" == "$h" ]] && return 0
  [[ -n "$pve_name" && "$node" == "$pve_name" ]] && return 0
  return 1
}

normalize_target() {
  local t="$1"
  if [[ "$t" != /* ]]; then
    t="/$t"
  fi
  t="$(printf '%s' "$t" | sed 's|//|/|g')"
  if [[ "$t" != "/" ]]; then
    t="${t%/}"
  fi
  if [[ "$t" == *".."* ]]; then
    return 1
  fi
  printf '%s' "$t"
}

emit_entries_json() {
  local list_target="$1"
  local FIRST=1

  if [[ ! -e "$list_target" ]]; then
    printf '{"entries":[]}\n'
    return 0
  fi

  if [[ ! -d "$list_target" ]]; then
    local name size mtime
    name="$(basename "$list_target")"
    if stat --version >/dev/null 2>&1; then
      size="$(stat -c '%s' "$list_target" 2>/dev/null || echo 0)"
      mtime="$(stat -c '%Y' "$list_target" 2>/dev/null || echo "")"
    else
      size="$(stat -f '%z' "$list_target" 2>/dev/null || echo 0)"
      mtime="$(stat -f '%m' "$list_target" 2>/dev/null || echo "")"
    fi
    [[ -z "${mtime:-}" ]] && mtime="null"
    printf '{"entries":[{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}]}\n' \
      "$(json_escape "$name")" "$(json_escape "$list_target")" "${size:-0}" "$mtime"
    return 0
  fi

  printf '{"entries":['

  add_entry() {
    local entry_path="$1"
    local name type size mtime esc_name esc_path
    name="$(basename "$entry_path")"
    [[ "$name" == "." || "$name" == ".." ]] && return 0

    if [[ -d "$entry_path" ]]; then
      type="dir"
      size="null"
      mtime="null"
    elif [[ -f "$entry_path" || -L "$entry_path" ]]; then
      type="file"
      if stat --version >/dev/null 2>&1; then
        size="$(stat -c '%s' "$entry_path" 2>/dev/null || echo 0)"
        mtime="$(stat -c '%Y' "$entry_path" 2>/dev/null || echo "")"
      else
        size="$(stat -f '%z' "$entry_path" 2>/dev/null || echo 0)"
        mtime="$(stat -f '%m' "$entry_path" 2>/dev/null || echo "")"
      fi
      [[ -z "${mtime:-}" ]] && mtime="null"
    else
      return 0
    fi

    if [[ "$FIRST" -eq 1 ]]; then
      FIRST=0
    else
      printf ','
    fi

    esc_name="$(json_escape "$name")"
    esc_path="$(json_escape "$entry_path")"

    if [[ "$type" == "dir" ]]; then
      printf '{"name":"%s","type":"dir","path":"%s","size":null,"mtime":null}' "$esc_name" "$esc_path"
    else
      printf '{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}' "$esc_name" "$esc_path" "$size" "$mtime"
    fi
  }

  shopt -s nullglob dotglob 2>/dev/null || true
  local entry
  for entry in "$list_target"/* "$list_target"/.[!.]* "$list_target"/..?*; do
    [[ -e "$entry" ]] || continue
    add_entry "$entry"
  done

  printf ']}\n'
}

list_local() {
  local target="$1"
  emit_entries_json "$target"
}

list_remote_ssh() {
  local node="$1"
  local target="$2"
  ssh -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=10 \
    "root@${node}" \
    "TARGET=$(printf '%q' "$target") bash -s" <<'REMOTE'
set -euo pipefail
TARGET="${TARGET:-/}"
if [[ "$TARGET" != /* ]]; then TARGET="/$TARGET"; fi
TARGET="$(printf '%s' "$TARGET" | sed 's|//|/g')"
if [[ "$TARGET" != "/" ]]; then TARGET="${TARGET%/}"; fi
if [[ "$TARGET" == *".."* ]]; then echo '{"error":"invalid_path"}'; exit 1; fi

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

if [[ ! -e "$TARGET" ]]; then printf '{"entries":[]}\n'; exit 0; fi

if [[ ! -d "$TARGET" ]]; then
  name="$(basename "$TARGET")"
  size="$(stat -c '%s' "$TARGET" 2>/dev/null || echo 0)"
  mtime="$(stat -c '%Y' "$TARGET" 2>/dev/null || echo null)"
  printf '{"entries":[{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}]}\n' \
    "$(json_escape "$name")" "$(json_escape "$TARGET")" "$size" "$mtime"
  exit 0
fi

printf '{"entries":['
FIRST=1
add_entry() {
  local entry_path="$1" name type size mtime
  name="$(basename "$entry_path")"
  [[ "$name" == "." || "$name" == ".." ]] && return 0
  if [[ -d "$entry_path" ]]; then type="dir"; size="null"; mtime="null";
  elif [[ -f "$entry_path" || -L "$entry_path" ]]; then
    type="file"
    size="$(stat -c '%s' "$entry_path" 2>/dev/null || echo 0)"
    mtime="$(stat -c '%Y' "$entry_path" 2>/dev/null || echo null)"
  else return 0; fi
  [[ "$FIRST" -eq 1 ]] && FIRST=0 || printf ','
  if [[ "$type" == "dir" ]]; then
    printf '{"name":"%s","type":"dir","path":"%s","size":null,"mtime":null}' \
      "$(json_escape "$name")" "$(json_escape "$entry_path")"
  else
    printf '{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}' \
      "$(json_escape "$name")" "$(json_escape "$entry_path")" "$size" "$mtime"
  fi
}
shopt -s nullglob dotglob
for entry in "$TARGET"/* "$TARGET"/.[!.]* "$TARGET"/..?*; do
  [[ -e "$entry" ]] || continue
  add_entry "$entry"
done
printf ']}\n'
REMOTE
}

if [[ "$ACTION" != "list" ]]; then
  printf '{"error":"invalid_action"}\n'
  exit 1
fi

TARGET="$(normalize_target "$TARGET")" || {
  printf '{"error":"invalid_path"}\n'
  exit 1
}

if node_is_local "$NODE"; then
  if [[ -f /.dockerenv ]]; then
    list_remote_ssh "$NODE" "$TARGET"
  else
    list_local "$TARGET"
  fi
else
  if ! command -v ssh >/dev/null 2>&1; then
    printf '{"error":"ssh_unavailable"}\n'
    exit 1
  fi
  list_remote_ssh "$NODE" "$TARGET"
fi
