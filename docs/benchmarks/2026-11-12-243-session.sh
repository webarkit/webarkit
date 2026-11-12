# shellcheck shell=bash
#
#  2026-11-12-243-session.sh
#  webarkit
#
#  This file is part of webarkit.
#
#  SPDX-License-Identifier: LGPL-3.0-or-later
#
#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Lesser General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Lesser General Public License for more details.
#
#  You should have received a copy of the GNU Lesser General Public License
#  along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#  Copyright 2026 WebARKit.
#
#  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
#
# M9's device-session driver (#252, #243): the runbook of
# docs/benchmarks/2026-11-10-243-registration.md ("The runbook", "Before each session" and "Each
# run, in order"), carried out one command per step, as admitted by
# docs/benchmarks/2026-11-12-243-registration-addendum-2.md. Sourced once, in Git Bash:
#
#     source docs/benchmarks/2026-11-12-243-session.sh <output folder> <serving checkout>
#
# then driven by run number only:
#
#     pronto         "Before each session": the ready check. Writes nothing but the session log.
#     inizia <n>     steps 1 to 3 of "Each run, in order" for run <n>
#     finisci <n>    steps 5 and 6 for run <n>
#     riapri <n>     step 4's remedy after a refused Start: the same URL opened again
#     chiudi-tab     closes the bench page's tabs in the tablet's Chrome, on confirmation (step 7)
#     stato          which runs are done, which is next, and what to do
#
# Each run's clip, export name, run-check form, export kind and URL come from the session table,
# docs/benchmarks/2026-11-12-243-session-table.json, never from anything typed. The output folder
# holds the exports and their three .txt files, the session log (m9-session.log) and the driver's
# own records (.state/); it must lie outside every git checkout. The exports are committed later,
# from another checkout. The serving checkout is the worktree detached at the freeze's head that
# serves the page ("Where `check:provenance` sits, and the serving checkout").
#
# What it never does: move, rename, delete or overwrite a file (it creates files, and appends to
# .clip.txt and the session log); start or stop anything on the host other than the adb forward it
# owns for Chrome's DevTools endpoint (tcp:<devtoolsPort>). Repairs are the agent's, never the
# operator's: when a run must be set aside, the agent moves the run's files and its .state/<n>.*
# records out of the output folder, and the run is begun again with inizia <n>.
#
# The variables M9_TABLE, M9_ADB, M9_ADB_LOG, M9_MONITOR and M9_RUNCHECK replace the defaults only
# when M9_TEST_SEAMS=1, for the tests (docs/benchmarks/2026-11-12-243-session.test.mjs, a fake adb
# and a fake DevTools endpoint); every line then says so.

m9__here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && { pwd -W 2>/dev/null || pwd; })"

# A path as the native programs read it: D:/… on Git Bash, unchanged elsewhere.
m9__native() { (cd "$1" 2>/dev/null && { pwd -W 2>/dev/null || pwd; }); }

# A refusal while sourcing, before the session log exists: the reason, and what to tell the agent.
m9__load_stop() {
    echo "STOP: $1"
    echo "  → Di' all'agente: \"STOP source: $1\". Non spostare, rinominare o cancellare alcun file."
    return 1
}

