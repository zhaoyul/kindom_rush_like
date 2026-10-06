#!/usr/bin/env python3
"""Generate bundled English MiMo battle barks; credentials never enter game assets.

Usage: python3 scripts/generate-voices.py --key-file /path/to/private-key --asr all --publish
Alternatively set MIMO_API_KEY. The script contacts only Xiaomi's official API.
Generation stages files under --work-dir; only --publish replaces the game bundle.
Requires Python 3, ffmpeg, ffprobe and the installed project's tsx binary.
"""
from __future__ import annotations

import argparse
import array
import base64
import concurrent.futures
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.xiaomimimo.com/v1"
PRINT_LOCK = threading.Lock()
STOP = threading.Event()


class OfficialRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, destination):
        target = urllib.parse.urlsplit(destination)
        if target.scheme != 'https' or target.netloc != 'api.xiaomimimo.com' or not target.path.startswith('/v1/'):
            raise RuntimeError('Refusing a redirect outside the official MiMo API')
        return super().redirect_request(request, response, code, message, headers, destination)


def log(message: str) -> None:
    with PRINT_LOCK:
        print(message, flush=True)


def write_manifest(path: Path, value: dict) -> None:
    temporary = path.with_suffix('.pending.json')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


class OfficialAPI:
    def __init__(self, key: str):
        self.key = key
        self.opener = urllib.request.build_opener(OfficialRedirects())

    def post(self, payload: dict) -> dict:
        for attempt in range(3):
            if STOP.is_set():
                raise RuntimeError("Generation stopped after an authorization or balance error")
            request = urllib.request.Request(
                API + "/chat/completions", data=json.dumps(payload).encode(),
                headers={"api-key": self.key, "Content-Type": "application/json"},
            )
            try:
                with self.opener.open(request, timeout=45) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                # Do not log headers, request bodies, data URLs or secret-bearing traces.
                detail = error.read().decode(errors="replace")[:400].replace(self.key, "[redacted]")
                if error.code in (401, 402, 403) or any(word in detail.lower() for word in ("insufficient", "balance", "quota exceeded")):
                    STOP.set()
                    raise RuntimeError(f"Official MiMo API refused the request (HTTP {error.code}): {detail}") from None
                if error.code in (429, 500, 502, 503, 504) and attempt < 2:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError(f"Official MiMo API error (HTTP {error.code}): {detail}") from None
        raise RuntimeError("Official MiMo API retries exhausted")


def config() -> dict:
    source = "import {UNIT_VOICES} from './src/voices.ts'; process.stdout.write(JSON.stringify(UNIT_VOICES));"
    return json.loads(subprocess.check_output([str(ROOT / "node_modules/.bin/tsx"), "-e", source], cwd=ROOT))


def probe(path: Path) -> float:
    result = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path),
    ]))
    return float(result["format"]["duration"])


def pcm_metrics(path: Path) -> dict:
    rate = 22050
    raw = subprocess.check_output(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(rate), "-"])
    samples = array.array("h", raw)
    if not samples:
        raise RuntimeError(f"No decoded speech in {path.name}")
    peak = max(abs(sample) for sample in samples) / 32768
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768
    frame = rate // 100
    energy = [math.sqrt(sum(sample * sample for sample in samples[index:index + frame]) / len(samples[index:index + frame])) / 32768
              for index in range(0, len(samples), frame)]
    audible = [index for index, value in enumerate(energy) if value > .006]
    if not audible or rms < .01 or peak >= .99:
        raise RuntimeError(f"Silent or clipped speech in {path.name}; peak={peak:.4f}, rms={rms:.4f}")
    return {"duration": round(probe(path), 4), "peak": round(peak, 5), "rms": round(rms, 5),
            "leadingQuietSeconds": round(audible[0] * frame / rate, 3),
            "trailingQuietSeconds": round((len(energy) - audible[-1] - 1) * frame / rate, 3),
            "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def compress(raw: Path, output: Path, work: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    trimmed = work / (raw.stem + ".normalized.wav")
    # Trim only the ends, preserving pauses between words. Leave breath/consonant margins.
    filters = ("silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB:start_silence=0.08,"
               "areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB:start_silence=0.12,"
               "areverse,highpass=f=65,loudnorm=I=-18:TP=-2.5:LRA=7")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", filters,
                    "-ac", "1", "-ar", "22050", str(trimmed)], check=True)
    duration = probe(trimmed)
    tempo = max(1.0, duration / 3.75)
    stages = []
    remaining = tempo
    while remaining > 2:
        stages.append('atempo=2'); remaining /= 2
    if tempo > 1:
        stages.append(f'atempo={remaining:.6f}')
    final_duration = duration / tempo
    fade = ','.join(stages + [f"afade=t=in:d=0.005,afade=t=out:st={max(0, final_duration - .008):.4f}:d=0.008"])
    temporary = output.with_suffix(".pending.mp3")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(trimmed), "-af", fade,
                    "-ac", "1", "-ar", "22050", "-b:a", "48k", str(temporary)], check=True)
    metrics = pcm_metrics(temporary)
    metrics['tempo'] = round(tempo, 5)
    if not .4 <= metrics["duration"] <= 4:
        raise RuntimeError(f"Unexpected battle bark duration: {raw.stem} {metrics['duration']}")
    temporary.replace(output)
    return metrics


