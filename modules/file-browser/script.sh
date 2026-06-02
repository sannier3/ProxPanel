#!/usr/bin/env bash
# Opérations fichiers sur nœud PVE (list, read, write, mkdir, rm, mv).
# Usage: script.sh <action> <node> [args...]
#   write : stdin = contenu brut (ou base64 si 3e arg "b64")
set -euo pipefail

ACTION="${1:-}"
NODE="${2:-}"
shift 2 2>/dev/null || true
ARGS=("$@")

MAX_READ="${FE_MAX_READ:-2097152}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

fail() {
  printf '{"ok":false,"error":"%s"}\n' "$(json_escape "$1")"
  exit 1
}

ok_msg() {
  printf '{"ok":true%s}\n' "$1"
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

normalize_path() {
  local t="$1"
  if [[ "$t" != /* ]]; then t="/$t"; fi
  t="$(printf '%s' "$t" | sed 's|//|/|g')"
  if [[ "$t" != "/" ]]; then t="${t%/}"; fi
  if [[ "$t" == *".."* ]]; then return 1; fi
  printf '%s' "$t"
}

run_list() {
  local TARGET="$1"
  TARGET="$(normalize_path "$TARGET")" || fail "invalid_path"
  if [[ ! -e "$TARGET" ]]; then printf '{"ok":true,"entries":[]}\n'; return 0; fi
  if [[ ! -d "$TARGET" ]]; then
    local name size mtime
    name="$(basename "$TARGET")"
    size="$(stat -c '%s' "$TARGET" 2>/dev/null || echo 0)"
    mtime="$(stat -c '%Y' "$TARGET" 2>/dev/null || echo null)"
    printf '{"ok":true,"entries":[{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}]}\n' \
      "$(json_escape "$name")" "$(json_escape "$TARGET")" "$size" "$mtime"
    return 0
  fi
  printf '{"ok":true,"entries":['
  local FIRST=1 entry
  add_entry() {
    local entry_path="$1" name type size mtime esc_name esc_path
    name="$(basename "$entry_path")"
    [[ "$name" == "." || "$name" == ".." ]] && return 0
    if [[ -d "$entry_path" ]]; then type="dir"; size="null"; mtime="null"
    elif [[ -f "$entry_path" || -L "$entry_path" ]]; then
      type="file"
      size="$(stat -c '%s' "$entry_path" 2>/dev/null || echo 0)"
      mtime="$(stat -c '%Y' "$entry_path" 2>/dev/null || echo null)"
    else return 0; fi
    [[ "$FIRST" -eq 1 ]] && FIRST=0 || printf ','
    esc_name="$(json_escape "$name")"
    esc_path="$(json_escape "$entry_path")"
    if [[ "$type" == "dir" ]]; then
      printf '{"name":"%s","type":"dir","path":"%s","size":null,"mtime":null}' "$esc_name" "$esc_path"
    else
      printf '{"name":"%s","type":"file","path":"%s","size":%s,"mtime":%s}' "$esc_name" "$esc_path" "$size" "$mtime"
    fi
  }
  shopt -s nullglob dotglob 2>/dev/null || true
  for entry in "$TARGET"/* "$TARGET"/.[!.]* "$TARGET"/..?*; do
    [[ -e "$entry" ]] || continue
    add_entry "$entry"
  done
  printf ']}\n'
}

run_read() {
  local TARGET="$1"
  TARGET="$(normalize_path "$TARGET")" || fail "invalid_path"
  [[ -f "$TARGET" || -L "$TARGET" ]] || fail "not_a_file"
  local size
  size="$(stat -c '%s' "$TARGET" 2>/dev/null || echo 0)"
  if [[ "$size" -gt "$MAX_READ" ]]; then fail "file_too_large"; fi
  local b64
  b64="$(base64 -w0 "$TARGET" 2>/dev/null || base64 "$TARGET" | tr -d '\n')"
  printf '{"ok":true,"path":"%s","size":%s,"encoding":"base64","content":"%s"}\n' \
    "$(json_escape "$TARGET")" "$size" "$b64"
}

run_write() {
  local TARGET="$1"
  local MODE="${2:-raw}"
  TARGET="$(normalize_path "$TARGET")" || fail "invalid_path"
  local dir
  dir="$(dirname "$TARGET")"
  [[ -d "$dir" ]] || fail "parent_missing"
  if [[ "$MODE" == "b64" ]]; then
    base64 -d >"$TARGET"
  else
    cat >"$TARGET"
  fi
  ok_msg ',"path":"'"$(json_escape "$TARGET")"'"'
}

run_mkdir() {
  local TARGET="$1"
  TARGET="$(normalize_path "$TARGET")" || fail "invalid_path"
  mkdir -p "$TARGET"
  ok_msg ',"path":"'"$(json_escape "$TARGET")"'"'
}

run_rm() {
  local TARGET="$1"
  local REC="${2:-}"
  TARGET="$(normalize_path "$TARGET")" || fail "invalid_path"
  if [[ "$REC" == "-r" ]]; then
    rm -rf "$TARGET"
  else
    rm -f "$TARGET" 2>/dev/null || rmdir "$TARGET" 2>/dev/null || fail "rm_failed"
  fi
  ok_msg
}

run_mv() {
  local SRC="$1" DEST="$2"
  SRC="$(normalize_path "$SRC")" || fail "invalid_path"
  DEST="$(normalize_path "$DEST")" || fail "invalid_path"
  mv "$SRC" "$DEST"
  ok_msg ',"path":"'"$(json_escape "$DEST")"'"'
}

[[ -n "$ACTION" ]] || fail "invalid_action"

if ! node_is_local "$NODE"; then
  if [[ -f /.dockerenv ]]; then
    fail "node_mismatch"
  else
    if ! command -v ssh >/dev/null 2>&1; then fail "ssh_unavailable"; fi
    exec ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 \
      "root@${NODE}" "bash -s -- $(printf '%q ' "$ACTION" "$NODE" "${ARGS[@]}")" <"$0"
  fi
fi

case "$ACTION" in
  list) run_list "${ARGS[0]:-/}" ;;
  read) run_read "${ARGS[0]:-}" ;;
  write) run_write "${ARGS[0]:-}" "${ARGS[1]:-raw}" ;;
  mkdir) run_mkdir "${ARGS[0]:-}" ;;
  rm) run_rm "${ARGS[0]:-}" "${ARGS[1]:-}" ;;
  mv) run_mv "${ARGS[0]:-}" "${ARGS[1]:-}" ;;
  *) fail "invalid_action" ;;
esac