m9__load() {
    local out="$1" serve="$2" extra="$3" line kind a b c d e f g h i
    if [ -z "$EPOCHSECONDS" ] || [ "${BASH_VERSINFO[0]}" -lt 5 ]; then
        m9__load_stop "il driver vuole bash 5 o più recente (questa è $BASH_VERSION)"
        return 1
    fi
    if [ -z "$out" ] || [ -z "$serve" ] || [ -n "$extra" ]; then
        m9__load_stop "uso: source ${BASH_SOURCE[1]:-2026-11-12-243-session.sh} <cartella di uscita> <checkout di servizio>"
        return 1
    fi
    if [ -n "$M9_TEST_SEAMS" ] && [ "$M9_TEST_SEAMS" != 1 ]; then
        m9__load_stop "M9_TEST_SEAMS='$M9_TEST_SEAMS' non è né vuoto né 1"
        return 1
    fi
    M9_SEAMS=0
    [ "$M9_TEST_SEAMS" = 1 ] && M9_SEAMS=1
    local table="$m9__here/2026-11-12-243-session-table.json"
    M9_ADB_BIN=adb
    M9_MONITOR_JS="$m9__here/2026-11-11-243-link-monitor.mjs"
    if [ "$M9_SEAMS" = 1 ]; then
        table="${M9_TABLE:-$table}"
        M9_ADB_BIN="${M9_ADB:-adb}"
        M9_MONITOR_JS="${M9_MONITOR:-$M9_MONITOR_JS}"
    fi
    mkdir -p "$out" 2>/dev/null
    M9_OUT="$(m9__native "$out")"
    [ -n "$M9_OUT" ] || { m9__load_stop "la cartella di uscita '$out' non esiste e non si può creare"; return 1; }
    if git -C "$M9_OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        m9__load_stop "la cartella di uscita $M9_OUT è dentro un checkout git; deve stare fuori da ogni checkout"
        return 1
    fi
    M9_SERVE="$(m9__native "$serve")"
    if [ -z "$M9_SERVE" ] || ! git -C "$M9_SERVE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        m9__load_stop "il checkout di servizio '$serve' non è un checkout git"
        return 1
    fi
    M9_RUNCHECK_JS="$M9_SERVE/docs/benchmarks/2026-11-11-243-run-check.mjs"
    [ "$M9_SEAMS" = 1 ] && M9_RUNCHECK_JS="${M9_RUNCHECK:-$M9_RUNCHECK_JS}"
    M9_STATE="$M9_OUT/.state"
    M9_LOG="$M9_OUT/m9-session.log"
    # The adb server's log, where the link monitor reads it by default (%TEMP%\adb.log).
    M9_ADB_LOG_PATH="$(node -e 'console.log(require("path").join(process.env.TEMP ?? process.env.TMP ?? ".", "adb.log"))')"
    [ "$M9_SEAMS" = 1 ] && [ -n "$M9_ADB_LOG" ] && M9_ADB_LOG_PATH="$M9_ADB_LOG"
    M9_TABLE_PATH="$table"
    # The table, read once: one tab-separated line per record, every field checked non-empty.
    local parsed
    parsed="$(node -e '
        const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const out = [["meta", t.device.serial, t.device.model, t.port, t.devtoolsPort, t.freeze.head,
            t.freeze.bundleSha256, t.idleSeconds, t.quietMinutes, t.page]];
        for (const s of t.sessions) out.push(["session", s.name, s.from, s.to]);
        for (const r of t.runs) out.push(["run", r.run, r.clip, r.clipLabel, r.exportName, r.runCheckForm, r.exportKind, r.url]);
        for (const row of out) {
            if (row.some((v) => v === undefined || v === null || String(v) === "" || /[\t\n\r]/.test(String(v))))
                throw new Error("empty or malformed field in " + row[0] + " " + row[1]);
            console.log(row.join("\t"));
        }' "$table" 2>&1)" || { m9__load_stop "la tabella $table non si legge: $(printf '%s' "$parsed" | tail -n 1)"; return 1; }
    M9_SESSIONS=()
    M9_RUNS=()
    declare -gA M9_CLIP=() M9_LABEL=() M9_NAME=() M9_FORM=() M9_KIND=() M9_URL=() M9_SESSION_OF=()
    declare -gA M9_SFROM=() M9_STO=()
    while IFS=$'\t' read -r kind a b c d e f g h i; do
        case "$kind" in
            meta)
                M9_SERIAL=$a M9_MODEL=$b M9_PORT=$c M9_DTPORT=$d M9_HEAD=$e M9_BUNDLE=$f
                M9_IDLE_S=$g M9_QUIET_MIN=$h M9_PAGE=$i ;;
            session) M9_SESSIONS+=("$a"); M9_SFROM[$a]=$b; M9_STO[$a]=$c ;;
            run)
                M9_RUNS+=("$a"); M9_CLIP[$a]=$b; M9_LABEL[$a]=$c; M9_NAME[$a]=$d
                M9_FORM[$a]=$e; M9_KIND[$a]=$f; M9_URL[$a]=$g ;;
        esac
    done <<<"$parsed"
    local s n
    for s in "${M9_SESSIONS[@]}"; do
        for ((n = M9_SFROM[$s]; n <= M9_STO[$s]; n++)); do M9_SESSION_OF[$n]=$s; done
    done
    for n in "${M9_RUNS[@]}"; do
        [ -n "${M9_SESSION_OF[$n]}" ] || { m9__load_stop "il run $n della tabella non è in nessuna sessione"; return 1; }
        case "${M9_URL[$n]}" in *"'"* | *'"'* | *' '*) m9__load_stop "l'URL del run $n contiene un carattere non ammesso"; return 1 ;; esac
    done
    [ "${#M9_RUNS[@]}" -gt 0 ] && [ -n "$M9_SERIAL" ] && [ -n "$M9_PAGE" ] || { m9__load_stop "la tabella $table è vuota"; return 1; }
    return 0
}

# What ran: the driver, the table, the link monitor and the run check, by SHA-256. Logged at
# source time and by pronto, so that each session record can cite them (#252's review).
m9__hashes() {
    local f
    for f in "$m9__here/2026-11-12-243-session.sh" "$M9_TABLE_PATH" "$M9_MONITOR_JS" "$M9_RUNCHECK_JS"; do
        printf '%s %s\n' "$(sha256sum "$f" 2>/dev/null | cut -d' ' -f1)" "$f"
    done
}

m9__load "$@" || return 1 2>/dev/null || exit 1

# Bracketed paste off: Git Bash's paste left ^[[200~ and a trailing ~ on pasted lines (#252).
bind 'set enable-bracketed-paste off' 2>/dev/null

# ------------------------------------------------------------------------------------------------
# Output: one short line per step, in Italian, each also appended to the session log.
# ------------------------------------------------------------------------------------------------

m9__now() { TZ=UTC0 printf '%(%Y-%m-%dT%H:%M:%SZ)T' -1; }
m9__log() {
    local t
    TZ=UTC0 printf -v t '%(%Y-%m-%dT%H:%M:%SZ)T' -1
    printf '%s %s\n' "$t" "$*" >>"$M9_LOG"
}
m9__say() {
    if [ "$M9_SEAMS" = 1 ]; then echo "[prova] $*"; else echo "$*"; fi
    m9__log "$*"
}
# A refusal: the reason, and what to tell the agent. Never a file to touch.
m9__stop() {
    m9__say "STOP: $1"
    [ -n "$2" ] && m9__say "  $2"
    m9__say "  → Di' all'agente: \"STOP ${M9_CMD:-driver}: $1\". Non spostare, rinominare o cancellare alcun file."
    return 1
}

# ------------------------------------------------------------------------------------------------
# Writing: a new file, refused if it exists; or an append. Nothing else writes.
# ------------------------------------------------------------------------------------------------

m9__write_new() { # <path> <text>: the text and a line feed, into a file that must not exist
    [ -e "$1" ] && return 1
    (set -C && printf '%s\n' "$2" >"$1") 2>/dev/null
}
m9__write_new_lines() { # <path> <lines>: the lines as given (none: an empty file), into a file that must not exist
    [ -e "$1" ] && return 1
    if [ -z "$2" ]; then (set -C && : >"$1") 2>/dev/null; else m9__write_new "$1" "$2"; fi
}

# ------------------------------------------------------------------------------------------------
# The device, the tunnel, the tablet's exports.
# ------------------------------------------------------------------------------------------------