def normalized_words(text: str) -> list[str]:
    # ASR occasionally prefixes its transcript with a language control tag.
    clean = re.sub(r"<[^>]*>", " ", text.lower()).replace("’", "'")
    clean = re.sub(r'/?think>', ' ', clean)
    clean = re.sub(r'(?<=[a-z])[-–](?=[a-z])', '', clean)
    # Spoken numbers may be formatted as digits; punctuated leading digits are ASR control prefixes.
    clean = re.sub(r'^\s*\d+[.,]\s*', '', clean)
    clean = re.sub(r'\b1\b(?=\s+[a-z])', 'one', clean)
    return re.findall(r"[a-z]+(?:'[a-z]+)?", clean)


def word_error(expected: str, actual: str) -> float:
    target, heard = normalized_words(expected), normalized_words(actual)
    previous = list(range(len(heard) + 1))
    for row, word in enumerate(target, 1):
        current = [row]
        for column, other in enumerate(heard, 1):
            current.append(min(current[-1] + 1, previous[column] + 1, previous[column - 1] + (word != other)))
        previous = current
    return round(previous[-1] / max(1, len(target)), 4)


def recognize(api: OfficialAPI, path: Path, expected: str) -> dict:
    data = base64.b64encode(path.read_bytes()).decode()
    result = api.post({"model": "mimo-v2.5-asr", "messages": [{"role": "user", "content": [{
        "type": "input_audio", "input_audio": {"data": "data:audio/mpeg;base64," + data},
    }]}], "asr_options": {"language": "en"}})
    transcript = result["choices"][0]["message"]["content"]
    return {"model": result.get("model", "mimo-v2.5-asr"), "transcript": transcript,
            "wordErrorRate": word_error(expected, transcript), "requestId": result.get("id")}


