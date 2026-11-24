"""Stage a relocatable SVN runtime from an installed Homebrew Subversion bottle."""

import shutil
import subprocess
import sys
from pathlib import Path


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def dependencies(binary):
    lines = run("otool", "-L", binary).splitlines()[1:]
    install_id = run("otool", "-D", binary).splitlines()[1:2]
    for line in lines:
        name = line.strip().split(" (compatibility version ", 1)[0]
        if name not in install_id and not name.startswith(("/usr/lib/", "/System/Library/")):
            yield name


def stage(source, destination, cellar):
    destination.mkdir()
    licenses = destination / "licenses"
    licenses.mkdir()
    libraries = {}
    formulae = set()

    def copy_binary(source, target):
        source = source.resolve(strict=True)
        relative = source.relative_to(cellar)
        formulae.add(cellar / relative.parts[0] / relative.parts[1])
        shutil.copyfile(source, target)
        target.chmod(0o755)
        return source

    def relocate(source, target):
        for name in dependencies(source):
            library = Path(name)
            if not library.is_absolute():
                raise ValueError(f"Unsupported dependency {name} in {source}")
            resolved = library.resolve(strict=True)
            previous = libraries.get(library.name)
            if previous is None:
                libraries[library.name] = resolved
                copied = destination / library.name
                copy_binary(resolved, copied)
                run("install_name_tool", "-id", f"@loader_path/{library.name}", copied)
                relocate(resolved, copied)
            elif previous != resolved:
                raise ValueError(f"Conflicting libraries named {library.name}")
            run("install_name_tool", "-change", name, f"@loader_path/{library.name}", target)
        run("codesign", "--force", "--sign", "-", target)

    binary = destination / "svn-bin"
    relocate(copy_binary(source, binary), binary)
    # The Homebrew OpenSSL build has a machine-specific default CA path.
    svn = destination / "svn"
    svn.write_text(
        """#!/bin/sh
if [ -z "${SSL_CERT_FILE+x}" ] && [ -z "${SSL_CERT_DIR+x}" ] && [ -r /etc/ssl/cert.pem ]; then
    export SSL_CERT_FILE=/etc/ssl/cert.pem
fi
exec "${0%/*}/svn-bin" "$@"
""",
        encoding="utf-8",
    )
    svn.chmod(0o755)
    for formula in sorted(formulae):
        notices = [
            file for file in formula.iterdir()
            if file.is_file() and file.name.upper().startswith(("LICENSE", "COPYING", "NOTICE"))
        ]
        if not notices:
            raise ValueError(f"No license found in {formula}")
        for file in notices:
            shutil.copyfile(file, licenses / f"{formula.parent.name}-{file.name}")
        sbom = formula / "sbom.spdx.json"
        if sbom.is_file():
            shutil.copyfile(sbom, licenses / f"{formula.parent.name}-sbom.spdx.json")

    print(run(svn, "--version", "--quiet"))


if __name__ == "__main__":
    if sys.platform != "darwin" or len(sys.argv) != 2:
        sys.exit("Usage on macOS: python3 scripts/stage-macos-svn.py <new-output-directory>")
    cellar = Path(run("brew", "--cellar")).resolve()
    source = Path(run("brew", "--prefix", "subversion")) / "bin/svn"
    destination = Path(sys.argv[1]).resolve()
    if destination.exists():
        sys.exit(f"Output already exists: {destination}")
    stage(source, destination, cellar)