m9__adb() { MSYS_NO_PATHCONV=1 "$M9_ADB_BIN" -s "$M9_SERIAL" "$@" 2>&1 | tr -d '\r'; return "${PIPESTATUS[0]}"; }
m9__adb_any() { MSYS_NO_PATHCONV=1 "$M9_ADB_BIN" "$@" 2>&1 | tr -d '\r'; return "${PIPESTATUS[0]}"; }

m9__device_ok() { # the device's line in devices -l reads "device" and its model
    m9__adb_any devices -l | grep -E "^${M9_SERIAL}[[:space:]]+device[[:space:]].*model:${M9_MODEL}([[:space:]]|$)" >/dev/null
}
m9__tunnel_ok() { m9__adb reverse --list | grep -F "tcp:${M9_PORT} tcp:${M9_PORT}" >/dev/null; }
m9__tablet_list() { # the tablet's bench-nft exports, one per line, sorted
    local o
    o="$(m9__adb shell "ls /sdcard/Download/")" || return 1
    printf '%s\n' "$o" | grep -E '^bench-nft-.*\.json$' | LC_ALL=C sort
    return 0
}

# ------------------------------------------------------------------------------------------------
# The serving checkout: its HEAD, its bundle, its clean tree, check:provenance.
# ------------------------------------------------------------------------------------------------

m9__serve_head() { git -C "$M9_SERVE" rev-parse HEAD 2>/dev/null; }
m9__serve_bundle() { (cd "$M9_SERVE" && sha256sum examples/dist/webarkit-packages.mjs 2>/dev/null | cut -d' ' -f1); }
m9__serve_status() {
    git -C "$M9_SERVE" status --porcelain --untracked-files=all -- examples/bench-nft.html examples/js scripts packages package.json package-lock.json examples/targets/pinball.wnft examples/videos 2>&1
}
m9__serve_ok() { # HEAD, bundle and pathspec status, each refused by name
    local h b st
    h="$(m9__serve_head)"
    [ "$h" = "$M9_HEAD" ] || { m9__stop "il checkout di servizio è a ${h:-?}, non alla testa del freeze ${M9_HEAD:0:7}"; return 1; }
    b="$(m9__serve_bundle)"
    [ "$b" = "$M9_BUNDLE" ] || { m9__stop "il bundle del checkout di servizio è ${b:-assente}, non ${M9_BUNDLE:0:8}… del freeze"; return 1; }
    st="$(m9__serve_status)"
    [ -z "$st" ] || { m9__stop "il checkout di servizio non è pulito: $(printf '%s' "$st" | head -n 3 | tr '\n' ' ')"; return 1; }
    return 0
}

# ------------------------------------------------------------------------------------------------
# Chrome's DevTools endpoint on the tablet, through the one adb forward the driver owns.
# ------------------------------------------------------------------------------------------------

m9__dt_url() { printf 'http://127.0.0.1:%s%s' "$M9_DTPORT" "$1"; }
m9__dt_get() { curl -sf --max-time 5 "$(m9__dt_url "$1")"; }
M9_DT_OURS=""
m9__dt_open() { # checks that nothing else holds the socket, then forwards; sets M9_DT_WHY on refusal
    local fw other line unix conn
    M9_DT_WHY=""
    fw="$(m9__adb_any forward --list)"
    other="$(printf '%s\n' "$fw" | grep -F 'localabstract:chrome_devtools_remote' | grep -vxF "${M9_SERIAL} tcp:${M9_DTPORT} localabstract:chrome_devtools_remote")"
    if [ -n "$other" ]; then
        M9_DT_WHY="un altro inoltro tiene il socket DevTools del tablet: $(printf '%s' "$other" | head -n 1)"
        return 1
    fi
    if ! printf '%s\n' "$fw" | grep -qxF "${M9_SERIAL} tcp:${M9_DTPORT} localabstract:chrome_devtools_remote"; then
        if curl -s --max-time 2 -o /dev/null "$(m9__dt_url /json/version)"; then
            M9_DT_WHY="la porta locale tcp:${M9_DTPORT} è già usata da un altro programma"
            return 1
        fi
    fi
    unix="$(m9__adb shell "cat /proc/net/unix" 2>/dev/null)"
    if printf '%s\n' "$unix" | grep -q '@chrome_devtools_remote'; then
        # The listener reads state 01; every connected socket on it reads 03.
        conn="$(printf '%s\n' "$unix" | grep '@chrome_devtools_remote$' | awk '$6 == "03"' | wc -l | tr -d ' ')"
        if [ "${conn:-0}" -gt 0 ]; then
            M9_DT_WHY="sul tablet ${conn} client sono già collegati al socket DevTools (chrome://inspect sul PC?)"
            return 1
        fi
    fi
    m9__adb forward "tcp:${M9_DTPORT}" localabstract:chrome_devtools_remote >/dev/null || {
        M9_DT_WHY="adb forward tcp:${M9_DTPORT} non è riuscito"
        return 1
    }
    M9_DT_OURS=1
    return 0
}
m9__dt_close() {
    [ -n "$M9_DT_OURS" ] && m9__adb forward --remove "tcp:${M9_DTPORT}" >/dev/null 2>&1
    M9_DT_OURS=""
    return 0
}
# The bench page's tabs: "<id>\t<url>" per line. Fails when the list cannot be read.
m9__dt_bench_tabs() {
    local json
    json="$(m9__dt_get /json/list)" || return 1
    printf '%s' "$json" | node -e '
        let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
            const list = JSON.parse(s);
            if (!Array.isArray(list)) process.exit(3);
            for (const t of list) if (t.type === "page" && /\/examples\/bench-nft\.html(\?|$)/.test(t.url ?? ""))
                console.log(`${t.id}\t${t.url}`);
        });'
}
m9__dt_browser() { # the "Browser" of /json/version: the build chrome://version shows
    m9__dt_get /json/version | node -e '
        let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
            const v = JSON.parse(s).Browser; if (!v) process.exit(3); console.log(v); });' 2>/dev/null
}
m9__chrome_desktop_note() {
    command -v tasklist >/dev/null 2>&1 || return 0
    if tasklist //FI "IMAGENAME eq chrome.exe" 2>/dev/null | grep -qi '^chrome.exe'; then
        m9__say "  nota: Chrome è aperto sul PC; chrome://inspect e «Discover USB devices» devono restare chiusi"
    fi
}
# Refuses while a bench page is open in the tablet's Chrome, naming each tab.
m9__no_bench_tab() {
    local tabs
    m9__dt_open || { m9__stop "$M9_DT_WHY"; return 1; }
    tabs="$(m9__dt_bench_tabs)" || {
        m9__dt_close
        m9__stop "le schede di Chrome sul tablet non si leggono (DevTools: $(m9__dt_url /json/list))" "Se Chrome è chiuso sul tablet, aprilo; poi ripeti il comando"
        return 1
    }
    m9__dt_close
    if [ -n "$tabs" ]; then
        local t
        m9__stop "una pagina del banco è aperta nel Chrome del tablet" "Chiudila sul tablet, oppure scrivi: chiudi-tab"
        while IFS=$'\t' read -r id url; do m9__say "  scheda $id: $url"; done <<<"$tabs"
        return 1
    fi
    return 0
}