def generate_unit(api: OfficialAPI, unit_id: str, unit: dict, args: argparse.Namespace) -> dict:
    profile = unit["profile"]
    clips = []
    work = args.work_dir
    old_unit = args.old_units.get(unit_id, {})
    for index, line in enumerate(unit["lines"]):
        raw = work / f"{unit_id}-{index + 1}.wav"
        metadata_path = raw.with_suffix(".json")
        prior = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
        if f'{unit_id}:{index + 1}' in args.accept_transcript:
            old_lines = old_unit.get('lines', [])
            if len(old_lines) <= index or normalized_words(line['text']) != normalized_words(old_lines[index].get('asr', {}).get('transcript', '')):
                raise RuntimeError(f'{unit_id}:{index + 1} does not match the previously reviewed ASR transcript')
            prior['verifiedText'] = line['text']
            metadata_path.write_text(json.dumps(prior, ensure_ascii=False, indent=2) + '\n')
        output = args.bundle_dir / line["src"].lstrip("/")
        model = line["model"]
        prompt = profile["style"] + ' Speak only the supplied English sentence exactly once, as a concise battle bark. Use a brisk natural speaking pace, with no repeated words, no added words, and no lengthy pauses.'
        if index and profile["consistency"] == "self-reference":
            # The reference already supplies voice identity. Minimal direction avoids repetitive acting.
            prompt = ''
        should_retake = f'{unit_id}:{index + 1}' in args.retake or index > 0 and profile['consistency'] == 'self-reference' and f'{unit_id}:1' in args.retake
        reference_path = work / f'{unit_id}-1.wav' if model == 'mimo-v2.5-tts-voiceclone' else None
        reference_changed = reference_path is not None and prior.get('referenceSha256') != hashlib.sha256(reference_path.read_bytes()).hexdigest()
        if args.force or should_retake or reference_changed or not raw.exists() or prior.get('verifiedText', prior.get("text")) != line["text"]:
            audio = {"format": "wav"}
            reference = None
            if model == "mimo-v2.5-tts-voiceclone":
                reference = work / f"{unit_id}-1.wav"
                audio["voice"] = "data:audio/wav;base64," + base64.b64encode(reference.read_bytes()).decode()
            elif profile.get("preset"):
                audio["voice"] = profile["preset"]
            result = api.post({"model": model, "messages": [{"role": "user", "content": prompt},
                               {"role": "assistant", "content": line["text"]}], "audio": audio})
            raw.write_bytes(base64.b64decode(result["choices"][0]["message"]["audio"]["data"]))
            prior = {"model": result.get("model", model), "text": line["text"], "prompt": prompt,
                     "preset": profile.get("preset"), "requestId": result.get("id"), "usage": result.get("usage")}
            if reference:
                prior["referenceSha256"] = hashlib.sha256(reference.read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps(prior, ensure_ascii=False, indent=2) + "\n")
        if model == 'mimo-v2.5-tts-voiceclone' and 'referenceSha256' not in prior:
            prior['referenceSha256'] = hashlib.sha256((work / f'{unit_id}-1.wav').read_bytes()).hexdigest()
            metadata_path.write_text(json.dumps(prior, ensure_ascii=False, indent=2) + '\n')
        prior['sourceSha256'] = hashlib.sha256(raw.read_bytes()).hexdigest()
        metrics = compress(raw, output, work)
        clip = {**line, "duration": metrics['duration'], "generation": prior, "quality": metrics}
        old_lines = old_unit.get('lines', [])
        if len(old_lines) > index and old_lines[index].get('quality', {}).get('sha256') == metrics['sha256'] and 'asr' in old_lines[index]:
            clip['asr'] = old_lines[index]['asr']
            clip['asr']['wordErrorRate'] = word_error(line['text'], clip['asr']['transcript'])
        clips.append(clip)
        log(f"Generated {unit_id}-{index + 1}: {model}, {metrics['duration']:.2f}s, {metrics['bytes']} bytes")
    return {"name": unit["name"], "profile": profile, "lines": clips}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key-file", type=Path)
    parser.add_argument("--work-dir", type=Path, default=ROOT / "artifacts/mimo-voices-source")
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--asr", choices=("all", "sample", "none"), default="all")
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--retake", nargs="+", default=[], help="Regenerate selected line IDs such as soldier-3:2")
    parser.add_argument('--publish', action='store_true', help='Publish verified staged audio, manifest and duration metadata to the game')
    parser.add_argument('--accept-transcript', nargs='+', default=[], help='Align an approved line to its existing exact ASR transcript without regenerating speech')
    args = parser.parse_args()
    key = args.key_file.read_text().strip() if args.key_file else os.environ.get("MIMO_API_KEY", "").strip()
    if not key:
        parser.error("Provide --key-file or MIMO_API_KEY; the key is never stored in outputs")
    api = OfficialAPI(key)
    args.work_dir.mkdir(parents=True, exist_ok=True)
    args.bundle_dir = args.work_dir / 'bundle'
    units = config()
    selected = {key: unit for key, unit in units.items() if not args.only or key in args.only}
    if not selected:
        parser.error("No known units matched --only")
    destination = args.work_dir / 'manifest.json'
    existing = destination if destination.exists() else ROOT / 'public/voices/manifest.json'
    old = json.loads(existing.read_text()) if existing.exists() else {}
    args.old_units = json.loads(json.dumps(old.get('units', {})))
    manifest = {"version": 1, "provider": "Xiaomi MiMo", "language": "en", "subtitleLanguage": "zh-CN",
                "apiBase": API, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "ttsDocumentation": "https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/speech-synthesis-v2.5",
                "asrDocumentation": "https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/Speech-Recognition",
                "asrComparison": "Case/punctuation insensitive; remove ASR language/reasoning control tags, normalize hyphenated words and digit-one formatting. Raw transcripts are retained.",
                "units": old.get("units", {})}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 4))) as pool:
        jobs = {pool.submit(generate_unit, api, unit_id, unit, args): unit_id for unit_id, unit in selected.items()}
        failures = []
        for future in concurrent.futures.as_completed(jobs):
            unit_id = jobs[future]
            try:
                manifest["units"][unit_id] = future.result()
            except Exception as error:
                failures.append(f'{unit_id}: {error}')
                log(f'Failed {unit_id}: {error}')
                continue
            write_manifest(destination, manifest)
        if failures:
            raise RuntimeError('; '.join(failures))
    if args.asr != "none":
        representatives = {"hero", "soldier-3", "enemy-goblin", "enemy-golem"}
        targets = [(unit_id, line) for unit_id in selected for line in manifest["units"][unit_id]["lines"]
                   if (args.asr == "all" or unit_id in representatives) and 'asr' not in line]
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 4))) as pool:
            jobs = {pool.submit(recognize, api, args.bundle_dir / line["src"].lstrip("/"), line["text"]): (unit_id, line)
                    for unit_id, line in targets}
            for future in concurrent.futures.as_completed(jobs):
                unit_id, line = jobs[future]
                line["asr"] = future.result()
                log(f"ASR {unit_id}: WER={line['asr']['wordErrorRate']:.3f} {line['asr']['transcript'].strip()}")
                write_manifest(destination, manifest)
    clips = [line for unit in manifest["units"].values() for line in unit["lines"]]
    summary = {"units": len(manifest["units"]), "clips": len(clips), "bytes": sum(line["quality"]["bytes"] for line in clips),
               "durationSeconds": round(sum(line["quality"]["duration"] for line in clips), 3),
               "maxPeak": max(line["quality"]["peak"] for line in clips),
               "minRms": min(line["quality"]["rms"] for line in clips),
               "asrChecked": sum("asr" in line for line in clips),
               "asrExact": sum(line.get("asr", {}).get("wordErrorRate") == 0 for line in clips)}
    manifest["summary"] = summary
    write_manifest(destination, manifest)
    if args.publish:
        if len(manifest['units']) != len(units) or summary['clips'] != 42 or summary['asrChecked'] != 42:
            raise RuntimeError('All 42 lines must be generated and ASR-checked before publication')
        bad = [unit_id for unit_id, unit in manifest['units'].items() if any(line['asr']['wordErrorRate'] != 0 for line in unit['lines'])]
        if bad:
            raise RuntimeError('Speech needs review before publication: ' + ', '.join(bad))
        for unit in manifest['units'].values():
            for line in unit['lines']:
                source = args.bundle_dir / line['src'].lstrip('/')
                target = ROOT / 'public' / line['src'].lstrip('/')
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != line['quality']['sha256']:
                    shutil.copyfile(source, target)
        write_manifest(ROOT / 'public/voices/manifest.json', manifest)
        durations = {unit_id: [line['duration'] for line in unit['lines']] for unit_id, unit in manifest['units'].items()}
        code = '/** Generated from public/voices/manifest.json; run scripts/generate-voices.py to update. */\n'
        code += 'export const VOICE_DURATIONS: Readonly<Record<string, readonly number[]>> = '
        code += json.dumps(durations, ensure_ascii=False, indent=2, sort_keys=True) + ';\n'
        duration_path = ROOT / 'src/voice-durations.ts'
        if not duration_path.exists() or duration_path.read_text() != code:
            duration_path.write_text(code)
    log(json.dumps(summary))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"Voice generation stopped: {error}")
        raise SystemExit(1) from None
