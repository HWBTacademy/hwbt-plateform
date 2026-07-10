from pathlib import Path
import re
import subprocess
import sys

try:
    import imageio_ffmpeg
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "imageio-ffmpeg"], check=True)
    import imageio_ffmpeg

downloads = Path.home() / "Downloads"
reels = sorted(
    [p for p in downloads.glob("HWBT_reel_*.webm") if p.stat().st_size > 100_000],
    key=lambda p: p.stat().st_mtime,
    reverse=True,
)

if not reels:
    print("Aucun reel .webm valide trouve dans Downloads.")
    sys.exit(1)

src = reels[0]
safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "_", src.stem).strip("_")
out = downloads / f"{safe_name}_MP4_WHATSAPP.mp4"
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

cmd = [
    ffmpeg,
    "-y",
    "-i",
    str(src),
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "24",
    "-vf",
    "scale=720:1280:flags=lanczos",
    "-preset",
    "medium",
    "-crf",
    "24",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    str(out),
]

print(f"Conversion du dernier reel:\n{src}\n")
subprocess.run(cmd, check=True)
print(f"\nMP4 cree:\n{out}")
print(f"Taille: {out.stat().st_size / (1024 * 1024):.1f} Mo")