# ------------------------------------------------------------------------------------------------
# The adb server's log: the quiet minutes.
# ------------------------------------------------------------------------------------------------

m9__adb_epoch() { # "MM-DD HH:MM:SS.mmm …", the adb server's local time, as an epoch (0 if unreadable)
    local md="${1:0:5}" hms="${1:6:8}" e now year
    now=$EPOCHSECONDS; printf -v year '%(%Y)T' -1
    [[ "$md" =~ ^[0-9][0-9]-[0-9][0-9]$ && "$hms" =~ ^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]$ ]] || { echo 0; return; }
    e="$(date -d "$year-$md $hms" +%s 2>/dev/null)" || { echo 0; return; }
    [ "$e" -gt $((now + 86400)) ] && e="$(date -d "$((year - 1))-$md $hms" +%s)"
    echo "$e"
}
# Seconds since the link was last not quiet: the last `connection terminated` line naming the
# device, or the adb server's last start, whichever is later (a log begun less than the quiet time
# ago cannot attest it). Prints the epoch of that line, or 0 when neither is in the log.
m9__last_unquiet() {
    [ -f "$M9_ADB_LOG_PATH" ] || return 1
    local term start t_epoch=0 s_epoch=0
    term="$(grep -ai 'connection terminated' "$M9_ADB_LOG_PATH" | grep -aF "$M9_SERIAL" | tail -n 1 | tr -d '\r')"
    start="$(awk '/^--- adb starting/ { want = 1; next } want && /^[0-9][0-9]-[0-9][0-9] / { line = $0; want = 0 } END { print line }' "$M9_ADB_LOG_PATH" | tr -d '\r')"
    [ -n "$term" ] && t_epoch="$(m9__adb_epoch "$term")"
    [ -n "$start" ] && s_epoch="$(m9__adb_epoch "$start")"
    if [ "$t_epoch" -gt "$s_epoch" ]; then echo "$t_epoch"; else echo "$s_epoch"; fi
}
# Prints "<seconds still to wait>" (0 when quiet); fails when the log cannot be read.
m9__quiet_wait() {
    local last now need
    last="$(m9__last_unquiet)" || return 1
    now=$EPOCHSECONDS
    need=$((M9_QUIET_MIN * 60 - (now - last)))
    [ "$need" -lt 0 ] && need=0
    echo "$need"
}

# ------------------------------------------------------------------------------------------------
# Runs: the number, the files, the state.
# ------------------------------------------------------------------------------------------------

# The argument: one run number of the table, typed bare. Sets M9_N.
m9__arg() {
    local cmd="$1"
    shift
    M9_CMD="$cmd"
    if [ "$#" -ne 1 ]; then
        m9__stop "$cmd vuole un solo numero di run, non $# argomenti${*:+ ($*)}" "Scrivi per esempio: $cmd 1"
        return 1
    fi
    local a="$1"
    if [[ "$a" == *'~'* || "$a" == *$'\e'* || "$a" == *'[200'* || "$a" == *'[201'* ]]; then
        # The paste's markers out, then whatever is left, if it is a number: never a guess.
        local bare="${a//$'\e'/}"
        bare="${bare//\[200~/}"
        bare="${bare//\[201~/}"
        bare="${bare//\~/}"
        local hint="Digita il numero a mano, senza incollarlo"
        [[ "$bare" =~ ^[1-9][0-9]*$ ]] && hint+=": $cmd $bare"
        m9__stop "l'argomento '$(printf '%q' "$a")' contiene i caratteri dell'incolla (^[[200~ … ~)" "$hint"
        return 1
    fi
    if ! [[ "$a" =~ ^[1-9][0-9]*$ ]]; then
        m9__stop "'$a' non è un numero di run" "I run sono 1–${M9_RUNS[-1]}"
        return 1
    fi
    if [ -z "${M9_URL[$a]}" ]; then
        m9__stop "il run $a non è nella tabella (run 1–${M9_RUNS[-1]})"
        return 1
    fi
    M9_N="$a"
    M9_CMD="$cmd $a"
    return 0
}

m9__glob() { # every file of run <n> in the output folder, whatever its date
    local n="$1" pat
    pat="${M9_NAME[$n]/<date>/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]}"
    compgen -G "$M9_OUT/$pat.*" | LC_ALL=C sort
}
# The run's stem (its one date), or empty when it has no file. Fails on two dates.
m9__stem() {
    local n="$1" files stems
    files="$(m9__glob "$n")"
    [ -z "$files" ] && { echo ""; return 0; }
    stems="$(printf '%s\n' "$files" | sed -E 's/\.(json|url\.txt|clip\.txt|link\.txt)$//' | LC_ALL=C sort -u)"
    [ "$(printf '%s\n' "$stems" | wc -l | tr -d ' ')" = 1 ] || return 1
    case "${stems##*/}" in *.*) return 1 ;; esac
    echo "$stems"
}
m9__new_stem() { local d; TZ=UTC0 printf -v d '%(%Y-%m-%d)T' -1; echo "$M9_OUT/${M9_NAME[$1]/<date>/$d}"; }

