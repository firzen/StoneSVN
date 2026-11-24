"""Stage a relocatable SVN runtime from the Ubuntu Subversion package."""

import shutil
import subprocess
import sys
from pathlib import Path


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def stage(destination):
    source = Path("/usr/bin/svn")
    destination.mkdir()
    licenses = destination / "licenses"
    licenses.mkdir()
    client = destination / "svn"
    shutil.copy2(source, client)
    files = [client]
    packages = {"subversion"}

    # Use the host loader and glibc, including its NSS modules.
    for line in run("ldd", source).splitlines():
        name, separator, resolved = line.strip().partition(" => ")
        if not separator:
            continue
        if resolved == "not found":
            raise ValueError(f"Missing dependency {name}")
        library = Path(resolved.split(" (", 1)[0])
        # Ubuntu may report a different path for files on merged-/usr hosts.
        owner = subprocess.run(["dpkg-query", "-S", library], text=True, capture_output=True)
        if owner.returncode:
            alternate = str(library).removeprefix("/usr") if str(library).startswith("/usr/") else f"/usr{library}"
            owner = subprocess.run(["dpkg-query", "-S", alternate], text=True, capture_output=True, check=True)
        package = owner.stdout.split(": ", 1)[0].split(":", 1)[0]
        if package == "libc6":
            continue
        packages.add(package)
        target = destination / name
        shutil.copy2(library, target)
        files.append(target)

    for binary in files:
        run("patchelf", "--force-rpath", "--set-rpath", "$ORIGIN", binary)

    for package in sorted(packages):
        copyright_file = Path("/usr/share/doc") / package / "copyright"
        shutil.copyfile(copyright_file, licenses / f"{package}-copyright")
    versions = run("dpkg-query", "-W", "-f=${Package} ${Version}\n", *sorted(packages))
    (licenses / "ubuntu-packages.txt").write_text(versions + "\n", encoding="utf-8")
    print(run(client, "--version", "--quiet"))


if __name__ == "__main__":
    if sys.platform != "linux" or len(sys.argv) != 2:
        sys.exit("Usage on Ubuntu: python3 scripts/stage-linux-svn.py <new-output-directory>")
    destination = Path(sys.argv[1]).resolve()
    if destination.exists():
        sys.exit(f"Output already exists: {destination}")
    stage(destination)