m9__ended() { grep -q '^## verdict$' "$1" 2>/dev/null; }
m9__end_epoch() { # the link log's `## end` time
    local e
    e="$(sed -n 's/^## end \(.*\)$/\1/p' "$1" | head -n 1)"
    [ -n "$e" ] && date -u -d "$e" +%s 2>/dev/null
}
m9__clip_lines() { [ -f "$1" ] && wc -l <"$1" | tr -d ' ' || echo 0; }
m9__check_exit() { sed -n 's/^exit \([0-9]*\)$/\1/p' "$M9_STATE/$1.runcheck" 2>/dev/null | tail -n 1; }

# One word for run <n>: nuovo, avviato, finito-male, completo, confuso
m9__state() {
    local n="$1" s
    s="$(m9__stem "$n")" || { echo confuso; return; }
    [ -z "$s" ] && { compgen -G "$M9_STATE/$n.*" >/dev/null && echo confuso || echo nuovo; return; }
    if [ -f "$s.link.txt" ] && ! m9__ended "$s.link.txt"; then
        [ -e "$s.json" ] && echo confuso || echo avviato
        return
    fi
    if [ -f "$s.json" ] && [ -f "$s.url.txt" ] && [ "$(m9__clip_lines "$s.clip.txt")" = 2 ] && m9__ended "$s.link.txt" &&
        grep -qx 'no drop: true' "$s.link.txt" && [ "$(m9__check_exit "$n")" = 0 ]; then
        echo completo
        return
    fi
    echo finito-male
}

# ------------------------------------------------------------------------------------------------
# The clip's reading and the URL: the runbook's step 2 and step 3, the addendum's command.
# ------------------------------------------------------------------------------------------------

m9__read_clip() { # <stem> <clip>: one line, appended, the first addendum's entry 2
    local stem="$1" clip="$2"
    [ -f "$M9_SERVE/examples/videos/$clip" ] || return 1
    (cd "$M9_SERVE" && printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(sha256sum "examples/videos/$clip" | cut -d' ' -f1)" "examples/videos/$clip") >>"$stem.clip.txt"
}
m9__open_url() { m9__adb shell "am start -a android.intent.action.VIEW -d '$1' com.android.chrome"; }

# ================================================================================================
# The commands.
# ================================================================================================

pronto() {
    M9_CMD=pronto
    bind 'set enable-bracketed-paste off' 2>/dev/null
    if [ "$#" -ne 0 ]; then m9__stop "pronto non vuole argomenti"; return 1; fi
    local bad=0 h b st prov cc tabs wait_s build src ver
    m9__say "pronto: dispositivo $M9_SERIAL ($M9_MODEL), checkout di servizio $M9_SERVE, uscita $M9_OUT"
    local hh hf
    while read -r hh hf; do m9__say "    sha256 ${hh:-assente} ${hf##*/}"; done < <(m9__hashes)
    h="$(m9__serve_head)"
    if [ "$h" = "$M9_HEAD" ]; then m9__say "OK  HEAD del checkout di servizio = testa del freeze ${M9_HEAD:0:7}"
    else m9__say "NO  HEAD del checkout di servizio è ${h:-?}, non ${M9_HEAD:0:7}"; bad=$((bad + 1)); fi
    b="$(m9__serve_bundle)"
    if [ "$b" = "$M9_BUNDLE" ]; then m9__say "OK  bundle ${M9_BUNDLE:0:8}… = freeze"
    else m9__say "NO  bundle ${b:-assente}, non ${M9_BUNDLE:0:8}…"; bad=$((bad + 1)); fi
    st="$(m9__serve_status)"
    if [ -z "$st" ]; then m9__say "OK  git status sul pathspec del runbook: vuoto"
    else m9__say "NO  git status sul pathspec: $(printf '%s' "$st" | head -n 3 | tr '\n' ' ')"; bad=$((bad + 1)); fi
    prov="$(cd "$M9_SERVE" && node scripts/provenance-preflight.mjs 2>&1)"
    if [ $? -eq 0 ]; then m9__say "OK  check:provenance, exit 0"
    else m9__say "NO  check:provenance: $(printf '%s' "$prov" | head -n 2 | tr '\n' ' ')"; bad=$((bad + 1)); fi
    cc="$(curl -sI --max-time 5 "http://localhost:${M9_PORT}/examples/js/bench-metrics.mjs" | tr -d '\r' | grep -i '^cache-control:')"
    if printf '%s' "$cc" | grep -qi 'no-store'; then m9__say "OK  ${cc}"
    else m9__say "NO  il server non manda no-store (${cc:-nessuna risposta su localhost:$M9_PORT})"; bad=$((bad + 1)); fi
    if m9__device_ok; then m9__say "OK  dispositivo $M9_SERIAL collegato, modello $M9_MODEL"
    else m9__say "NO  dispositivo $M9_SERIAL ($M9_MODEL) non è «device» in adb devices -l"; bad=$((bad + 1)); fi
    if m9__tunnel_ok; then m9__say "OK  tunnel tcp:$M9_PORT tcp:$M9_PORT"
    else m9__say "NO  tunnel tcp:$M9_PORT assente (adb reverse --list)"; bad=$((bad + 1)); fi
    local list
    if list="$(m9__tablet_list)"; then
        if [ -z "$list" ]; then m9__say "OK  nessun bench-nft-*.json nei Download del tablet"
        else m9__say "NO  sul tablet ci sono già esportazioni: $(printf '%s' "$list" | tr '\n' ' ')"; bad=$((bad + 1)); fi
    else m9__say "NO  i Download del tablet non si leggono"; bad=$((bad + 1)); fi
    if wait_s="$(m9__quiet_wait)"; then
        if [ "$wait_s" = 0 ]; then m9__say "OK  collegamento quieto da almeno $M9_QUIET_MIN minuti (adb.log)"
        else m9__say "NO  collegamento non quieto: attendi ancora $(((wait_s + 59) / 60)) min ($wait_s s)"; bad=$((bad + 1)); fi
    else m9__say "NO  adb.log non si legge: $M9_ADB_LOG_PATH"; bad=$((bad + 1)); fi
    build="" src=""
    if m9__dt_open; then
        build="$(m9__dt_browser)" && src="DevTools /json/version, la build di chrome://version"
        if tabs="$(m9__dt_bench_tabs)"; then
            if [ -z "$tabs" ]; then m9__say "OK  nessuna pagina del banco aperta nel Chrome del tablet"
            else m9__say "NO  pagine del banco aperte: $(printf '%s' "$tabs" | cut -f1 | tr '\n' ' ')(chiudi-tab)"; bad=$((bad + 1)); fi
        else m9__say "NO  le schede di Chrome sul tablet non si leggono (Chrome è aperto sul tablet?)"; bad=$((bad + 1)); fi
        m9__dt_close
    else
        m9__say "NO  DevTools: $M9_DT_WHY"
        bad=$((bad + 1))
    fi
    if [ -z "$build" ]; then
        ver="$(m9__adb shell "dumpsys package com.android.chrome" | sed -n 's/^ *versionName=//p' | head -n 1)"
        [ -n "$ver" ] && build="$ver" && src="package manager, versionName (chrome://version non raggiungibile)"
    fi
    if [ -n "$build" ]; then m9__say "OK  Chrome sul tablet: $build (fonte: $src)"
    else m9__say "NO  la build di Chrome non si legge, né da DevTools né dal package manager"; bad=$((bad + 1)); fi
    m9__chrome_desktop_note
    m9__say "A MANO  sul tablet: svuota i file in cache di Chrome (runbook, item 4); il driver non lo vede"
    if [ "$bad" -eq 0 ]; then
        m9__say "PRONTO OK"
        return 0
    fi
    m9__stop "$bad controlli non superati"
}

inizia() {
    m9__arg inizia "$@" || return 1
    bind 'set enable-bracketed-paste off' 2>/dev/null
    local n="$M9_N" f s p p_state p_stem p_end age stem sess first ok_line ok_epoch wait_s
    sess="${M9_SESSION_OF[$n]}"
    first="${M9_SFROM[$sess]}"
    s="$(m9__stem "$n")" || { m9__stop "il run $n ha file con date diverse"; return 1; }
    if [ -n "$s" ]; then
        m9__stop "il run $n ha già i suoi file: $(m9__glob "$n" | sed 's#.*/##' | tr '\n' ' ')"
        return 1
    fi
    if compgen -G "$M9_STATE/$n.*" >/dev/null; then
        m9__stop "il run $n ha già i suoi record in .state: $(compgen -G "$M9_STATE/$n.*" | sed 's#.*/##' | tr '\n' ' ')"
        return 1
    fi
    for f in "$M9_OUT"/*.link.txt; do
        [ -e "$f" ] || continue
        m9__ended "$f" || { m9__stop "${f##*/} è iniziato e non finito" "Se è il run in corso, completa quello con finisci"; return 1; }
    done
    if [ "$n" -eq "$first" ]; then
        # The session's first run: the ready check passed in this output folder within the hour.
        ok_line="$(grep -a ' PRONTO OK$' "$M9_LOG" 2>/dev/null | tail -n 1)"
        ok_epoch="$( [ -n "$ok_line" ] && date -u -d "${ok_line%% *}" +%s 2>/dev/null || echo 0)"
        if [ $((EPOCHSECONDS - ok_epoch)) -gt 3600 ]; then
            m9__stop "il run $n apre la sessione $sess: prima serve pronto, superato nell'ultima ora" "Scrivi: pronto"
            return 1
        fi
        wait_s="$(m9__quiet_wait)" || { m9__stop "adb.log non si legge: $M9_ADB_LOG_PATH"; return 1; }
        [ "$wait_s" = 0 ] || { m9__stop "collegamento non quieto: attendi ancora $(((wait_s + 59) / 60)) min" "Poi: inizia $n"; return 1; }
    else
        p=$((n - 1))
        p_state="$(m9__state "$p")"
        if [ "$p_state" != completo ]; then
            m9__stop "il run $p (${M9_LABEL[$p]}) non è completo: $p_state" "Prima il run $p (scrivi: stato)"
            return 1
        fi
        p_stem="$(m9__stem "$p")"
        p_end="$(m9__end_epoch "$p_stem.link.txt")"
        age=$((EPOCHSECONDS - ${p_end:-0}))
        if [ "$age" -lt "$M9_IDLE_S" ]; then
            m9__stop "il run $p è finito $age s fa; attendi ancora $((M9_IDLE_S - age)) s (passo 7)" "Poi: inizia $n"
            return 1
        fi
    fi
    m9__serve_ok || return 1
    m9__device_ok || { m9__stop "il dispositivo $M9_SERIAL ($M9_MODEL) non è collegato come «device»"; return 1; }
    m9__tunnel_ok || { m9__stop "il tunnel tcp:$M9_PORT manca (adb reverse --list)"; return 1; }
    m9__say "1. tunnel tcp:$M9_PORT presente"
    m9__no_bench_tab || return 1
    m9__say "   nessuna pagina del banco aperta nel Chrome del tablet"
    local before
    before="$(m9__tablet_list)" || { m9__stop "i Download del tablet non si leggono"; return 1; }
    mkdir -p "$M9_STATE" 2>/dev/null
    m9__write_new_lines "$M9_STATE/$n.before" "$before" || {
        m9__stop "la lista delle esportazioni sul tablet non si scrive (.state/$n.before)"
        return 1
    }
    stem="$(m9__new_stem "$n")"
    if ! node "$M9_MONITOR_JS" begin --adb-log "$M9_ADB_LOG_PATH" "$stem.link.txt" >>"$M9_LOG" 2>&1; then
        m9__stop "il monitor del collegamento non è partito (${stem##*/}.link.txt)"
        return 1
    fi
    m9__say "2. monitor del collegamento iniziato: ${stem##*/}.link.txt"
    m9__read_clip "$stem" "${M9_CLIP[$n]}" || { m9__stop "la lettura della clip non è riuscita"; return 1; }
    m9__say "   clip ${M9_CLIP[$n]} letta in ${stem##*/}.clip.txt"
    m9__write_new "$stem.url.txt" "${M9_URL[$n]}" || { m9__stop "${stem##*/}.url.txt non si scrive"; return 1; }
    m9__open_url "${M9_URL[$n]}" >>"$M9_LOG" 2>&1 || { m9__stop "adb am start non è riuscito"; return 1; }
    m9__say "3. URL aperto sul tablet: run=$n, clip=${M9_CLIP[$n]}"
    m9__say "4. Sul tablet: etichetta $M9_MODEL, Start, pagina in primo piano fino a «done», poi Download JSON."
    m9__say "   Poi scrivi: finisci $n"
}

riapri() {
    m9__arg riapri "$@" || return 1
    local n="$M9_N" st s
    st="$(m9__state "$n")"
    [ "$st" = avviato ] || { m9__stop "il run $n non è in corso (stato: $st)"; return 1; }
    s="$(m9__stem "$n")"
    [ "$(m9__clip_lines "$s.clip.txt")" = 1 ] && [ -f "$s.url.txt" ] && [ -f "$M9_STATE/$n.before" ] ||
        { m9__stop "il run $n non ha la lettura della clip, l'URL o la lista delle esportazioni di inizia"; return 1; }
    m9__serve_ok || return 1
    m9__device_ok || { m9__stop "il dispositivo $M9_SERIAL ($M9_MODEL) non è collegato come «device»"; return 1; }
    m9__tunnel_ok || { m9__stop "il tunnel tcp:$M9_PORT manca (adb reverse --list)"; return 1; }
    m9__no_bench_tab || return 1
    m9__open_url "${M9_URL[$n]}" >>"$M9_LOG" 2>&1 || { m9__stop "adb am start non è riuscito"; return 1; }
    m9__say "URL del run $n riaperto. Sul tablet: etichetta $M9_MODEL, Start, «done», Download JSON. Poi: finisci $n"
}

finisci() {
    m9__arg finisci "$@" || return 1
    local n="$M9_N" s st new count f th lh noDrop rc other
    s="$(m9__stem "$n")" || { m9__stop "il run $n ha file con date diverse"; return 1; }
    st="$(m9__state "$n")"
    if [ "$st" != avviato ]; then
        other=""
        for f in "$M9_OUT"/*.link.txt; do
            [ -e "$f" ] && ! m9__ended "$f" && other="${f##*/}"
        done
        case "$st" in
            nuovo) m9__stop "il run $n non è stato avviato con inizia $n${other:+; è in corso ${other%.link.txt}}" ;;
            *) m9__stop "il run $n non è in corso (stato: $st)${other:+; è in corso ${other%.link.txt}}" ;;
        esac
        return 1
    fi
    [ "$(m9__clip_lines "$s.clip.txt")" = 1 ] && [ -f "$s.url.txt" ] || { m9__stop "il run $n non ha la lettura della clip o l'URL di inizia"; return 1; }
    [ -f "$M9_STATE/$n.before" ] || { m9__stop "manca la lista delle esportazioni presa a inizia $n (.state/$n.before)"; return 1; }
    local now_list
    now_list="$(m9__tablet_list)" || { m9__stop "i Download del tablet non si leggono"; return 1; }
    new="$(printf '%s\n' "$now_list" | grep . | LC_ALL=C comm -13 "$M9_STATE/$n.before" -)"
    count="$(printf '%s' "$new" | grep -c .)"
    if [ "$count" -eq 0 ]; then
        m9__stop "nessuna nuova esportazione sul tablet da inizia $n" "Se la pagina mostra «done», premi Download JSON e scrivi di nuovo: finisci $n"
        return 1
    fi
    if [ "$count" -ne 1 ]; then
        m9__stop "$count nuove esportazioni sul tablet da inizia $n, non una: $(printf '%s' "$new" | tr '\n' ' ')"
        return 1
    fi
    f="$new"
    case "$f" in
        "bench-nft-${M9_KIND[$n]}-"*) ;;
        *) m9__stop "la nuova esportazione $f non è di tipo ${M9_KIND[$n]}"; return 1 ;;
    esac
    m9__say "5. esportazione sul tablet: $f"
    [ -e "$s.json" ] && { m9__stop "${s##*/}.json esiste già"; return 1; }
    m9__adb pull "/sdcard/Download/$f" "$s.json" >>"$M9_LOG" 2>&1 || { m9__stop "adb pull non è riuscito"; return 1; }
    th="$(m9__adb shell "sha256sum /sdcard/Download/$f" | cut -d' ' -f1)"
    lh="$(sha256sum "$s.json" | cut -d' ' -f1)"
    if [ -z "$th" ] || [ "$th" != "$lh" ]; then
        m9__stop "lo SHA-256 dell'esportazione scaricata (${lh:0:16}) non è quello del tablet (${th:-?})"
        return 1
    fi
    m9__say "   scaricata in ${s##*/}.json, SHA-256 ${lh:0:16}… uguale al tablet"
    m9__read_clip "$s" "${M9_CLIP[$n]}" || { m9__stop "la seconda lettura della clip non è riuscita"; return 1; }
    m9__say "   clip ${M9_CLIP[$n]} letta di nuovo"
    node "$M9_MONITOR_JS" end --adb-log "$M9_ADB_LOG_PATH" "$s.link.txt" >>"$M9_LOG" 2>&1
    rc=$?
    noDrop="$(sed -n 's/^no drop: //p' "$s.link.txt" | tail -n 1)"
    m9__say "   monitor del collegamento finito: no drop: ${noDrop:-?}"
    local out
    out="$(node "$M9_RUNCHECK_JS" --manifest "$M9_SERVE/examples/dist/provenance.json" --form "${M9_FORM[$n]}" "$s.json" 2>&1)"
    local check=$?
    mkdir -p "$M9_STATE" 2>/dev/null
    m9__log "run check del run $n:"$'\n'"$out"
    m9__say "6. run check: $(printf '%s\n' "$out" | grep -E '^V[0-9]+ ' | tr '\n' ' ')exit $check"
    if ! m9__write_new "$M9_STATE/$n.runcheck" "$out"$'\n'"exit $check"; then
        m9__stop "il risultato del run check non si scrive in .state/$n.runcheck (esiste già?)"
        return 1
    fi
    if [ "$rc" -ne 0 ] || [ "$noDrop" != true ]; then
        m9__stop "il run $n ha un calo del collegamento (no drop: ${noDrop:-?}); vale la regola di arresto"
        return 1
    fi
    if [ "$check" -ne 0 ]; then
        m9__stop "il run $n non supera il run check (exit $check); vale la regola di arresto"
        return 1
    fi
    local next=$((n + 1)) at
    at="$(date -u -d "@$(($(m9__end_epoch "$s.link.txt") + M9_IDLE_S))" +%H:%M:%SZ)"
    m9__say "run $n completo."
    if [ -n "${M9_URL[$next]}" ] && [ "${M9_SESSION_OF[$next]}" = "${M9_SESSION_OF[$n]}" ]; then
        m9__say "7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab), poi inizia $next dalle $at."
    else
        m9__say "7. Chiudi la scheda del run sul tablet (o scrivi: chiudi-tab). Fine della sessione ${M9_SESSION_OF[$n]}."
    fi
}

chiudi-tab() {
    M9_CMD=chiudi-tab
    [ "$#" -eq 0 ] || { m9__stop "chiudi-tab non vuole argomenti"; return 1; }
    local tabs id url ans left
    m9__dt_open || { m9__stop "$M9_DT_WHY"; return 1; }
    tabs="$(m9__dt_bench_tabs)" || { m9__dt_close; m9__stop "le schede di Chrome sul tablet non si leggono"; return 1; }
    if [ -z "$tabs" ]; then
        m9__dt_close
        m9__say "nessuna pagina del banco aperta nel Chrome del tablet"
        return 0
    fi
    while IFS=$'\t' read -r id url; do m9__say "scheda $id: $url"; done <<<"$tabs"
    printf 'Chiudere queste %s schede del banco? Scrivi si per confermare: ' "$(printf '%s\n' "$tabs" | wc -l | tr -d ' ')"
    read -r ans
    if [ "$ans" != si ]; then
        m9__dt_close
        m9__say "nessuna scheda chiusa (risposta: '${ans}')"
        return 1
    fi
    while IFS=$'\t' read -r id url; do
        m9__dt_get "/json/close/$id" >/dev/null && m9__say "chiusa la scheda $id" || m9__say "la scheda $id non si chiude"
    done <<<"$tabs"
    left="$(m9__dt_bench_tabs)"
    m9__dt_close
    if [ -n "$left" ]; then m9__stop "restano schede del banco aperte: $(printf '%s' "$left" | cut -f1 | tr '\n' ' ')"; return 1; fi
    m9__say "nessuna pagina del banco resta aperta"
}

stato() {
    M9_CMD=stato
    local n st done_list="" bad="" cur="" next="" s sess p_stem age
    for n in "${M9_RUNS[@]}"; do
        st="$(m9__state "$n")"
        case "$st" in
            completo) done_list+="$n " ;;
            avviato) cur="$n" ;;
            finito-male | confuso) bad+="$n($st) " ;;
            nuovo) [ -z "$next" ] && next="$n" ;;
        esac
    done
    m9__say "completi: ${done_list:-nessuno}"
    [ -n "$bad" ] && m9__say "da riparare (dall'agente): $bad"
    if [ -n "$cur" ]; then
        m9__say "in corso: run $cur (${M9_LABEL[$cur]}). Sul tablet: Start, «done», Download JSON; poi: finisci $cur"
        return 0
    fi
    if [ -n "$bad" ]; then
        m9__say "prossimo passo: di' all'agente quali run sono da riparare; non toccare i file"
        return 0
    fi
    [ -z "$next" ] && { m9__say "tutti i run della tabella sono completi"; return 0; }
    sess="${M9_SESSION_OF[$next]}"
    if [ "$next" -eq "${M9_SFROM[$sess]}" ]; then
        m9__say "prossimo: run $next, il primo della sessione $sess. Scrivi: pronto, poi inizia $next"
        return 0
    fi
    p_stem="$(m9__stem $((next - 1)))"
    age=$((EPOCHSECONDS - $(m9__end_epoch "$p_stem.link.txt")))
    if [ "$age" -lt "$M9_IDLE_S" ]; then
        m9__say "prossimo: run $next (${M9_LABEL[$next]}), tra $((M9_IDLE_S - age)) s. Chiudi la scheda del run $((next - 1)), poi: inizia $next"
    else
        m9__say "prossimo: run $next (${M9_LABEL[$next]}). Scrivi: inizia $next"
    fi
}

m9__say "driver M9 caricato: $M9_SERIAL ($M9_MODEL), ${#M9_RUNS[@]} run, uscita $M9_OUT. Comandi: pronto, inizia N, finisci N, riapri N, chiudi-tab, stato"
while read -r m9__h m9__f; do m9__log "sha256 ${m9__h:-assente} $m9__f"; done < <(m9__hashes)
